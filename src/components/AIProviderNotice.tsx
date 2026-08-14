'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「✨ Geminiで生成」の全画面共通表示（指示書242③・235要件2）
//
// 背景: 235で FALLBACK_BADGE / providerBadge を作ったが、実際にはどの画面からも
// 参照されておらず「無言で別モデルに変わる」状態のままだった（共通層を作っただけでは
// 既存経路は移らない＝R-41と同じ構図）。242で149本のAPIが共通層経由になったため、
// 画面ごとにバッジを足すと149画面の改修が必要になる。
//
// 方式: window.fetch を1箇所でラップし、応答ヘッダ `x-ai-provider: gemini` を見たら
// 通知を出す。**レスポンスは素通し**（読むのはヘッダだけ）なので各画面のデータ処理は不変。
// 通常時（Claudeで生成できたとき）は何も表示しない＝既定の画面は一切変わらない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';

const AUTO_HIDE_MS = 8000;

export function AIProviderNotice() {
  const [notice, setNotice] = useState<{ label: string; reason: string } | null>(null);

  useEffect(() => {
    const original = window.fetch;
    // 二重ラップ防止（Fast Refresh やネストしたProvider対策）
    if ((original as { __aiNoticeWrapped?: boolean }).__aiNoticeWrapped) return;

    const wrapped: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      try {
        if (res.headers.get('x-ai-provider') === 'gemini') {
          const raw = res.headers.get('x-ai-fallback-reason');
          setNotice({
            label: '✨ Gemini で生成しました',
            reason: raw ? decodeURIComponent(raw) : 'Claudeが利用できなかったため切り替えました',
          });
        }
      } catch {
        /* 表示は付随機能。失敗しても本体の通信を妨げない（R-39） */
      }
      return res;
    };
    (wrapped as { __aiNoticeWrapped?: boolean }).__aiNoticeWrapped = true;
    window.fetch = wrapped;
    return () => {
      window.fetch = original;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        maxWidth: 360,
        padding: '12px 14px',
        borderRadius: 12,
        background: '#1f2937',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{notice.label}</div>
      <div style={{ opacity: 0.85, fontSize: 12 }}>{notice.reason}</div>
      <button
        onClick={() => setNotice(null)}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          background: 'transparent',
          border: 'none',
          color: '#fff',
          opacity: 0.7,
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
        aria-label="閉じる"
      >
        ×
      </button>
    </div>
  );
}
