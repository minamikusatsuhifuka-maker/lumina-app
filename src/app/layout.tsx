import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LUMINA — AI Research & Writing Suite',
  description: 'AI文献検索・情報収集・文章生成の統合プラットフォーム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={outfit.className} style={{ background: '#07080f', color: '#f0f0ff', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
