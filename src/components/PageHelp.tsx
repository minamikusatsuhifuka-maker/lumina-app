'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

const PAGE_HELP: Record<string, { title: string; prompt: string }> = {
  '/dashboard/write': {
    title: '文章作成の使い方',
    prompt: 'xLUMINAの文章作成機能の使い方・コツ・おすすめ活用法を箇条書きで簡潔に教えてください。特に初心者が知っておくべきポイントを5つ挙げてください。',
  },
  '/dashboard/library': {
    title: 'ライブラリの使い方',
    prompt: 'xLUMINAのライブラリ機能の使い方・コツ・おすすめ活用法を箇条書きで簡潔に教えてください。タブ・フォルダ・お気に入り・統合サマリーの活用法を含めてください。',
  },
  '/dashboard/websearch': {
    title: 'Web情報収集の使い方',
    prompt: 'xLUMINAのWeb情報収集機能の使い方・コツを箇条書きで簡潔に教えてください。効果的な検索クエリの書き方・信頼性スコアの見方・カテゴリ分類の活用法を含めてください。',
  },
  '/dashboard/workflow': {
    title: 'ワークフローの使い方',
    prompt: 'xLUMINAのAIワークフロー機能の使い方・コツを箇条書きで簡潔に教えてください。プリセットの選び方・全自動とステップ承認の使い分け・実行履歴の活用法を含めてください。',
  },
  '/dashboard/intelligence': {
    title: 'Intelligence Hubの使い方',
    prompt: 'xLUMINAのIntelligence Hub機能の使い方・コツを箇条書きで簡潔に教えてください。8つのモードの使い分け・効果的な活用シーンを含めてください。',
  },
  '/dashboard/brainstorm': {
    title: 'ブレストの使い方',
    prompt: 'xLUMINAのAIブレインストーミング機能の使い方・コツを箇条書きで簡潔に教えてください。発散→収束→評価の3フェーズの活用法・文章作成との連携を含めてください。',
  },
  '/dashboard/memory': {
    title: 'AIメモリの使い方',
    prompt: 'xLUMINAのAIメモリ機能の使い方・コツを箇条書きで簡潔に教えてください。自動記録と手動記録の違い・メモリが活用される場面・管理のコツを含めてください。',
  },
  '/dashboard/glossary': {
    title: '用語解説の使い方',
    prompt: 'xLUMINAの専門用語解説パネルの使い方・コツを箇条書きで簡潔に教えてください。用語抽出→選択→解説→保存のフローと活用シーンを含めてください。',
  },
  '/dashboard': {
    title: 'ダッシュボードの使い方',
    prompt: 'xLUMINAのダッシュボードの見方・使い方・おすすめの活用開始手順を箇条書きで簡潔に教えてください。初めて使う人向けにおすすめの機能順序も教えてください。',
  },
};

export function PageHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();

  const pageHelp = Object.entries(PAGE_HELP).find(([path]) =>
    pathname.startsWith(path)
  )?.[1];

  if (!pageHelp) return null;

  const handleOpen = async () => {
    setIsOpen(true);
    if (helpText) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/page-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pageHelp.prompt }),
      });
      const data = await res.json();
      setHelpText(data.help ?? 'ヘルプを取得できませんでした。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        title={pageHelp.title}
        style={{
          width: 36, height: 36, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14,
          color: 'var(--text-muted)',
        }}
      >
        ？
      </button>

      {isOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setIsOpen(false)}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50, width: '90%', maxWidth: 520,
            background: 'var(--bg-secondary)',
            borderRadius: 16, border: '1px solid var(--border)',
            overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>❓ {pageHelp.title}</span>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 16, color: 'var(--text-muted)' }}
              >✕</button>
            </div>

            <div style={{ padding: '16px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{
                      height: 16, borderRadius: 4,
                      background: 'var(--border)',
                      width: `${70 + Math.random() * 30}%`,
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                  <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.15 } }`}</style>
                </div>
              ) : (
                <div style={{
                  fontSize: 13, lineHeight: 1.8,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {helpText}
                </div>
              )}
            </div>

            <div style={{
              padding: '10px 18px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AIが生成したヘルプです</span>
              <button
                onClick={() => { setHelpText(''); handleOpen(); }}
                style={{ fontSize: 11, color: 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer' }}
              >
                🔄 更新
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
