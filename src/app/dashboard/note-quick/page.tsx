'use client';

// 228d: ⚡ noteおまかせ投稿（案1おまかせモード＋案4=1素材→即記事＋案5=箇条書きメモ→記事）。
// 素材1件 or 要点メモ → 1クリックで 記事→まとめ→図表→まとめ画像→配置 まで自動直列実行し、
// 仕上げ（🧩 NoteEnhancePanel＝「こだわる」）と📤note貼り付けキットでコピペ完結。
// - 各段は fail-closed（失敗した段はスキップして次へ・本文は無傷）
// - 既定値は設定化（feature_result_drafts 'note-quick-settings'。冒頭AI画像の自動生成は既定OFF=コスト配慮）
// - 生成品質はnote生成2経路と完全同格（/api/note-quick/article がマイ文体・医療広告ガード込み）

import { useEffect, useMemo, useState } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { saveImageToGallery } from '@/lib/gallery-client';
import NoteEnhancePanel from '@/components/note-enhance/NoteEnhancePanel';
import { emptyNoteEnhance, type NoteEnhanceState, type NoteFigure } from '@/lib/note-enhance';
import { NOTE_STYLES, NOTE_STYLE_KEYS, type NoteStyleKey } from '@/lib/note-styles';
import type { ContentVerifyResult } from '@/lib/content-verify';

type Length = 'short' | 'medium' | 'long';

interface QuickSettings {
  length: Length;
  style: NoteStyleKey;
  autoSummaryImage: boolean;
  autoFigure: boolean;
  autoHookImage: boolean;
}
// 228d既定値（院長所感で調整可能なよう設定化。AI画像はコストのため既定OFF）
const DEFAULT_SETTINGS: QuickSettings = {
  length: 'medium',
  style: 'balanced',
  autoSummaryImage: true,
  autoFigure: true,
  autoHookImage: false,
};

interface MaterialItem {
  kind: 'library' | 'analysis';
  id: string | number;
  title: string;
  emoji: string;
  charCount: number;
}

type StepKey = 'article' | 'summary' | 'summaryImage' | 'figure' | 'placement';
type StepStatus = 'idle' | 'run' | 'done' | 'skip' | 'error';
const STEP_DEFS: Array<{ key: StepKey; label: string }> = [
  { key: 'article', label: '✍️ 記事を執筆' },
  { key: 'summary', label: '📝 まとめを生成' },
  { key: 'summaryImage', label: '🧾 まとめ画像を描画' },
  { key: 'figure', label: '📊 図表を抽出・描画' },
  { key: 'placement', label: '🖼 配置を提案' },
];

let quickIdSeq = 1;

export default function NoteQuickPage() {
  const [lane, setLane] = useState<'source' | 'memo'>('source');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MaterialItem | null>(null);
  const [memoText, setMemoText] = useState('');
  const [settings, setSettings] = useState<QuickSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, { status: StepStatus; note?: string }>>({
    article: { status: 'idle' }, summary: { status: 'idle' }, summaryImage: { status: 'idle' }, figure: { status: 'idle' }, placement: { status: 'idle' },
  });
  const [result, setResult] = useState<{
    title: string;
    content: string;
    adCheck: { status: string; findings: string[] } | null;
    // 233②: 素材照合＋禁止表現の機械チェック（AI不使用・表示のみ）
    verify: ContentVerifyResult | null;
  } | null>(null);
  const [enhance, setEnhance] = useState<NoteEnhanceState>(emptyNoteEnhance());
  const [error, setError] = useState('');

  // 素材リスト（DR＋note記事＝library・テキスト分析＝一覧v2。各最新分）
  useEffect(() => {
    (async () => {
      try {
        const [dr, note, ana] = await Promise.all([
          fetch('/api/library?type=deepresearch').then((r) => r.json()).catch(() => []),
          fetch('/api/library?type=note-article').then((r) => r.json()).catch(() => []),
          fetch('/api/text-analysis/saves?limit=30').then((r) => r.json()).catch(() => ({})),
        ]);
        const list: MaterialItem[] = [
          ...(Array.isArray(dr) ? dr : []).map((i: any) => ({ kind: 'library' as const, id: i.id, title: i.title || '(無題)', emoji: '🗂', charCount: (i.content || '').length })),
          ...(Array.isArray(note) ? note : []).map((i: any) => ({ kind: 'library' as const, id: i.id, title: i.title || '(無題)', emoji: '📝', charCount: (i.content || '').length })),
          ...(Array.isArray(ana?.items) ? ana.items : []).map((i: any) => ({ kind: 'analysis' as const, id: i.id, title: i.auto_title || i.file_name || '無題', emoji: '📊', charCount: i.char_count ?? 0 })),
        ];
        setMaterials(list);
      } finally {
        setMaterialsLoading(false);
      }
    })();
    // 既定値の復元（設定はDB保存＝端末をまたいで同じおまかせ挙動）
    loadFeatureDraft<QuickSettings>('note-quick-settings').then((d) => {
      if (d?.payload) setSettings({ ...DEFAULT_SETTINGS, ...d.payload });
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials.slice(0, 40);
    return materials.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 40);
  }, [materials, search]);

  const setStep = (key: StepKey, status: StepStatus, note?: string) =>
    setSteps((prev) => ({ ...prev, [key]: { status, note } }));

  const canRun = lane === 'source' ? !!selected : memoText.trim().length > 0;

  const runOmakase = async () => {
    if (!canRun || running) return;
    setRunning(true);
    setError('');
    setResult(null);
    setEnhance(emptyNoteEnhance());
    setSteps({ article: { status: 'idle' }, summary: { status: 'idle' }, summaryImage: { status: 'idle' }, figure: { status: 'idle' }, placement: { status: 'idle' } });
    saveFeatureDraft('note-quick-settings', settings);

    let content = '';
    let title = '';
    const nextEnhance: NoteEnhanceState = emptyNoteEnhance();

    // ① 記事
    setStep('article', 'run');
    try {
      const res = await fetch('/api/note-quick/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: lane === 'source' && selected ? { kind: selected.kind, id: selected.id } : undefined,
          memo: lane === 'memo' ? memoText.split('\n').map((l) => l.trim()).filter(Boolean) : undefined,
          style: settings.style,
          length: settings.length,
          model: getSavedModel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.content) throw new Error(data.error || `記事生成に失敗 (${res.status})`);
      content = data.content;
      title = data.title || 'note記事';
      setResult({ title, content, adCheck: data.ad_check ?? null, verify: data.verify ?? null });
      setStep('article', 'done', `${String(content.length)}字`);
    } catch (e) {
      setStep('article', 'error', e instanceof Error ? e.message : String(e));
      setError('記事の生成に失敗しました。もう一度お試しください');
      setRunning(false);
      return; // 記事が無ければ後段は成立しない（fail-closed）
    }

    // ② まとめ
    setStep('summary', 'run');
    try {
      const res = await fetch('/api/note-enhance/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.points)) throw new Error(data.error || '失敗');
      nextEnhance.summary = { points: data.points, updatedAt: data.updatedAt, source: 'auto' };
      setStep('summary', 'done', `${data.points.length}点`);
    } catch (e) {
      setStep('summary', 'error', e instanceof Error ? e.message : String(e));
    }

    // ③ まとめ画像（設定ON＆まとめ成功時）
    if (settings.autoSummaryImage && nextEnhance.summary) {
      setStep('summaryImage', 'run');
      try {
        const imgTitle = `${title.slice(0, 40)}｜まとめ`;
        const res = await fetch('/api/note-enhance/summary-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: imgTitle, points: nextEnhance.summary.points, template: 'card' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.imageBase64) throw new Error(data.error || '失敗');
        const saved = await saveImageToGallery({
          imageBase64: data.imageBase64,
          prompt: 'noteまとめ画像（おまかせ・プログラム描画）',
          settings: { model: 'og-render', size: `${data.width}x${data.height}` },
          title: imgTitle,
        });
        nextEnhance.summaryImage = { url: saved.blob_url, template: 'card', sourceUpdatedAt: nextEnhance.summary.updatedAt, updatedAt: new Date().toISOString() };
        setStep('summaryImage', 'done');
      } catch (e) {
        setStep('summaryImage', 'error', e instanceof Error ? e.message : String(e));
      }
    } else {
      setStep('summaryImage', 'skip', settings.autoSummaryImage ? 'まとめ未生成' : '設定OFF');
    }

    // ④ 図表（設定ON時: 抽出→上位1件を自動描画。残りは提案のまま=パネルで編集・描画可）
    if (settings.autoFigure) {
      setStep('figure', 'run');
      try {
        const res = await fetch('/api/note-enhance/figures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, title }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.figures)) throw new Error(data.error || '失敗');
        if (data.figures.length === 0) {
          setStep('figure', 'skip', '図表化に向く構造なし');
        } else {
          const figures: NoteFigure[] = data.figures.map((f: Omit<NoteFigure, 'id'>) => ({
            ...f,
            id: `q-${Date.now()}-${quickIdSeq++}`,
            dataUpdatedAt: new Date().toISOString(),
          }));
          // 上位1件を自動描画
          const first = figures[0];
          try {
            const img = await fetch('/api/note-enhance/summary-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: first.title, groups: first.groups, template: first.template }),
            });
            const imgData = await img.json().catch(() => ({}));
            if (img.ok && imgData.imageBase64) {
              const saved = await saveImageToGallery({
                imageBase64: imgData.imageBase64,
                prompt: `note図表（おまかせ・プログラム描画）`,
                settings: { model: 'og-render', size: `${imgData.width}x${imgData.height}` },
                title: `note図表: ${first.title.slice(0, 40)}`,
              });
              first.url = saved.blob_url;
              first.renderedAt = first.dataUpdatedAt;
            }
          } catch { /* 描画失敗は提案のまま残す */ }
          nextEnhance.figures = figures;
          nextEnhance.figuresRanAt = data.ranAt;
          setStep('figure', 'done', `${figures.length}件提案・1件描画`);
        }
      } catch (e) {
        setStep('figure', 'error', e instanceof Error ? e.message : String(e));
      }
    } else {
      setStep('figure', 'skip', '設定OFF');
    }

    // ⑤ 配置（hook+cta提案。冒頭AI画像は設定ON時のみ自動生成=既定OFF）
    setStep('placement', 'run');
    try {
      const res = await fetch('/api/note-enhance/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.placements)) throw new Error(data.error || '失敗');
      const placements = data.placements.map((p: any) => ({ ...p, id: `q-${Date.now()}-${quickIdSeq++}` }));
      if (settings.autoHookImage) {
        const hook = placements.find((p: any) => p.slot === 'hook' && p.prompt);
        if (hook) {
          try {
            const img = await fetch('/api/note-enhance/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: hook.prompt, engine: 'nano-banana-2', styleKey: 'soft-illust' }),
            });
            const imgData = await img.json().catch(() => ({}));
            if (img.ok && imgData.imageBase64) {
              const saved = await saveImageToGallery({
                imageBase64: imgData.imageBase64,
                prompt: hook.prompt,
                settings: { model: 'nano-banana-2', size: imgData.sizeLabel },
                title: `note挿絵（冒頭フック）: ${title.slice(0, 40)}`,
              });
              hook.url = saved.blob_url;
              hook.engine = 'nano-banana-2';
              hook.styleKey = 'soft-illust';
            }
          } catch { /* 失敗は未生成のまま（パネルで生成可） */ }
        }
      }
      nextEnhance.placements = placements;
      nextEnhance.placementRanAt = data.ranAt;
      setStep('placement', 'done', `${placements.length}件`);
    } catch (e) {
      setStep('placement', 'error', e instanceof Error ? e.message : String(e));
    }

    setEnhance(nextEnhance);
    setRunning(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-primary)', fontSize: 13, padding: 10, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>⚡ noteおまかせ投稿</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        素材1件 or 要点メモから、記事・まとめ・図表・配置まで1クリックで自動生成します。仕上がりは下のパネルで調整（=こだわる）→「📤 note貼り付けキット」でコピペ完了。<br />
        <strong style={{ color: '#f59e0b' }}>⚠️ 生成物は下書きです。必ず内容を確認・編集してから投稿してください。</strong>
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        {/* レーン切替 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([['source', '🗂 素材から（1件→即記事）'], ['memo', '✏️ メモから（要点→記事）']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setLane(k)}
              style={{ padding: '8px 18px', borderRadius: 99, fontSize: 13, fontWeight: lane === k ? 700 : 400, cursor: 'pointer', background: lane === k ? 'var(--accent-soft)' : 'var(--bg-primary)', border: `1px solid ${lane === k ? 'var(--accent)' : 'var(--border)'}`, color: lane === k ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {label}
            </button>
          ))}
        </div>

        {lane === 'source' && (
          <div style={{ marginBottom: 14 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 タイトルで絞り込み..." style={{ ...inputStyle, marginBottom: 8, maxWidth: 420 }} />
            {materialsLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>読み込み中...</div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map((m) => {
                  const on = selected?.kind === m.kind && String(selected?.id) === String(m.id);
                  return (
                    <button
                      key={`${m.kind}-${m.id}`}
                      onClick={() => setSelected(on ? null : m)}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accent-soft)' : 'var(--bg-primary)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: 13 }}
                    >
                      <span>{on ? '☑' : '☐'}</span>
                      <span>{m.emoji}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                      {m.charCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{m.charCount.toLocaleString()}字</span>}
                    </button>
                  );
                })}
                {filtered.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>素材がありません（ディープリサーチ・note記事・テキスト分析の保存が対象）</div>}
              </div>
            )}
          </div>
        )}

        {lane === 'memo' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>✏️ 記事にしたい要点（1行=1項目・5行目安。あなたの言葉のままでOK）</div>
            <textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder={'例:\n乾燥の季節は保湿の順番が大事\n洗顔→化粧水→保湿剤の順\n朝晩2回でOK・完璧を目指さない\nよくある勘違い: 高い化粧品=正解ではない\n続けるコツは洗面所に全部置くこと'}
              style={{ ...inputStyle, minHeight: 140, lineHeight: 1.8, resize: 'vertical' }}
            />
          </div>
        )}

        {/* ⚙️ こだわる（既定値の調整・保存される） */}
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowSettings((v) => !v)} style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            {showSettings ? '▲ こだわる設定を閉じる' : '⚙️ こだわる（長さ・文体・自動生成のON/OFF）'}
          </button>
          {showSettings && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                長さ:
                <select value={settings.length} onChange={(e) => setSettings((s) => ({ ...s, length: e.target.value as Length }))} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
                  <option value="short">短め（1500〜2500字）</option>
                  <option value="medium">標準（3000〜4500字）</option>
                  <option value="long">長め（5000〜7000字）</option>
                </select>
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                文体:
                <select value={settings.style} onChange={(e) => setSettings((s) => ({ ...s, style: e.target.value as NoteStyleKey }))} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
                  {NOTE_STYLE_KEYS.map((k) => (
                    <option key={k} value={k}>{NOTE_STYLES[k].emoji} {NOTE_STYLES[k].label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.autoSummaryImage} onChange={(e) => setSettings((s) => ({ ...s, autoSummaryImage: e.target.checked }))} />
                🧾 まとめ画像を自動生成
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.autoFigure} onChange={(e) => setSettings((s) => ({ ...s, autoFigure: e.target.checked }))} />
                📊 図表を自動抽出・描画
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.autoHookImage} onChange={(e) => setSettings((s) => ({ ...s, autoHookImage: e.target.checked }))} />
                🖼 冒頭AI画像も自動生成（約$0.02〜/枚）
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>マイ文体（設定&gt;🗣）が保存済みなら自動で効きます</span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444' }}>⚠️ {error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <button
            onClick={runOmakase}
            disabled={!canRun || running}
            style={{ padding: '12px 32px', background: !canRun || running ? 'var(--bg-primary)' : 'linear-gradient(135deg, #f59e0b, #ec4899)', color: !canRun || running ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: !canRun || running ? 'not-allowed' : 'pointer' }}
          >
            {running ? '⚡ おまかせ実行中...' : '⚡ おまかせで作る'}
          </button>
        </div>
      </div>

      {/* 進捗 */}
      {(running || result) && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {STEP_DEFS.map((s) => {
              const st = steps[s.key];
              const icon = st.status === 'done' ? '✅' : st.status === 'run' ? '🔄' : st.status === 'error' ? '⚠️' : st.status === 'skip' ? '⏭' : '⬜';
              return (
                <span key={s.key} style={{ fontSize: 12, color: st.status === 'error' ? '#ef4444' : st.status === 'done' ? 'var(--text-primary)' : 'var(--text-muted)' }} title={st.note}>
                  {icon} {s.label}{st.note ? `（${st.note.slice(0, 24)}）` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 結果＋仕上げ（=こだわるの本体）＋貼り付けキット */}
      {result && !running && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
            ⚠️ これは下書きです。内容を確認・編集してから投稿してください
          </div>
          {result.adCheck && result.adCheck.status === 'warn' && result.adCheck.findings.length > 0 && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
              🚨 医療広告チェック: 要確認
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{result.adCheck.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
          {result.adCheck && result.adCheck.status === 'ok' && (
            <div style={{ marginBottom: 12, fontSize: 11, color: '#10b981' }}>✅ 医療広告チェック: 問題なし</div>
          )}
          {/* 233②: 内容検証（素材照合＋禁止表現／AI不使用の機械チェック・表示のみ） */}
          {result.verify && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 }}>🔎 内容の検証（機械チェック・自動修正はしません）</div>
              {result.verify.banned.length === 0 && result.verify.ungrounded.length === 0 ? (
                <div style={{ color: '#10b981' }}>
                  ✅ 禁止表現・素材にない記述は見つかりませんでした
                  {result.verify.groundingSkipped && <span style={{ color: 'var(--text-muted)' }}>（メモのみのため素材照合はスキップ）</span>}
                </div>
              ) : (
                <>
                  {result.verify.banned.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠️ 禁止表現の疑い {result.verify.banned.length}件</span>
                      <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                        {result.verify.banned.map((b, i) => (
                          <li key={i}>
                            「{b.matched}」（{b.category}）— {b.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.verify.ungrounded.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠️ 素材にない記述 {result.verify.ungrounded.length}件</span>
                      <span style={{ color: 'var(--text-muted)' }}>（誤検出も含みます。事実か確認してください）</span>
                      <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                        {result.verify.ungrounded.map((u, i) => (
                          <li key={i}>
                            「{u.term}」（{u.kind}{u.count > 1 ? `・${u.count}箇所` : ''}）<span style={{ color: 'var(--text-muted)' }}>{u.context}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{result.title}</div>
          <div style={{ padding: 14, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 320, overflowY: 'auto', fontSize: 13, lineHeight: 1.85, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>
            {result.content}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
            🧩 仕上げ（まとめ・図表・配置の調整）と 📤 note貼り付けキット
          </div>
          <NoteEnhancePanel
            title={result.title}
            content={result.content}
            state={enhance}
            onChange={setEnhance}
          />
        </div>
      )}
    </div>
  );
}
