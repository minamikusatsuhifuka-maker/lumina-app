import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface Topic {
  topic: string;
  category?: string;
}

interface RequestBody {
  topics: Topic[];
  model?: AIModel;
}

// 医療クリニック向けスタッフ育成資料を SSE ストリームで生成
// 各トピックについて「初心者用(1000字以内)」「エキスパート用(2000字以内)」の2レベルを順次生成
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const { topics = [], model: requestedModel } = body;
  const model: AIModel =
    requestedModel === 'claude' || requestedModel === 'gemini'
      ? requestedModel
      : 'gemini';

  if (!Array.isArray(topics) || topics.length === 0) {
    return new Response(JSON.stringify({ error: 'topics is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {}
      };

      try {
        for (let i = 0; i < topics.length; i++) {
          const item = topics[i];
          if (!item.topic?.trim()) continue;

          const categoryHint = item.category
            ? `（カテゴリ: ${item.category}）`
            : '';

          send({ type: 'topic_start', index: i, topic: item.topic });

          // 初心者用（1000字以内）
          send({ type: 'beginner_start', index: i });
          const beginnerPrompt = `医療クリニックのスタッフ向けに、以下のトピックについて基本資料を作成してください。新人の理解にも、中堅以上の復習にも使える汎用ドキュメントとします。

# トピック
${item.topic}${categoryHint}

# 要件
- **1000字以内** で完結させる
- 箇条書きを中心に、わかりやすく構造化
- 専門用語は最小限に、使う場合は必ず説明を併記
- 「これだけは押さえてほしい」基本ポイントに絞る
- 簡潔でわかりやすい文体
- 「新人スタッフへの呼びかけ」「ようこそ」「みなさん」などの読者への直接呼びかけは禁止
- 前置きや導入文なしで、いきなり本題から始める

# 構成
## 📘 ${item.topic} - 基本資料

### 🎯 これだけは知っておきたい3つのこと
（最重要ポイント3つ、各2〜3行）

### 📚 基本知識
- 〇〇とは
- どんな場面で関わるか
- 患者さんへの一般的な説明例

### ⚠️ よくある勘違い・注意点
- 箇条書きで3〜5項目

### 💡 業務で活かすヒント
- すぐに使える具体的アクション3つ

### 📝 もっと学びたい人へ
- 次のステップの示唆（エキスパート向け資料へ）

# 厳守
- 必ず1000字以内
- すべて箇条書きまたは短い段落で
- 患者さん向けではなく「スタッフ教育用」`;

          let beginnerText = '';
          try {
            beginnerText = await generateWithModel(
              model,
              beginnerPrompt,
              undefined,
              2500,
            );
            send({ type: 'beginner_done', index: i, content: beginnerText });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            send({ type: 'beginner_error', index: i, error: errMsg });
          }

          // エキスパート用（2000字以内）
          send({ type: 'expert_start', index: i });
          const expertPrompt = `医療クリニックのベテランスタッフ向けに、以下のトピックについてエキスパート用の育成資料を作成してください。

# トピック
${item.topic}${categoryHint}

# 要件
- **2000字以内** で完結させる
- 箇条書きを活用しつつ、必要に応じて詳述
- 臨床的な視点、機序、エビデンス、最新動向を含める
- 後輩指導や患者対応の応用シーンも含める
- 専門用語を活用しつつ、簡潔に説明

# 構成
## 📕 ${item.topic} - エキスパート向け育成資料

### 🎯 エッセンス（要約3〜5行）

### 🔬 機序・メカニズム
- 詳細な仕組み（箇条書きまたは段落）
- 関連する解剖・生理学的背景

### 📊 臨床データ・エビデンス
- 効果・成功率・統計など（あれば）
- ガイドライン上の位置づけ

### 🎪 実践のポイント
- 適応・禁忌の判断基準
- 注意すべき副作用・合併症
- リスクマネジメント

### 👥 後輩指導・患者対応
- 新人にどう教えるか
- 患者さんへの説明テンプレート

### 🔮 最新動向・今後の展望
- 新しい技術・製剤・知見

### 💎 ベテランならではの一言
- 経験者だからこそわかる Tips を1〜2個

# 厳守
- 必ず2000字以内
- 箇条書きと段落を適切に使い分け
- スタッフ教育用（患者向けではない）`;

          let expertText = '';
          try {
            expertText = await generateWithModel(
              model,
              expertPrompt,
              undefined,
              4500,
            );
            send({ type: 'expert_done', index: i, content: expertText });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            send({ type: 'expert_error', index: i, error: errMsg });
          }

          send({
            type: 'topic_complete',
            index: i,
            topic: item.topic,
            beginnerContent: beginnerText,
            expertContent: expertText,
          });
        }

        send({ type: 'all_done', total: topics.length });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        send({ type: 'error', error: errMsg });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
