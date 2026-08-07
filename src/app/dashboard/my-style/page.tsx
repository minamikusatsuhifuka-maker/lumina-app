'use client';

// 228c: マイ文体プロファイル設定画面。
// ①文体ソース（院長自身の文章のみ）の貼り付け登録 → ②✨文体を抽出（下書き） →
// ③編集して💾保存（人間確認型・保存はprofile PUTのみ）→ note生成2経路に自動注入。
// 【絶対制約】他者の文章・AI生成文をソースに登録しない（他者文体の模倣はしない）。

import { useEffect, useState, type CSSProperties } from 'react';
import {
  MY_STYLE_MAX_SOURCES,
  MY_STYLE_PROFILE_KEYS,
  MY_STYLE_SOURCE_MIN_CHARS,
  buildMyStyleBlock,
  normalizeMyStyleProfile,
  type MyStyleProfile,
} from '@/lib/my-style';

interface SourceRow {
  id: number;
  title: string;
  char_count: number;
  created_at: string;
}

const emptyProfile = (): MyStyleProfile => ({
  summary: '', sentence: '', paragraph: '', address: '', tone: '', phrases: [], avoid: [], rhythm: '',
});

const smallBtn = (extra?: CSSProperties): CSSProperties => ({
  padding: '6px 14px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  ...extra,
});

const cardStyle: CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
  marginBottom: 20,
};

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: 10,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default function MyStylePage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MyStyleProfile | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const flash = (msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  const loadAll = async () => {
    try {
      const [sRes, pRes] = await Promise.all([fetch('/api/my-style/sources'), fetch('/api/my-style/profile')]);
      const sData = await sRes.json().catch(() => ({}));
      if (sRes.ok && Array.isArray(sData.sources)) setSources(sData.sources);
      const pData = await pRes.json().catch(() => ({}));
      if (pRes.ok && pData.profile) {
        setProfile(normalizeMyStyleProfile(pData.profile));
        setEnabled(pData.enabled !== false);
        setSavedAt(pData.updated_at ?? null);
      }
    } catch {
      /* 読み込み失敗は画面表示を妨げない */
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const addSource = async () => {
    if (newContent.trim().length < MY_STYLE_SOURCE_MIN_CHARS) {
      flash(`⚠️ 本文は${MY_STYLE_SOURCE_MIN_CHARS}字以上で登録してください`);
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/my-style/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '登録に失敗しました');
      setSources((prev) => [data.source, ...prev]);
      setNewTitle('');
      setNewContent('');
      flash('✅ 文体ソースを登録しました');
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  };

  const deleteSource = async (id: number) => {
    if (!confirm('このソースを削除しますか？（保存済みプロファイルには影響しません）')) return;
    const res = await fetch(`/api/my-style/sources?id=${id}`, { method: 'DELETE' });
    if (res.ok) setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const extract = async () => {
    if (sources.length === 0) {
      flash('⚠️ 先に文体ソースを登録してください');
      return;
    }
    if (profile && dirty && !confirm('編集中のプロファイルを抽出結果で置き換えます。よろしいですか？（保存するまでDBは変わりません）')) {
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch('/api/my-style/extract', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.profile) throw new Error(data.error || '抽出に失敗しました');
      setProfile(normalizeMyStyleProfile(data.profile) ?? emptyProfile());
      setDirty(true);
      flash(`✨ ${data.usedSources}件（${Number(data.usedChars).toLocaleString()}字）から抽出しました。内容を確認・編集して保存してください`);
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch('/api/my-style/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setDirty(false);
      setSavedAt(new Date().toISOString());
      flash('💾 保存しました。note記事生成に自動で反映されます');
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const patchProfile = (key: keyof MyStyleProfile, value: string) => {
    setProfile((prev) => {
      const base = prev ?? emptyProfile();
      const isList = key === 'phrases' || key === 'avoid';
      return { ...base, [key]: isList ? value.split('\n').map((v) => v.trim()).filter(Boolean) : value };
    });
    setDirty(true);
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🗣 マイ文体プロファイル</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        あなた自身の過去の文章から文体（文の長さ・語りかけ・リズム）を抽出し、note記事生成に自動で反映します。<br />
        <strong style={{ color: '#f59e0b' }}>
          ⚠️ ソースには「自分が書いた文章」だけを登録してください（他者の文章・AI生成の下書きは登録しない＝他者の文体模倣や品質劣化を防ぐため）
        </strong>
      </p>

      {/* ── ① 文体ソース ── */}
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          ① 文体ソース（{sources.length}/{MY_STYLE_MAX_SOURCES}件）
        </div>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="タイトル（例: note記事「乾燥肌との付き合い方」）"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={`自分で書いた文章の本文を貼り付け（${MY_STYLE_SOURCE_MIN_CHARS}字以上。過去に公開したnote記事など）`}
          style={{ ...inputStyle, minHeight: 140, lineHeight: 1.7, resize: 'vertical', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={addSource} disabled={adding} style={smallBtn({ fontWeight: 700 })}>
            {adding ? '🔄 登録中...' : '＋ 自分の文章として登録'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{newContent.length.toLocaleString()}字</span>
        </div>

        {sources.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sources.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.char_count.toLocaleString()}字</div>
                </div>
                <button type="button" onClick={() => deleteSource(s.id)} style={smallBtn({ color: '#ef4444' })}>🗑 削除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ② 抽出 → ③ 編集・保存 ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>② 文体プロファイル</span>
          <button type="button" onClick={extract} disabled={extracting || sources.length === 0} style={smallBtn()}>
            {extracting ? '🔄 抽出中...（30〜60秒）' : profile ? '✨ 抽出し直す' : '✨ 文体を抽出'}
          </button>
          {savedAt && !dirty && <span style={{ fontSize: 11, color: '#10b981' }}>✅ 保存済み</span>}
          {dirty && <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠️ 未保存の変更があります</span>}
        </div>

        {!profile && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ソース登録後「✨ 文体を抽出」を押すと、AIが下書きを作ります（保存するまで反映されません）。
          </div>
        )}

        {profile && (
          <div>
            {MY_STYLE_PROFILE_KEYS.map(({ key, label, isList }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {label}{isList && '（1行=1項目）'}
                </div>
                <textarea
                  value={isList ? (profile[key] as string[]).join('\n') : (profile[key] as string)}
                  onChange={(e) => patchProfile(key, e.target.value)}
                  style={{ ...inputStyle, minHeight: isList ? 64 : 40, lineHeight: 1.6, resize: 'vertical' }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} />
                生成に反映する（note記事生成2経路に自動注入）
              </label>
              <button type="button" onClick={() => setShowPreview((v) => !v)} style={smallBtn()}>
                {showPreview ? '▲ 注入内容を閉じる' : '👁 実際に注入される内容を確認'}
              </button>
              <button type="button" onClick={save} disabled={saving} style={smallBtn({ fontWeight: 700, background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', border: 'none', padding: '8px 20px' })}>
                {saving ? '🔄 保存中...' : '💾 保存'}
              </button>
            </div>

            {showPreview && (
              <pre style={{ marginTop: 10, padding: 12, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {buildMyStyleBlock(profile)}
              </pre>
            )}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
        💡 保存後は「✍️ note記事生成」「📝 note記事群生成」の文章に自動で効きます（画面で文体・口調を個別指定した場合はそちらが優先）。
        生成済みの文章は、note記事生成画面の「🗣 もっと自然に」でマイ文体に寄せる提案を受けられます。
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, zIndex: 1002, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxWidth: 'calc(100vw - 40px)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
