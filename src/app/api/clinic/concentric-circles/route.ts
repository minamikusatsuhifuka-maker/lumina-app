import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_LAYERS = [
  {
    layer_id: 0, label: '自分 — Inside', grade: 'Core', color: '#6c63ff',
    description: 'すべての起点。自分が満ちているから、外へ与えられる。',
    mission: '自分自身の価値観・在り方・成長に向き合い続けること。',
    question: 'あなたは今、自分自身にどれだけ誠実でいられていますか？',
    keywords: ['自己認識', '内省', '誠実さ', 'マインド'],
  },
  {
    layer_id: 1, label: '家族 — G1', grade: 'G1', color: '#993556',
    description: '最も身近で深い愛の関係。家族が安心していることが、自分の力の源になる。',
    mission: '家族を大切にし、家庭を安心と愛情の場として育てる。',
    question: '今日、家族に「ありがとう」を伝えましたか？',
    keywords: ['愛情', '安心', '感謝', '時間'],
  },
  {
    layer_id: 2, label: '仲間・同僚・患者さん — G2', grade: 'G2', color: '#3B6D11',
    description: '共に働く仲間、そして目の前の患者さん。日々の関わりの中で信頼を育てる。',
    mission: '仲間の存在を認め、患者さんの気持ちに寄り添い、誠実な関係をつくる。',
    question: '今日関わった人の「名前と表情」を、あなたは覚えていますか？',
    keywords: ['信頼', '共感', '傾聴', '誠実さ'],
  },
  {
    layer_id: 3, label: 'チーム — G3', grade: 'G3', color: '#1D9E75',
    description: '役割を超えて助け合い、チームとして力を発揮する段階。',
    mission: '自分の強みでチームに貢献し、弱点を補い合う関係をつくる。',
    question: 'あなたの強みで、チームの誰かを助けられていますか？',
    keywords: ['協働', '役割分担', 'フォロー', '相互成長'],
  },
  {
    layer_id: 4, label: 'クリニック・地域 — G4', grade: 'G4', color: '#185FA5',
    description: 'クリニック全体の理念を体現し、地域の健康を支える存在へ。',
    mission: 'クリニックをより良い場所にし、地域の患者さんの人生に貢献する。',
    question: 'クリニックの理念を、あなた自身の言葉で語れますか？',
    keywords: ['理念体現', '地域貢献', '主体性', '誇り'],
  },
  {
    layer_id: 5, label: '社会・世界 — G5', grade: 'G5', color: '#534AB7',
    description: 'このクリニックの存在が、社会をより良くしていく。',
    mission: 'ひとりひとりの成長が積み重なり、社会を変える力になる。',
    question: '10年後、このクリニックはどんな社会をつくっていますか？',
    keywords: ['ビジョン', '次世代', '社会的価値', '志'],
  },
];

const sql = neon(process.env.DATABASE_URL!);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS concentric_circle_layers (
      id TEXT PRIMARY KEY,
      layer_id INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL,
      grade TEXT,
      color TEXT,
      description TEXT,
      mission TEXT,
      question TEXT,
      keywords JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const rows = await sql`SELECT * FROM concentric_circle_layers ORDER BY layer_id ASC`;

  if (rows.length === 0) {
    // 初回：デフォルト値を挿入
    for (const layer of DEFAULT_LAYERS) {
      await sql`
        INSERT INTO concentric_circle_layers (id, layer_id, label, grade, color, description, mission, question, keywords)
        VALUES (${uuidv4()}, ${layer.layer_id}, ${layer.label}, ${layer.grade}, ${layer.color},
                ${layer.description}, ${layer.mission}, ${layer.question}, ${JSON.stringify(layer.keywords)})
        ON CONFLICT (layer_id) DO NOTHING
      `;
    }
    const inserted = await sql`SELECT * FROM concentric_circle_layers ORDER BY layer_id ASC`;
    return NextResponse.json(inserted);
  }

  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const { layer_id, mission, question, description, keywords } = await req.json();

  await sql`
    UPDATE concentric_circle_layers
    SET mission = ${mission}, question = ${question},
        description = ${description || ''},
        keywords = ${JSON.stringify(keywords || [])},
        updated_at = NOW()
    WHERE layer_id = ${layer_id}
  `;

  return NextResponse.json({ success: true });
}
