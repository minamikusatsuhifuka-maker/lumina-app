import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { content, analysisType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const encoder = new TextEncoder();

  const prompts: Record<string, string> = {
    swot: `以下の情報をもとにSWOT分析を行ってください。
強み(Strengths)・弱み(Weaknesses)・機会(Opportunities)・脅威(Threats)の4象限で分析し、
各項目を箇条書きで5つずつ挙げてください。最後に総合評価と推奨戦略を述べてください。`,

    hypothesis: `以下の情報をもとに、論理的な仮説を3〜5個生成してください。
各仮説について：
1. 仮説の内容
2. 根拠・エビデンス
3. 検証方法
4. 期待される成果
を明記してください。`,

    trends: `以下の情報から重要なトレンドを抽出・分析してください。
1. 短期トレンド（3ヶ月以内）
2. 中期トレンド（6ヶ月〜1年）
3. 長期トレンド（2〜5年）
各トレンドの影響度・確実性・対応策も含めてください。`,

    action: `以下の情報をもとに、具体的なアクションプランを作成してください。
優先度別（高・中・低）に分けて、各アクションについて：
- 具体的なタスク
- 担当・リソース
- 期限の目安
- 期待される成果
を明記してください。すぐに実行できる「今日やること」も含めてください。`,

    content: `以下の情報をもとに、コンテンツ戦略と記事アイデアを生成してください。
1. ターゲット読者の定義
2. コンテンツテーマ案（10個）
3. 各テーマの見出し案
4. 30日間コンテンツカレンダー
5. 拡散・シェアされやすいフック`,

    competitor: `以下の情報をもとに競合分析を行ってください。
1. 主要競合の特定と特徴
2. 差別化ポイントの分析
3. 市場ポジショニングマップ
4. 勝てる領域・負けている領域
5. 差別化戦略の提案`,
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 3000,
            system: `あなたは世界トップクラスの戦略コンサルタント・アナリストです。
与えられた情報を深く分析し、実用的で具体的な洞察を提供してください。
ハルシネーションを避け、不確かな情報は「可能性がある」「推測される」と明記してください。`,
            messages: [{
              role: 'user',
              content: `${prompts[analysisType] || prompts.hypothesis}\n\n【分析対象の情報】\n${content}`,
            }],
          }),
        });

        const data = await response.json();
        const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

        for (const line of text.split('\n')) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      } catch (e: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${e.message}"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
