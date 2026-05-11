import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const brandStory = safeStr(body.brandStory);
  return `「${topic}」のプレスリリースと取材対応資料を作成してください。

【ブランドストーリー】${brandStory.slice(0, 800)}

## プレスリリース（A4 1枚相当）
- タイトル（社会的意義を訴求）
- リード文
- 本文（5W1H）
- 連絡先

## メディアキット
- サービス概要（300字）
- 創業者プロフィール（200字）
- 実績・数字
- 問い合わせ先

## よくある取材質問と回答（10問）
記者から聞かれそうな質問への準備

## 掲載実績・メディア向けビジュアル説明
ロゴ・写真・図解の用意リスト`;
}, 3500);
