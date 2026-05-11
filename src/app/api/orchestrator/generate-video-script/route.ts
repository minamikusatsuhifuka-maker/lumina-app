import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const lpContent = safeStr(body.lpContent);
  const persona = safeStr(body.persona);
  return `「${topic}」のセールス動画台本（15分尺）を作成してください。

【LP内容】${lpContent.slice(0, 800)}
【ターゲット】${persona.slice(0, 400)}

## 動画台本（15分）

### オープニング（0:00〜1:00）
衝撃的な問いかけ・共感

### 問題提示（1:00〜3:00）
視聴者の悩みをリアルに描写

### 解決策提示（3:00〜7:00）
サービスの概要・仕組み

### 証拠・実績（7:00〜10:00）
事例・数字・お客様の声

### オファー（10:00〜13:00）
内容・価格・特典

### CTA（13:00〜15:00）
今すぐ行動を促すクロージング

各シーンのナレーション・字幕テキスト・画面の見せ方を含めてください。
最後にウェビナー版（60分）への拡張案も簡単に。`;
}, 5000);
