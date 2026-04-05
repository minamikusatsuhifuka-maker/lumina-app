export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemContext } from '@/lib/clinic-context';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const rulesRows = await sql`SELECT content FROM employment_rules LIMIT 1`;
  const employmentRules = (rulesRows[0]?.content as string) ?? '';

  const system = await buildSystemContext(
    'あなたはクリニックの人事・組織文化の専門家です。必ずJSON形式のみで返してください。マークダウンのコードフェンスなどは付けないでください。'
  );

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system,
    messages: [{
      role: 'user',
      content: `医療クリニックの行動基準を4つのゾーンに分けて作成してください。

【就業規則（参考）】
${employmentRules ? employmentRules.slice(0, 5000) : '未登録'}

【4ゾーンの定義】

🔴 レッド（即退職レベル）
発覚次第即時解雇。いかなる理由・状況でも例外なし。

🟡 イエロー（退職勧告レベル）
改善指導を行い、期間内に改善なければ退職勧告。

🟢 グリーン（一人前の基準）
全スタッフが達成すべき基本ライン。
・組織づくりへの協力・真面目に違反なく働く姿勢
・組織人として当たり前の働き方・肯定的な仕事観
・分かち合いの姿勢・セルフコントロール
・タイムマネジメント・ポジティブなマインド
・全員が当院の代表者であるという意識

🩵 ティール（リーダー以上の基準）
グリーンを体現した上でさらに高い次元：
・関わる人の能力を引き出すマネジメント力（リードマネジメント）
・視座の高さ・視野の広さ・思考の深さ
・人材育成できる存在・組織づくりをリード
・学習意欲・責任感・向上心に溢れる
・頼れる存在・ロールモデル
・大きな志をもち社会貢献している
・縁ある人を豊かで幸せにする

以下のJSON形式で作成してください：
{
  "zones": [
    {
      "zone_type": "red",
      "items": [
        {
          "category": "harassment",
          "title": "身体的暴力・傷害行為",
          "description": "患者・スタッフへの身体的暴力、傷害、脅迫行為",
          "official_statement": "当クリニックはいかなる暴力も絶対に許容しません。即日解雇とします。",
          "legal_basis": "就業規則 懲戒解雇条項",
          "improvement_period": null
        }
      ]
    },
    {
      "zone_type": "yellow",
      "items": [
        {
          "category": "attitude",
          "title": "慢性的な遅刻・無断欠勤",
          "description": "正当な理由のない遅刻・欠勤が月3回以上続く",
          "official_statement": "勤怠管理は組織の信頼の基盤です。改善指導を行います。",
          "legal_basis": "就業規則 服務規律条項",
          "improvement_period": "指導開始から3ヶ月"
        }
      ]
    },
    {
      "zone_type": "green",
      "items": [
        {
          "category": "mindset",
          "title": "当院の代表者としての意識",
          "description": "院内外問わず、自分の言動がクリニック全体の評価に繋がる意識を持つ",
          "official_statement": "あなたの一言・一動作が南草津皮フ科の顔です。",
          "behavioral_indicators": "患者への挨拶・言葉遣い・SNSでの発信すべてを代表者として行動",
          "related_achievement_principle": "行う（Lv3）〜できる（Lv4）"
        }
      ]
    },
    {
      "zone_type": "teal",
      "items": [
        {
          "category": "leadership",
          "title": "リードマネジメントの実践",
          "description": "指示・命令ではなく、関わる人の内発的動機を引き出すマネジメントを実践",
          "official_statement": "真のリーダーは人を動かすのではなく、人が動きたくなる環境を創ります。",
          "behavioral_indicators": "後輩が自ら考え行動できるような問いかけ・サポートを自然にしている",
          "related_achievement_principle": "分かち合う（Lv5）の体現"
        }
      ]
    }
  ]
}

レッドゾーン：10〜15件（就業規則の懲戒規定を参照）
イエローゾーン：10〜15件（就業規則の普通解雇・服務規律を参照）
グリーンゾーン：10〜15件（一人前の基準・組織人としての当たり前）
ティールゾーン：10〜15件（リーダー以上の高い意識・行動基準）`,
    }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json({ zones: parsed.zones });
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
