import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

// アイキャッチ用の画像生成プロンプトを本文からAI起案する（人間確認型：起案のみ・生成はしない）。
// 既定AIは Gemini 3.5-flash。画像生成コア（/api/image-gen）には手を入れない。

const KIND_HINT: Record<string, string> = {
  note: 'note記事のヘッダー画像（横長・読み物の雰囲気）',
  sns: 'SNS投稿のサムネイル（正方形・目を引くが上品）',
  lp: 'ランディングページのメインビジュアル（横長・信頼感）',
  // 185→190: HP掲載ブログ＝患者が読む公開情報。清潔感・安心感は保ちつつ、
  // 「抽象的なイメージ」指定は主題が丸ごと落ちる原因だったため「テーマが伝わる具体的な情景」に是正
  'hp-blog': 'クリニックHP掲載のブログ記事用画像（横長・清潔感と安心感・記事のテーマが視覚的に伝わる具体的な情景）',
};

// 190③: hp-blog は「疾患そのもの」を扱う記事のため、note/SNS/LP 向けの
// 「抽象的・イメージ寄りにする」をそのまま適用すると主題が丸ごと落ち、
// どの医療記事でも同じ"清潔感のある抽象画"になってしまう。
// 禁止すべきは「患部の写実的描写」であって「テーマに関連する情景」ではない、に切り分ける。
const HP_BLOG_RULES = `【必ず反映すること】
- 記事の主題を視覚的に反映する。テーマに関連する日常の情景・記事の内容が伝わる具体的なモチーフを必ず入れる
  （例: 手荒れ・手湿疹の記事 → 水仕事の場面／ハンドケアをする手元（健常な手）／保湿クリームと綿手袋）。
- 季節・生活シーンなど、読者が自分ごと化できる文脈を添える。
- 主題と雰囲気（色調・光・構図・モチーフ）を簡潔に描写する。
- 「医療的な表現を一切含まない」のような、主題を丸ごと消す自己規制の文言をプロンプトに書かない。

【引き続き禁止】
- 患部・症状の写実的描写（赤み・湿疹・ひび割れ等の皮膚症状そのもの）。健常な肌・手元の描写はよい。
- ビフォーアフター的な対比表現。
- 実在の人物・顔が特定できる描写。
- 効果効能を示唆する表現（治った状態の演出等）。
- 画像内に文字・ロゴ・数字を一切入れない（テキストは後工程で載せる前提）。
- 具体的な数値・割合を書かない。`;

// 166: note/SNS/LP 向けの従来ルール（190で hp-blog のみ分岐・こちらは無変更）
const DEFAULT_RULES = `【厳守事項】
- 画像内に文字・ロゴ・数字を一切入れない（テキストは後工程で載せる前提）。
- 実在の人物・患者・症例写真的な表現を避け、抽象的・イメージ寄りにする。
- 効果効能・ビフォーアフター等、医療広告で問題になる訴求はプロンプトに入れない。
- 具体的な数値・割合を書かない。
- 主題と雰囲気（色調・光・構図・モチーフ）を簡潔に描写する。`;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const sourceTitle = typeof body.sourceTitle === 'string' ? body.sourceTitle : '';
    const kind = typeof body.kind === 'string' ? body.kind : 'note';
    if (!sourceText.trim()) {
      return NextResponse.json({ error: '本文がありません' }, { status: 400 });
    }

    // 本文は先頭のみ使う（プロンプト起案に全文は不要・トークン節約）
    const excerpt = sourceText.slice(0, 2000);
    const kindHint = KIND_HINT[kind] ?? KIND_HINT.note;

    const systemPrompt =
      'あなたは医療クリニックの広報デザイナーです。文章の内容に合う「アイキャッチ画像」の生成プロンプトを1つ作成します。';

    const prompt = `以下の文章に合うアイキャッチ画像の生成プロンプトを日本語で1つ作ってください。用途: ${kindHint}。

${kind === 'hp-blog' ? HP_BLOG_RULES : DEFAULT_RULES}

【出力形式】
プロンプト本文のみを出力（前置き・見出し・引用符・番号は不要）。

${sourceTitle ? `タイトル: ${sourceTitle}\n` : ''}本文:
${excerpt}`;

    // Gemini 3.x は思考が既定ONで、枠が小さいと思考でトークンを食い切り本文が空になるため、
    // 出力枠を大きめに取り、思考後も本文が残るようにする（env_gemini3_thinking の枠確保方針）。
    // 178以降: generateWithModel 既定の thinkingLevel:low（generationConfig素通し）も併せて効く。
    const raw = await generateWithModel('gemini', prompt, systemPrompt, 4096);

    const suggestion = raw.trim();
    if (!suggestion) {
      return NextResponse.json(
        { error: 'プロンプトを起案できませんでした。もう一度お試しください。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, prompt: suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[eyecatch/prompt]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
