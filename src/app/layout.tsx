import type { Metadata } from 'next';
import { Outfit, Noto_Sans_JP, Inter, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const zenKaku = Zen_Kaku_Gothic_New({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-zen' });

export const metadata: Metadata = {
  title: 'xLUMINA - AI情報収集・文章作成プラットフォーム',
  description: 'AIが情報収集から文章作成まで一気通貫で支援。Intelligence Hub・ワークフロー自動化・SNSバズり予測など30以上の機能を搭載。',
  metadataBase: new URL('https://xlumina.jp'),
  openGraph: {
    title: 'xLUMINA - AI情報収集・文章作成プラットフォーム',
    description: 'AIが情報収集から文章作成まで一気通貫で支援。30以上のAI機能で業務を自動化。',
    url: 'https://xlumina.jp',
    siteName: 'xLUMINA',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'xLUMINA - AI情報収集・文章作成プラットフォーム',
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'xLUMINA - AI情報収集・文章作成プラットフォーム',
    description: 'AIが情報収集から文章作成まで一気通貫で支援。30以上のAI機能で業務を自動化。',
    images: ['/api/og'],
  },
  keywords: ['AI', '文章作成', '情報収集', 'ライティング', 'Claude', 'マーケティング', 'コンテンツ生成', 'ワークフロー自動化'],
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'xLUMINA',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="theme-color" content="#6c63ff" />
      </head>
      <body className={`${outfit.variable} ${notoSansJP.variable} ${inter.variable} ${zenKaku.variable}`} style={{ margin: 0 }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});})}` }} />
      </body>
    </html>
  );
}
