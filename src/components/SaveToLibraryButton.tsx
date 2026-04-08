'use client';
import { useState } from 'react';

type Props = {
  title: string;
  content: string;
  type: string;
  groupName: string;
  tags?: string;
  metadata?: Record<string, any>;
};

export function SaveToLibraryButton({ title, content, type, groupName, tags, metadata }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFavoriteOption, setShowFavoriteOption] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [memorizing, setMemorizing] = useState(false);
  const [memorized, setMemorized] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const saveToLibrary = async (asFavorite = false) => {
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          content,
          metadata: { ...metadata, savedAt: new Date().toISOString() },
          tags: asFavorite ? `${tags || type},お気に入り` : (tags || type),
          group_name: groupName,
          is_favorite: asFavorite,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        setSavedId(data.id);
        if (asFavorite) {
          showToast('⭐ お気に入りに保存しました！');
          setShowFavoriteOption(false);
        } else {
          setShowFavoriteOption(true);
          showToast('✅ ライブラリに保存しました！');
        }
      } else {
        showToast('❌ 保存に失敗しました');
      }
    } catch {
      showToast('❌ 保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const addToFavorite = async () => {
    if (!savedId) { saveToLibrary(true); return; }
    try {
      await fetch('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedId, is_favorite: true, tags: `${tags || type},お気に入り` }),
      });
      showToast('⭐ お気に入りに追加しました！');
      setShowFavoriteOption(false);
    } catch {
      showToast('❌ 失敗しました');
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* ライブラリ保存ボタン */}
        <button
          onClick={() => saveToLibrary(false)}
          disabled={saving || !content}
          style={{
            padding: '8px 16px',
            background: saved
              ? 'rgba(0,212,184,0.15)'
              : 'linear-gradient(135deg, #1a5c4a, #0d9973)',
            border: saved ? '1px solid rgba(0,212,184,0.4)' : 'none',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: saving || !content ? 'not-allowed' : 'pointer',
            opacity: !content ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {saving ? '保存中...' : saved ? '✅ 保存済み' : '📚 ライブラリに保存'}
        </button>

        {/* 🧠 記憶するボタン */}
        <button
          onClick={async () => {
            if (!content || memorizing) return;
            setMemorizing(true);
            try {
              const res = await fetch('/api/memory/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, title, sourceType: groupName, category: groupName }),
              });
              if (res.ok) {
                setMemorized(true);
                showToast('🧠 AIメモリに記憶しました！');
              } else {
                showToast('❌ メモリ保存に失敗しました');
              }
            } catch { showToast('❌ メモリ保存に失敗しました'); }
            finally { setMemorizing(false); }
          }}
          disabled={memorizing || memorized || !content}
          style={{
            padding: '8px 16px',
            background: memorized ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.08)',
            border: `1px solid ${memorized ? 'rgba(108,99,255,0.4)' : 'rgba(108,99,255,0.2)'}`,
            borderRadius: 8, color: memorized ? '#6c63ff' : '#a89fff', fontSize: 13, fontWeight: 600,
            cursor: memorizing || memorized || !content ? 'not-allowed' : 'pointer',
            opacity: !content ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {memorizing ? '記憶中...' : memorized ? '🧠 記憶済み' : '🧠 記憶する'}
        </button>

        {/* お気に入りボタン（保存後に表示） */}
        {showFavoriteOption && (
          <button
            onClick={addToFavorite}
            style={{
              padding: '8px 16px',
              background: 'rgba(245,166,35,0.15)',
              border: '1px solid rgba(245,166,35,0.4)',
              borderRadius: 8, color: '#f5a623', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            ⭐ 文章生成のお気に入りに追加
          </button>
        )}
      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 9999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)',
          color: 'var(--text-primary)', padding: '12px 24px', borderRadius: 12,
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
