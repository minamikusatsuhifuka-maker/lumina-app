'use client';
import { useEffect, useRef, useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import {
  getSavedModel,
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';
import {
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { EyecatchModal } from '@/components/eyecatch/EyecatchModal';

type Length = 'short' | 'medium' | 'long';

interface BuzzReference {
  id: string;
  title: string;
  content: string;
  tags?: string;
  created_at?: string;
}

// 自動下書き（feature_result_drafts feature_key='note-article'）のpayload
interface NoteArticleDraftPayload {
  theme?: string;
  tonePreference?: string;
  personalNotes?: string;
  length?: Length;
  deepResearch?: string;
  deepResearchTopic?: string;
  buzzReferences?: BuzzReference[];
  article?: string;
  reportModel?: AIModel | null;
}

const LENGTH_OPTIONS: Array<{ value: Length; label: string; desc: string }> = [
  { value: 'short', label: '📄 短め', desc: '1500〜2500字 / 約30秒' },
  { value: 'medium', label: '📑 標準', desc: '3000〜4500字 / 約60秒' },
  { value: 'long', label: '📚 長め', desc: '5000〜7000字 / 約120秒' },
];

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    await new Promise(r => setTimeout(r, (i + 1) * 3000));
  }
  return fetch(url, options);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const processInline = (text: string): string => {
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');
  text = text.replace(
    /(?<![="'(])(https?:\/\/[^\s）\]。、！？\n"'<>]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;font-size:0.9em;">$1 ↗</a>'
  );
  return text;
};

const formatReport = (text: string): string => {
  if (!text) return '';
  const lines = text.split('\n');
  const html = lines.map(line => {
    const t = line.trim();
    if (t.startsWith('# ')) return `<div style="font-size:1.4em;font-weight:700;color:var(--text-primary);margin:20px 0 12px;padding-bottom:10px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2))}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.2em;font-weight:600;color:var(--text-secondary);margin:18px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3))}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1.05em;font-weight:600;color:var(--text-muted);margin:12px 0 6px;">${processInline(t.slice(4))}</div>`;
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.8;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2])}</span></div>`;
    }
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.8;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2))}</span></div>`;
    }
    if (t.startsWith('> ')) {
      return `<div style="padding:8px 14px;margin:6px 0;border-left:3px solid var(--accent);background:var(--bg-primary);color:var(--text-muted);font-style:italic;line-height:1.75;">${processInline(t.slice(2))}</div>`;
    }
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';
    if (t === '') return '<div style="height:10px"></div>';
    return `<div style="line-height:1.95;margin:4px 0;">${processInline(t)}</div>`;
  });
  return html.join('');
};

export default function NoteArticleGenerationPage() {
  const [theme, setTheme] = useState('');
  const [buzzReferences, setBuzzReferences] = useState<BuzzReference[]>([]);
  const [deepResearch, setDeepResearch] = useState('');
  const [deepResearchTopic, setDeepResearchTopic] = useState('');
  const [tonePreference, setTonePreference] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');
  const [length, setLength] = useState<Length>('medium');
  // バズりパターン辞書連携
  const [allPatterns, setAllPatterns] = useState<any[]>([]);
  const [selectedPatternIds, setSelectedPatternIds] = useState<Set<string>>(new Set());
  const [suggestingPatterns, setSuggestingPatterns] = useState(false);
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [aiSuggestedPatterns, setAiSuggestedPatterns] = useState<any[] | null>(null);
  const [article, setArticle] = useState('');
  const [editedArticle, setEditedArticle] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [reportModel, setReportModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fontSize, setFontSize] = useState(15);
  const [errorMsg, setErrorMsg] = useState('');
  const [trafficStats, setTrafficStats] = useState<{ requestBytes: number; responseBytes: number; totalBytes: number } | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  // アイキャッチ生成モーダル（166）
  const [showEyecatch, setShowEyecatch] = useState(false);

  // 復元取得が返ってきた時点で既に入力/引き継ぎ/実行が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current =
    loading || !!article || !!theme.trim() || !!deepResearch || buzzReferences.length > 0;

  // マウント時に前回の実行結果（自動下書き）を復元。正はDB＝端末をまたいで復元できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<NoteArticleDraftPayload>('note-article');
      if (cancelled || !draft?.payload?.article) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setTheme(p.theme ?? '');
      setTonePreference(p.tonePreference ?? '');
      setPersonalNotes(p.personalNotes ?? '');
      if (p.length) setLength(p.length);
      setDeepResearch(p.deepResearch ?? '');
      setDeepResearchTopic(p.deepResearchTopic ?? '');
      if (Array.isArray(p.buzzReferences)) setBuzzReferences(p.buzzReferences);
      setArticle(p.article ?? '');
      setEditedArticle(p.article ?? '');
      setReportModel(p.reportModel ?? null);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す（復元は表示のみで副作用なし）
  const handleClearDraft = () => {
    setRestoredAt(null);
    setTheme('');
    setTonePreference('');
    setPersonalNotes('');
    setDeepResearch('');
    setDeepResearchTopic('');
    setBuzzReferences([]);
    setArticle('');
    setEditedArticle('');
    setEditMode(false);
    setReportModel(null);
    clearFeatureDraft('note-article');
  };

  // sessionStorage からの読込（マウント時のみ、読込後はクリア）
  useEffect(() => {
    try {
      const buzzCtx = sessionStorage.getItem('buzz-analysis-context');
      if (buzzCtx) {
        const parsed = JSON.parse(buzzCtx);
        if (Array.isArray(parsed.records)) {
          setBuzzReferences(
            parsed.records.map((r: any) => ({
              id: String(r.id),
              title: r.title || '(無題)',
              content: r.content || '',
              tags: r.tags,
              created_at: r.created_at,
            })),
          );
        }
        sessionStorage.removeItem('buzz-analysis-context');
      }
    } catch {}

    try {
      const researchCtx = sessionStorage.getItem('note-article-research-source');
      if (researchCtx) {
        const parsed = JSON.parse(researchCtx);
        setDeepResearch(parsed.content || '');
        setDeepResearchTopic(parsed.topic || '');
        if (parsed.topic && !theme) {
          // テーマが空の場合、リサーチのトピックをテーマ初期値として提案
          setTheme(parsed.topic);
        }
        sessionStorage.removeItem('note-article-research-source');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // バズりパターン辞書を初期ロード
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/library?type=buzz-pattern');
        const data = await res.json();
        setAllPatterns(Array.isArray(data) ? data : data.items || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const removeBuzzRef = (id: string) => {
    setBuzzReferences(prev => prev.filter(r => r.id !== id));
  };

  // metadata 解析（文字列でもオブジェクトでも対応）
  const parsePatternMeta = (metadata: any): any => {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
      try { return JSON.parse(metadata); } catch { return {}; }
    }
    return metadata;
  };

  // AIにパターン推奨を依頼
  const handleSuggestPatterns = async () => {
    if (!theme.trim()) {
      alert('まずテーマを入力してください');
      return;
    }
    setSuggestingPatterns(true);
    try {
      const contextParts: string[] = [];
      if (personalNotes) contextParts.push(`【経験・視点】${personalNotes}`);
      if (deepResearch) contextParts.push(`【リサーチ参考】${deepResearch.slice(0, 1500)}`);
      const context = contextParts.join('\n\n');

      const res = await fetch('/api/note-pattern-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: theme, context }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.patterns)) {
        if (data.patterns.length === 0) {
          alert(data.message || 'パターン辞書が空です。バズり分析からパターンを抽出してください。');
        } else {
          setAiSuggestedPatterns(data.patterns);
          // AI 推奨を初期選択（既存の選択にマージ）
          setSelectedPatternIds(prev => {
            const next = new Set(prev);
            data.patterns.forEach((p: any) => next.add(String(p.id)));
            return next;
          });
        }
      } else {
        alert(data.message || data.error || '推奨取得失敗');
      }
    } catch (e: any) {
      alert(`通信エラー: ${e?.message || e}`);
    } finally {
      setSuggestingPatterns(false);
    }
  };

  const togglePatternId = (pid: string) => {
    setSelectedPatternIds(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const clearDeepResearch = () => {
    setDeepResearch('');
    setDeepResearchTopic('');
  };

  const generate = async () => {
    if (!theme.trim()) {
      setErrorMsg('テーマを入力してください');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    startProgress();
    setRestoredAt(null); // 新規実行結果は「復元」ではない
    setArticle('');
    setEditedArticle('');
    setEditMode(false);
    setElapsed(0);
    setTrafficStats(null);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const modelAtRequest = getSavedModel();
      setReportModel(modelAtRequest);

      // 選択中のパターンを送信用に整形
      const selectedPatternsForPrompt = Array.from(selectedPatternIds)
        .map(pid => allPatterns.find(a => String(a.id) === String(pid)))
        .filter(Boolean)
        .map((p: any) => {
          const meta = parsePatternMeta(p.metadata);
          return {
            title: p.title,
            category: meta?.category || '',
            framework: meta?.framework || '',
            content: p.content || '',
          };
        });

      const reqBody = JSON.stringify({
        theme: theme.trim(),
        buzzReferences: buzzReferences.map(b => b.content),
        deepResearch,
        tonePreference,
        personalNotes,
        length,
        model: modelAtRequest,
        selectedPatterns: selectedPatternsForPrompt,
      });
      const requestBytes = new TextEncoder().encode(reqBody).length;

      const res = await retryFetch('/api/note-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || `エラーが発生しました（HTTP ${res.status}）`);
        clearInterval(timer);
        setLoading(false);
        resetProgress();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let responseBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) responseBytes += value.byteLength;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') {
              accumulated += json.content;
              setArticle(accumulated);
            } else if (json.type === 'error') {
              setErrorMsg(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }

      setEditedArticle(accumulated);
      setTrafficStats({
        requestBytes,
        responseBytes,
        totalBytes: requestBytes + responseBytes,
      });

      // 完了した結果を自動下書き保存（画面遷移/アプリ終了後もマウント時に復元できる）
      if (accumulated.trim()) {
        saveFeatureDraft('note-article', {
          theme,
          tonePreference,
          personalNotes,
          length,
          deepResearch,
          deepResearchTopic,
          buzzReferences,
          article: accumulated,
          reportModel: modelAtRequest,
        } satisfies NoteArticleDraftPayload);
      }
    } catch (e: any) {
      setErrorMsg(`通信エラー: ${e?.message || e}`);
      resetProgress();
    } finally {
      clearInterval(timer);
      setLoading(false);
      completeProgress();
    }
  };

  // 現在の本文（編集モードなら編集版）
  const currentContent = editMode ? editedArticle : article;

  const download = () => {
    if (!currentContent.trim()) return;
    const baseTitle = `note記事下書き_${theme.slice(0, 40)}`;
    const fileTitle = sanitizeFilename(baseTitle);
    const modelLine = reportModel
      ? `> 生成AI: ${getModelIcon(reportModel)} ${getModelLabel(reportModel)}\n`
      : '';
    const lengthLine = `> 長さ: ${LENGTH_OPTIONS.find(l => l.value === length)?.label}\n`;
    const md = `# note記事下書き: ${theme}\n\n${modelLine}${lengthLine}\n---\n\n${currentContent}`;
    triggerDownload(`${fileTitle}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="✍️ note 記事を生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>✍️ note 記事生成</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        Claude AI または Gemini 3.5 Flash が、バズり分析・ディープリサーチ記事を参考に note 記事の下書きを生成します。<br />
        <strong style={{ color: '#f59e0b' }}>⚠️ 生成された記事は下書きです。必ずあなたの独自の経験・視点を加えて編集してから投稿してください。</strong>
      </p>

      {/* 自動下書きからの復元バナー */}
      {restoredAt && (
        <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
      )}

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>

        {/* テーマ */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📝 テーマ <span style={{ color: '#ef4444' }}>*必須</span></div>
          <textarea
            value={theme}
            onChange={e => setTheme(e.target.value)}
            placeholder={'例：副業ブログで月3万を達成するまでの道のり\n例：30代から始めるプログラミング学習のリアル'}
            style={{
              width: '100%',
              minHeight: 70,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 14,
              padding: 12,
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.7,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {/* バズり分析の参考情報 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🧠 参考にする分析 {buzzReferences.length > 0 && <span style={{ color: 'var(--accent)' }}>（{buzzReferences.length}件読み込み済み）</span>}
          </div>
          {buzzReferences.length === 0 ? (
            <div style={{
              padding: '12px 14px',
              background: 'var(--bg-primary)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              バズり分析の蓄積一覧から「✍️ note 記事に活用」で送ると、ここに自動読込されます
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {buzzReferences.map((b, i) => (
                <div key={b.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, minWidth: 32 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {b.content.length.toLocaleString()} 字
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBuzzRef(b.id)}
                    title="この分析を参考情報から外す"
                    style={{
                      padding: '4px 10px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    ✕ 削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ディープリサーチ参考情報 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🔭 参考にするディープリサーチ記事 {deepResearch && <span style={{ color: 'var(--accent)' }}>（{deepResearch.length.toLocaleString()}字 読み込み済み）</span>}
          </div>
          {!deepResearch ? (
            <div style={{
              padding: '12px 14px',
              background: 'var(--bg-primary)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              ディープリサーチページから「✍️ note 記事にする」で送ると、ここに自動読込されます（任意）
            </div>
          ) : (
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deepResearchTopic || 'ディープリサーチ結果'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {deepResearch.length.toLocaleString()} 字
                </div>
              </div>
              <button
                type="button"
                onClick={clearDeepResearch}
                style={{
                  padding: '4px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                ✕ 削除
              </button>
            </div>
          )}
        </div>

        {/* 文体・口調 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✍️ 文体・口調の好み（任意）</div>
          <textarea
            value={tonePreference}
            onChange={e => setTonePreference(e.target.value)}
            placeholder="例：親しみやすく、ですます調で。専門用語は最小限に。"
            style={{
              width: '100%',
              minHeight: 50,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: 10,
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {/* 自分の経験・視点メモ */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>💡 自分の経験・視点メモ（任意）</div>
          <textarea
            value={personalNotes}
            onChange={e => setPersonalNotes(e.target.value)}
            placeholder="例：副業で月3万を達成した経験。挫折と成功の両方を書きたい。"
            style={{
              width: '100%',
              minHeight: 60,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              padding: 10,
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {/* バズりパターン辞書から選択 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8,
          }}>
            <span>
              📖 バズりパターン辞書から選択
              {selectedPatternIds.size > 0 && (
                <span style={{ color: 'var(--accent)', marginLeft: 8 }}>
                  （{selectedPatternIds.size}件選択中）
                </span>
              )}
            </span>
            <span style={{ textTransform: 'none', color: 'var(--text-muted)', fontSize: 10 }}>
              {allPatterns.length > 0 ? `辞書: ${allPatterns.length}件` : '辞書: 0件'}
            </span>
          </div>

          <div style={{
            padding: 12,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button
                type="button"
                onClick={handleSuggestPatterns}
                disabled={suggestingPatterns || !theme.trim() || allPatterns.length === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: 'none',
                  background: (suggestingPatterns || !theme.trim() || allPatterns.length === 0)
                    ? 'var(--bg-secondary)'
                    : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  color: (suggestingPatterns || !theme.trim() || allPatterns.length === 0)
                    ? 'var(--text-muted)' : '#fff',
                  cursor: (suggestingPatterns || !theme.trim() || allPatterns.length === 0)
                    ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title={!theme.trim() ? 'テーマを入力してください' : ''}
              >
                {suggestingPatterns ? '🔄 推奨中...' : '✨ AIに推奨してもらう'}
              </button>
              <button
                type="button"
                onClick={() => setShowPatternModal(true)}
                disabled={allPatterns.length === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  cursor: allPatterns.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  opacity: allPatterns.length === 0 ? 0.5 : 1,
                }}
              >
                📋 一覧から手動選択
              </button>
              {selectedPatternIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelectedPatternIds(new Set()); setAiSuggestedPatterns(null); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 16,
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'transparent',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕ 選択クリア
                </button>
              )}
            </div>

            {allPatterns.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                パターン辞書が空です。<a href="/dashboard/buzz" style={{ color: 'var(--accent)' }}>バズり分析</a> でパターンを抽出してください。
              </p>
            )}

            {/* AI推奨の理由表示 */}
            {aiSuggestedPatterns && aiSuggestedPatterns.length > 0 && (
              <div style={{
                marginTop: 4, padding: 10,
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>
                  ✨ AI推奨パターン（自動で選択中）
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {aiSuggestedPatterns.map((p: any) => (
                    <div key={p.id} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>・{p.title}</strong>
                      {p.reason && <span style={{ color: 'var(--text-muted)' }}> — {p.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 選択中パターン一覧 */}
            {selectedPatternIds.size > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
                  🎯 選択中（{selectedPatternIds.size}件）
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from(selectedPatternIds).map((pid: string) => {
                    const p = allPatterns.find(a => String(a.id) === String(pid));
                    if (!p) return null;
                    return (
                      <div key={pid} style={{
                        padding: '4px 10px',
                        background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                        color: '#fff',
                        borderRadius: 12,
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                      }}>
                        {p.title}
                        <button
                          type="button"
                          onClick={() => togglePatternId(pid)}
                          style={{
                            background: 'transparent', border: 'none',
                            color: '#fff', cursor: 'pointer',
                            padding: 0, fontSize: 14, lineHeight: 1,
                          }}
                          aria-label="解除"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 記事の長さ */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📏 記事の長さ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {LENGTH_OPTIONS.map(l => (
              <button
                key={l.value}
                onClick={() => setLength(l.value)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: length === l.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: length === l.value ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  color: length === l.value ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center' as const,
                }}
              >
                <div>{l.label}</div>
                <div style={{ fontSize: 11, marginTop: 3, fontWeight: 400 }}>{l.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div style={{
            marginBottom: 12,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            fontSize: 13,
            color: '#ef4444',
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              padding: '10px 28px',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? `✍️ 生成中... ${elapsed}秒` : '🚀 note 記事の下書きを生成'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>note 記事の下書きを執筆中...（混雑時は自動でリトライします）</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / 生成には30〜150秒かかります</div>
        </div>
      )}

      {article && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          {/* 編集前の警告 */}
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8,
            fontSize: 12,
            color: '#f59e0b',
            lineHeight: 1.6,
          }}>
            ⚠️ これは下書きです。あなたの独自の経験・視点を加えて編集してから投稿してください
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>✍️ note 記事下書き</span>
              <SaveToLibraryButton
                title={`note記事下書き: ${theme.slice(0, 60)}`}
                content={currentContent}
                type="note-article"
                groupName="note記事"
                tags="note記事,下書き"
                metadata={{
                  theme,
                  length,
                  buzzRefCount: buzzReferences.length,
                  hasDeepResearch: !!deepResearch,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setEditMode(v => !v)}
                style={{
                  padding: '6px 14px',
                  background: editMode ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                  border: editMode ? '1px solid var(--accent)' : '1px solid var(--border)',
                  color: editMode ? 'var(--accent)' : 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: editMode ? 600 : 500,
                }}
                title={editMode ? 'プレビューに戻す' : 'テキストエリアで編集する'}
              >
                {editMode ? '👁 プレビューに戻す' : '✏️ 編集モード'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(12, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>−</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(22, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>＋</button>
              </div>
              <button
                onClick={download}
                disabled={!currentContent.trim()}
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: !currentContent.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  opacity: !currentContent.trim() ? 0.5 : 1,
                }}
              >
                📥 MDダウンロード
              </button>
              <button
                onClick={() => copyToClipboard(currentContent)}
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                📋 コピー
              </button>
              <button
                onClick={() => setShowEyecatch(true)}
                disabled={!currentContent.trim()}
                title="記事内容からアイキャッチ画像を生成します"
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: !currentContent.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  opacity: !currentContent.trim() ? 0.5 : 1,
                }}
              >
                🎨 アイキャッチを生成
              </button>
            </div>
          </div>

          {editMode ? (
            <textarea
              value={editedArticle}
              onChange={e => setEditedArticle(e.target.value)}
              style={{
                width: '100%',
                minHeight: 500,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize,
                padding: 16,
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.85,
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          ) : (
            <div
              style={{ fontSize, color: 'var(--text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: formatReport(currentContent) }}
            />
          )}

          {/* メタ情報 */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>文字数: {currentContent.length.toLocaleString()}</span>
            <span>長さ: {LENGTH_OPTIONS.find(l => l.value === length)?.label}</span>
            {reportModel && (
              <span>使用モデル: {getModelIcon(reportModel)} {getModelLabel(reportModel)}</span>
            )}
            {buzzReferences.length > 0 && (
              <span>参考: バズり分析 {buzzReferences.length}件</span>
            )}
            {deepResearch && (
              <span>参考: ディープリサーチ ✓</span>
            )}
            {trafficStats && (
              <span>通信量: {formatBytes(trafficStats.totalBytes)}（送信 {formatBytes(trafficStats.requestBytes)} / 受信 {formatBytes(trafficStats.responseBytes)}）</span>
            )}
          </div>
        </div>
      )}

      {/* バズりパターン手動選択モーダル */}
      {showPatternModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={() => setShowPatternModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 880,
              maxHeight: '85vh',
              overflowY: 'auto',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)', fontSize: 20 }}>
              📖 パターン辞書から選択
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              生成に活かしたいパターンをクリックで選択/解除（{selectedPatternIds.size}/{allPatterns.length} 件選択中）
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedPatternIds(new Set(allPatterns.map(p => String(p.id))))}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={() => setSelectedPatternIds(new Set())}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                すべて解除
              </button>
            </div>

            {allPatterns.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                パターン辞書が空です。バズり分析からパターンを抽出してください。
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 8,
              }}>
                {allPatterns.map((p: any) => {
                  const pid = String(p.id);
                  const isSelected = selectedPatternIds.has(pid);
                  const meta = parsePatternMeta(p.metadata);
                  return (
                    <div
                      key={pid}
                      onClick={() => togglePatternId(pid)}
                      style={{
                        padding: 12,
                        background: isSelected ? 'rgba(108,99,255,0.1)' : 'var(--bg-secondary)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {p.title}
                        </strong>
                        {isSelected && (
                          <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>✓</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {meta?.category && (
                          <span style={{ padding: '1px 6px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                            {meta.category}
                          </span>
                        )}
                        {meta?.framework && (
                          <span style={{ padding: '1px 6px', borderRadius: 8, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                            {meta.framework}
                          </span>
                        )}
                      </div>
                      {meta?.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                          {meta.description.slice(0, 100)}{meta.description.length > 100 && '...'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowPatternModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                ✓ {selectedPatternIds.size} 件を選択完了
              </button>
            </div>
          </div>
        </div>
      )}

      <EyecatchModal
        open={showEyecatch}
        onClose={() => setShowEyecatch(false)}
        sourceTitle={theme}
        sourceText={currentContent}
        sourceKind="note"
      />
    </div>
  );
}
