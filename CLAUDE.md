# CLAUDE.md — xLUMINA (lumina-app)

## プロジェクト概要
xLUMINA = 医療クリニック（南草津皮フ科）向けの Next.js / Vercel アプリ。
院長の業務（AIコンテンツ生成・リサーチ・人材育成・組織運営）とスタッフ業務を一体化した社内プラットフォーム。

- 本番: https://xlumina.jp / https://www.xlumina.jp
- GitHub: https://github.com/minamikusatsuhifuka-maker/lumina-app

## 構造（src/app の三層 + 補助）
- **Dashboard**（院長の作業場）: AIコンテンツ生成・リサーチ
  - 情報収集・調査、AI分析・戦略、コンテンツ作成、事業・育成・医療、管理・設定
  - ライブラリ（保存物の蓄積・自動カテゴライズ）/ コンテキスト保存 等
- **Admin**（院長の運営）: 人材育成・組織運営
  - 目標達成伴走、等級・成長、制度・ルール、経営・理念、設定
  - 理念管理・背景資料はこの配下
- **Staff**（スタッフ向け）: 等級情報、ハンドブック閲覧、試験、1on1 等
- 補助: `api`（Route Handlers）, `auth`（NextAuth）, `lp`（ランディング）, `share`（共有）, `offline`

## 技術スタック
- **フレームワーク**: Next.js 16.2.x (App Router) / React 19 / TypeScript strict
- **デプロイ**: Vercel
- **DB**: Neon serverless PostgreSQL（`@neondatabase/serverless`、`src/lib/db.ts` の `sql` を使用）
- **認証**: NextAuth v5 (beta)
- **AI**: 主力 Claude Sonnet 4.6（`@anthropic-ai/sdk`）、補助 Gemini（`@google/genai` / `@google/generative-ai`）
  - 統一クライアントは `src/lib/ai-client.ts`（`AIModel = 'claude' | 'gemini'`）
  - ハンドブック系など一部は複数モデル比較を行う
- **決済**: Stripe
- **UI**: 主にインラインスタイル（page.tsx中心）+ 一部 Tailwind / lucide-react

## ⚠️ Next.js 16 注意
破壊的変更あり。Route Handler・metadata・sitemap・config 等で迷ったら必ず先に確認：
`node_modules/next/dist/docs/01-app/`

## 重要な設計原則
- エラーハンドリング3層防御（API層 try-catch / フロント層 `response.ok` / AI層 救済パース）
- AI応答のJSONパースは `src/lib/ai-json-parser.ts`（jsonrepair ベース）を使う
- リネーム・整理は「表示文言のみ変更、内部名・group_name 等は無変更」
- 自動修正・自動分類等は「勝手にDB保存しない／ユーザーを待たせない」
  - 保存はユーザー操作、付随処理（自動カテゴライズ等）はバックグラウンド非同期（fire-and-forget）
- マイグレーションは `ensureTable()` の `ADD COLUMN IF NOT EXISTS`（マイグレーションフレームワーク無し）

## 主要な用語（混同注意）
- 💡 **理念管理** (`clinic_philosophy`): クリニックの価値観、人事/育成AIの土台
- 🏥 **背景資料** (`clinic_profiles`): 常設の参照資料、admin配下、院長が管理
- 🧠 **コンテキスト** (`context_saves`): その都度の参照、dashboard配下、ユーザーが貯める

## 保存・ライブラリ
- 共通保存ボタン: `src/components/SaveToLibraryButton.tsx`（多数の画面から呼ばれる）
- 保存API: `/api/library`
- 自動カテゴライズAPI: `/api/library/auto-categorize`（`mode: 'single' | 'bulk', itemIds, category`）
  - text-analysis 系は別ルート `/api/text-analysis/auto-categorize`
- 保存時は常にバックグラウンドで自動カテゴライズ（保存成功を妨げない疎結合）

## コマンド
```bash
npm run dev        # 開発サーバー（localhost:3000）
npm run build      # 本番ビルド（コミット前に必ず実行）
npm run lint       # ESLint
```

## デプロイ
- `git push origin main` → Vercel 自動デプロイ、または `npx vercel --prod --yes`
- 本番ドメイン xlumina.jp / www.xlumina.jp にエイリアス
