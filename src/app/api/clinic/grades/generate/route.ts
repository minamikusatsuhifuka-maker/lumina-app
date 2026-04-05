import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { positions, count, role } = await req.json();
  if (!positions || !count) return NextResponse.json({ error: 'positions と count は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const systemPrompt = await buildSystemContext('あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。', 'grade');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `職種：${positions} / 役割：${role || '一般〜管理職'}

【等級設計の大原則】
・ピラミッド型の階層ではなく、同心円が外に広がるイメージ
・上下の権力構造ではなく「関わり方・貢献の広がり」で等級が変わる
・G4・G5は「上の人」ではなく「育成・社会貢献に関わる人」
・全員がアンバサダー（G5）を目指して成長することが目標

【等級名称（5段階固定）】
G1：ルーキー（自分の成長に集中する時期）学ぶ・吸収する
G2：コア（一人前として自立・自走する存在）自走する・貢献する
G3：エキスパート（専門性・実績で周囲に影響を与える）魅せる・高める
G4：パートナー（仲間の可能性を信じ・育てる存在）引き出す・支える
G5：アンバサダー（理念を体現し社会に発信・貢献する）広げる・創る

【評価の大原則：「実」を見る】
言葉・態度・宣言ではなく、以下の「実」で評価：
・実行：やると言ったことを実際にやっているか（期限遵守・約束履行・言い訳なし）
・実績：事実として成果を出しているか（数字・具体的出来事・他者評価）
・実力：本物の力が身についているか（教わらずできる・応用できる・自然に出る）
・誠実：自分にも他者にも正直か（ミス隠さない・言動一致・約束を守る）
評価基準は「〜な気持ちがある」ではなく「〜をしている」「〜という結果を出している」で表現。

【評価の重点】
- 実績・実力・貢献度（スキル25% + 知識25%）
- 分かち合いの姿勢・組織への愛着（マインド50%）
- 特にG4以上：仲間の可能性を信じ・引き出す支援力

【評価で特に重視すること — 先払いの原則】
・リソース（時間・お金・エネルギー）の先払い姿勢
  → 自己投資を惜しまない / 学びにお金と時間を先払いしている / 見返りを求めず先に貢献する
・求める心と挑戦する姿勢
  → チャンスを与えられた時に飛び込む勇気 / 困難をも楽しむ精神
・先払いへの理解と実践
  → 「先払いが豊かな人生につながる」を体感している / 仲間の成長にも先払いできる

【給与の考え方】
- 責任と関わり方・先払い度合いに応じて段階的アップ
- 育成への貢献も給与に反映（「管理職手当」ではなく「育成貢献手当」）

以下のJSON形式で等級制度を作成してください：
{
  "grades": [
    {
      "levelNumber": 1,
      "name": "G1 ルーキー",
      "position": "${positions}",
      "role": "学ぶ人・吸収する人",
      "description": "自分自身の成長と基礎固めに集中する時期。素直に学び、吸収し、基礎を体得する。",
      "coreValue": "自己愛・素直さ・学ぶ姿勢",
      "skills": ["必要なスキル①", "②"],
      "knowledge": ["必要な知識①", "②"],
      "mindset": ["求めるマインド・姿勢①", "②"],
      "continuousLearning": ["継続学習①", "②"],
      "requiredCertifications": ["必須資格①"],
      "promotionExam": {
        "description": "G2への昇格審査",
        "format": "筆記/実技/面接/複合",
        "passingCriteria": "合格基準",
        "examContent": ["試験内容①"],
        "recommendedPreparation": "準備方法"
      },
      "requirementsPromotion": "昇格条件",
      "requirementsDemotion": "降格条件",
      "salaryMin": 200000,
      "salaryMax": 240000,
      "salaryNote": "成長への投資期間"
    }
  ],
  "designComment": "この等級制度はピラミッドではなく同心円。G5は『偉い人』ではなく『最も広く貢献している人』。"
}

全5等級（G1ルーキー〜G5アンバサダー）を具体的に生成してください。`,
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
