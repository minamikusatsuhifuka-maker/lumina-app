'use client';
import { useEffect, useRef, useState } from 'react';

// 保存時の自動カテゴライズ（デフォルト有効）。将来オフにしたい時のためのフラグ（UIには出さない）。
const AUTO_CATEGORIZE_ENABLED = true;

type Props = {
  title: string;
  content: string;
  type: string;
  groupName: string;
  tags?: string;
  metadata?: Record<string, any>;
  /**
   * 247: 自動ストック保存の合図（オプトイン）。
   * 呼び出し側が「生成が完走した」タイミングでだけ数値を +1 する。
   * content の変化で発火させないのは、ストリーミング中と自動下書きの復元でも
   * content が変わり、重複保存になるため。既定（未指定）は自動保存しない。
   */
  autoSaveSignal?: number;
};

export function SaveToLibraryButton({ title, content, type, groupName, tags, metadata, autoSaveSignal }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // 247: 保存失敗はトーストだけだと消えて分からなくなるので、ボタン自体を ⚠️ にして再試行できる形で残す
  const [saveError, setSaveError] = useState(false);
  const [showFavoriteOption, setShowFavoriteOption] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [memorizing, setMemorizing] = useState(false);
  const [memorized, setMemorized] = useState(false);
  // 保存済みの本文。これと同じ内容の間は「✅ 保存済み」で押せない＝二重保存を防ぐ。
  // 本文が変われば（AIで修正・再生成）未保存に戻るので、直した版はまた保存できる
  const savedContentRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const saveToLibrary = async (asFavorite = false, silent = false) => {
    if (!content) return;
    setSaving(true);
    setSaveError(false);
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
        savedContentRef.current = content;
        if (asFavorite) {
          showToast('⭐ お気に入りに保存しました！');
          setShowFavoriteOption(false);
        } else {
          setShowFavoriteOption(true);
          showToast(silent ? '✅ ストックに自動保存しました' : '✅ リサーチ保存に追加しました！');
        }
        // 保存成功後、全経路でバックグラウンド自動カテゴライズ（fire-and-forget、失敗許容）
        // ・保存は既に完了してユーザーに即フィードバック済み → 分類は裏で非同期実行
        // ・分類失敗は保存成功を妨げない（ログのみ、ユーザー通知なし）
        if (data?.id && AUTO_CATEGORIZE_ENABLED) {
          fetch('/api/library/auto-categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'single',
              itemIds: [data.id],
              category: groupName,
            }),
          }).catch((err) => console.warn('[auto-categorize] バックグラウンド分類失敗:', err));
        }
      } else {
        setSaveError(true);
        showToast('❌ 保存に失敗しました');
      }
    } catch {
      setSaveError(true);
      showToast('❌ 保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 247: 本文が保存済みの内容から変わったら未保存に戻す（修正版をまた保存できるようにする）
  useEffect(() => {
    if (savedContentRef.current !== null && content !== savedContentRef.current) {
      savedContentRef.current = null;
      setSaved(false);
      setSavedId(null);
      setShowFavoriteOption(false);
    }
  }, [content]);

  // 247: 自動ストック保存。合図（数値）が増えたときだけ1回走らせる。
  // 保存に失敗しても呼び出し側の生成結果には触れない＝画面に残る（R-39）
  // 0 で初期化する（合図が立ってから初めてマウントされる画面があるため。
  // ディープリサーチの保存ボタンは loading 中は描画されず、完走後の再描画で現れる）
  const lastAutoSignalRef = useRef(0);
  useEffect(() => {
    if (autoSaveSignal === undefined) return;
    if (autoSaveSignal <= lastAutoSignalRef.current) return;
    lastAutoSignalRef.current = autoSaveSignal;
    if (!content) return;
    if (savedContentRef.current === content) return; // すでに同じ内容を保存済み
    void saveToLibrary(false, true);
    // saveToLibrary は毎描画で作り直される。合図の数値だけを発火条件にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveSignal]);

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
          // 247: 保存済みの間は押せない＝同じ本文を二重にストックへ入れない
          disabled={saving || !content || saved}
          title={
            saved
              ? 'この内容はストックに保存済みです（本文を修正するとまた保存できます）'
              : saveError
                ? '保存に失敗しました。押すと再試行します（結果は画面に残っています）'
                : 'ストック（📚ライブラリ）に保存します'
          }
          style={{
            padding: '8px 16px',
            background: saved
              ? 'rgba(0,212,184,0.15)'
              : saveError
                // 247: 白文字とのコントラスト 5.02:1（R-43 の 4.5:1 以上）
                ? '#B45309'
                : 'linear-gradient(135deg, #1a5c4a, #0d9973)',
            border: saved ? '1px solid rgba(0,212,184,0.4)' : 'none',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: saving || !content ? 'not-allowed' : saved ? 'default' : 'pointer',
            opacity: !content ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {saving ? '保存中...' : saved ? '✅ 保存済み' : saveError ? '⚠️ 保存に失敗・再試行' : '📚 リサーチ保存に追加'}
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
