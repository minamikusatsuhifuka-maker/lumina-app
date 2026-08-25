import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { getPlaybook, PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 268§4: 有料化候補（反応上位の無料note記事）から、有料記事化の設計案を1回のAI呼び出しで提案する。
// - deliverables: 有料エリアに入れる成果物案（N-09: 購入後5分以内に使えるもの＝テンプレ・チェックリスト・プロンプト集等）
// - titles: タイトル案3本（N-05の原則。数字は手順・件数のみ＝効果の数値化禁止）
// - freeOutline / paidOutline: 無料60〜70%＋有料30〜40%の切り分け案（N-06/N-08）
// 生成のみで**DBに保存しない**。フェーズ判定・候補の並び（決定的ロジック）はここでは扱わない（268 §1-3）。

const MAX_SOURCE_CHARS = 15000;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
    if (!articleId) {
      return NextResponse.json({ error: 'articleId（note記事のID）が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [row] = (await sql`
      SELECT id, title, content FROM library
      WHERE id = ${articleId} AND user_id = ${userId} AND type = 'note-article'
    `) as { id: string; title: string; content: string | null }[];
    if (!row) return NextResponse.json({ error: 'note記事が見つかりません' }, { status: 404 });
    const content = row.content || '';
    if (!content.trim()) return NextResponse.json({ error: '記事の本文が空です' }, { status: 400 });

    // 268§4-3: N-03（テーマ選定）N-06（構成）N-08（有料ライン）N-09（成果物）N-05（タイトル）＋PART-A
    const playbook = getPlaybook(['N-03', 'N-05', 'N-06', 'N-08', 'N-09', 'PART-A']);

    const system = `あなたは note の有料記事を設計する編集者です。反応が集まった無料記事をもとに、有料記事化の設計案を作ってください。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${playbook}

# ナレッジとガードの優先順位（最重要・厳守）
上のナレッジと以下のガードが衝突する場合は、**必ずガードを優先**する。
- 医療広告規制のNG表現を使わない:
${MEDICAL_AD_NG_RULES}
- タイトル・見出しの数字は手順・時間・件数・項目数のみ（効果の数値化・成果の断定は禁止）
- 「知らないと損」「必ず」型の煽り禁止
- Before/Afterの主語は自分（患者・症例を主語にしない）
- 記事にない事実・数値・出典を書かない

# 作るもの
1. titles: 有料版のタイトル案3本（各30字以内。ターゲット明確化・具体的ベネフィット・手軽さ/再現性・一次情報の明示を織り込む）
2. freeOutline: 無料エリア（全体の60〜70%）に置く内容の骨子 3〜5項目（Why/What/ベネフィット。N-07の7要素を意識）
3. paidOutline: 有料エリア（残り30〜40%）に置く内容の骨子 3〜5項目（How・手順）
4. deliverables: 有料エリアに同梱する「購入後5分以内に使える成果物」の案 3〜5個
   （この記事の内容から実際に作れるもの: チェックリスト／穴埋めテンプレート／手順カード／声かけ例文集 等）

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"titles": ["…"], "freeOutline": ["…"], "paidOutline": ["…"], "deliverables": ["…"]}`;

    const ai = await generateTextWithFallback({
      system,
      maxTokens: 6000,
      messages: [
        {
          role: 'user',
          content: `以下の無料note記事「${row.title}」を有料記事化する設計案を作ってください。\n\n--- 記事 ---\n${content.slice(0, MAX_SOURCE_CHARS)}\n--- ここまで ---`,
        },
      ],
    });

    const parsed = robustJsonParse<{
      titles?: unknown;
      freeOutline?: unknown;
      paidOutline?: unknown;
      deliverables?: unknown;
    }>(ai.text);
    const arr = (v: unknown, max: number) =>
      (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

    const titles = arr(parsed?.titles, 3);
    const deliverables = arr(parsed?.deliverables, 5);
    // fail-closed: 中核（成果物案かタイトル）が空なら失敗として返す
    if (titles.length === 0 && deliverables.length === 0) {
      return NextResponse.json({ error: '設計案を生成できませんでした（再試行してください）' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      titles,
      freeOutline: arr(parsed?.freeOutline, 5),
      paidOutline: arr(parsed?.paidOutline, 5),
      deliverables,
      _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/paid-package] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
