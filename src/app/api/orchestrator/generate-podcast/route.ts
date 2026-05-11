import { makeClaudeJsonHandler, safeStr, safeNum } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const brandStory = safeStr(body.brandStory);
  const persona = safeStr(body.persona);
  const episodes = safeNum(body.episodes, 5);
  return `「${topic}」のポッドキャスト番組設計と台本を作成してください。

【ブランドストーリー】${brandStory.slice(0, 500)}
【ターゲット】${persona.slice(0, 400)}

## ポッドキャスト番組設計

### 番組コンセプト・タイトル案（3案）
覚えやすく・検索されやすいタイトル

### ターゲットリスナー
聴く時間帯・シチュエーション

### エピソード構成テンプレート（25分尺）
オープニング・本編・クロージングの黄金比

## 第1〜${episodes}話の台本

各話：
- タイトル・サムネイル文言
- オープニング（60秒）：フック文
- メインコンテンツ（20分）の概要・3つの論点
- クロージング・CTA（2分）：次回予告・行動喚起

最後に「ゲスト招待企画案」を3つ提示してください。`;
}, 5000);
