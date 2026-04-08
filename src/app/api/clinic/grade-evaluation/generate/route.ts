import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeLevelId } = await req.json();
  if (!gradeLevelId) return NextResponse.json({ error: 'gradeLevelId は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const gradeRows = await sql`SELECT * FROM grade_levels WHERE id = ${gradeLevelId}`;
  const grade = gradeRows[0];
  if (!grade) return NextResponse.json({ error: '等級が見つかりません' }, { status: 404 });

  const systemPrompt = await buildSystemContext(
    'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。マークダウンのコードフェンスなどは付けないでください。',
    'evaluation'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `等級レベル：${grade.level_number}（${grade.name}）
職種：${grade.position || '未設定'}
説明：${grade.description || 'なし'}

【評価の大原則：「実」を見る】
言葉・態度ではなく行動と結果の「実」で評価する：実行・実績・実力・誠実。
評価基準は「〜な気持ちがある」ではなく「〜をしている」「〜という結果を出している」で表現。

以下のJSON形式で評価フレームワークを作成してください。
評価は3軸（知識25%・スキル25%・マインド50%）で設計します。

マインド評価は「アチーブメント原則」の5段階で評価します：
  Lv1：知る — 理念・原則を「知っている」
  Lv2：わかる — 意味を「理解している」
  Lv3：行う — 日常的に「実践している」
  Lv4：できる — 自然に「体現できている」
  Lv5：分かち合う — 他者に「伝え広めている」（最高評価）

{
  "knowledgeCriteria": [
    {
      "item": "評価項目名",
      "description": "評価の着眼点",
      "achievementLevel5": "知識Lv5（完全習得・指導できる）の基準",
      "achievementLevel3": "知識Lv3（実務で活用できる）の基準",
      "achievementLevel1": "知識Lv1（基礎を知っている）の基準"
    }
  ],
  "skillCriteria": [
    {
      "item": "評価項目名",
      "description": "評価の着眼点",
      "achievementLevel5": "スキルLv5（後輩に指導できる）の基準",
      "achievementLevel3": "スキルLv3（一人でできる）の基準",
      "achievementLevel1": "スキルLv1（補助があればできる）の基準"
    }
  ],
  "mindsetCriteria": [
    {
      "item": "挑戦する姿勢",
      "description": "第二象限（重要だが緊急でない）に注力し、成長につながる挑戦をしているか",
      "level5": "分かち合う：チーム全体に挑戦の文化を広める行動をしている",
      "level4": "できる：自然に負荷のかかることへ自発的に挑戦できている",
      "level3": "行う：上司の促しなくチャレンジを継続している",
      "level2": "わかる：挑戦の重要性を理解し、意識している",
      "level1": "知る：第二象限の概念を知っている"
    },
    { "item": "理念の体現", "description": "...", "level5": "...", "level4": "...", "level3": "...", "level2": "...", "level1": "..." },
    { "item": "目標設定と達成", "description": "...", "level5": "...", "level4": "...", "level3": "...", "level2": "...", "level1": "..." },
    { "item": "学び続ける姿勢", "description": "...", "level5": "...", "level4": "...", "level3": "...", "level2": "...", "level1": "..." },
    { "item": "人材育成・分かち合い", "description": "...", "level5": "...", "level4": "...", "level3": "...", "level2": "...", "level1": "..." },
    { "item": "全体・長期・本質的視点", "description": "...", "level5": "...", "level4": "...", "level3": "...", "level2": "...", "level1": "..." }
  ],
  "promotionRequirements": ["昇格条件1", "昇格条件2"],
  "demotionRequirements": ["降格条件1"],
  "requiredLearning": ["必須の学び1"],
  "requiredCertifications": ["必須資格1"],
  "promotionExam": {
    "format": "試験形式",
    "content": ["試験内容1"],
    "passingCriteria": "合格基準"
  }
}

この等級レベルに合った具体的・実践的な基準を生成してください。`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
