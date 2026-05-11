import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const memberInfo = body.memberInfo ?? {};
  const skillMap = safeStr(body.skillMap);
  const roadmap = safeStr(body.roadmap);
  return `以下のスキルマップと成長ロードマップを元に、
最適な学習リソースを推薦してください。

【対象者】
${JSON.stringify(memberInfo)}

【スキルマップ】
${skillMap.slice(0, 800)}

【ロードマップ】
${roadmap.slice(0, 800)}

## 推薦学習リソース

### 📚 書籍（5冊・優先順）
各書籍にタイトル・著者・選定理由を含める

### 🎓 オンライン研修・資格
具体的なサービス名・コース名

### 🎯 OJT・実践課題
日常業務で取り組める課題

### 📱 アプリ・ツール
学習を加速するツール

### ⏱ 学習スケジュール案（週次）
週ごとに何時間・何を学ぶか`;
}, 3500);
