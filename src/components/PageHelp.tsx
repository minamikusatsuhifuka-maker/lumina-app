'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

const PAGE_HELP: Record<string, { title: string; content: string }> = {
  '/dashboard/reviews': {
    title: '口コミ管理の使い方',
    content: `# 口コミ管理の使い方
1. 「口コミを取得」でGoogleマップの最新口コミを取得
2. 「口コミを手動登録」で独自の口コミを追加
3. 「AIで口コミ分析」でGeminiが全口コミを分析・改善提案
- Google Places取得分: Googleマップから自動取得した最新5件
- 手動登録分: 自分で登録した口コミ（全件AI分析対象）
- AIで口コミ分析: 良い点・改善点・返信テンプレートを生成`,
  },
  '/dashboard/analytics': {
    title: 'アナリティクスの使い方',
    content: `# アナリティクスの使い方
1. 「GA4データを取得」でGoogleアナリティクスのデータを取得
2. 「AIで分析する」でGeminiがデータを分析・改善提案
3. 「この分析を保存」で分析結果をDBに保存
- セッション: サイトへの訪問回数
- 直帰率: 1ページだけ見て離脱した割合（低いほど良い）
- エンゲージメント率: 積極的に閲覧した割合（高いほど良い）`,
  },
};

export function PageHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const pageHelp = Object.entries(PAGE_HELP).find(([path]) =>
    pathname.startsWith(path)
  )?.[1];

  if (!pageHelp) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
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
              <div style={{
                fontSize: 13, lineHeight: 1.8,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
              }}>
                {pageHelp.content}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
