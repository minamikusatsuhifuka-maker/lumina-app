import type { Metadata } from 'next';
import { Outfit, Noto_Sans_JP, Inter, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const zenKaku = Zen_Kaku_Gothic_New({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-zen' });

export const metadata: Metadata = {
  title: 'xLUMINA — AI Research & Writing Suite',
  description: 'AI文献検索・情報収集・文章生成の統合プラットフォーム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${outfit.variable} ${notoSansJP.variable} ${inter.variable} ${zenKaku.variable}`} style={{ margin: 0 }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
