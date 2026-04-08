import type { Metadata } from 'next';
import { Outfit, Noto_Sans_JP, Inter, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const zenKaku = Zen_Kaku_Gothic_New({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-zen' });

export const metadata: Metadata = {
  title: 'xLUMINA — クリニックスタッフ成長支援プラットフォーム',
  description: 'スタッフの成長を、AIが支える。評価・1on1・採用・等級制度をひとつのプラットフォームで。',
  metadataBase: new URL('https://xlumina.jp'),
  openGraph: {
    title: 'xLUMINA — クリニックスタッフ成長支援プラットフォーム',
    description: 'スタッフの成長を、AIが支える。評価・1on1・採用・等級制度をひとつのプラットフォームで。',
    url: 'https://xlumina.jp',
    siteName: 'xLUMINA',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'LUMINA — クリニックスタッフ成長支援プラットフォーム',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'xLUMINA — クリニックスタッフ成長支援プラットフォーム',
    description: 'スタッフの成長を、AIが支える。',
    images: ['/api/og'],
  },
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
