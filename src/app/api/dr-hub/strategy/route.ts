import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { PERSONA_STYLES, PERSONA_STYLE_KEYS } from '@/lib/persona-styles';
import { getPlaybook, PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';
import { appendStrategyDisclaimer } from '@/lib/knowledge/strategyDisclaimer';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 261④: 収益化のための発信戦略の策定。
// - POST { drIds: string[]（1〜10・DR記事群）, articleIds?: string[]（0〜10・生成済みnote記事群）, model? }
//   → ターゲティング／投稿回数・スケジュール／note⇄X⇄Kindleの導線設計 を編集可能なMarkdownで返す
// - 生成のみで**DBに保存しない**（保存は画面から /api/text-analysis/saves への明示操作のみ）
// - **戦略はあくまで提案**。数値の捏造・成果の断定（「フォロワーが必ず増える」等）は禁止（プロンプトで固定）

const MAX_SOURCES = 10;
const PER_SOURCE_CHARS = 8000; // 戦略立案には各記事の全文は不要（要旨が掴めれば十分）

const STRATEGY_RULES = `# 戦略策定の厳守事項
- これは**提案**である。成果の断定（「必ず増える」「確実に収益化できる」等）を書かない
- フォロワー数・PV・収益などの**具体的な数値目標や予測値を作らない**（渡された資料にある数値の転記のみ可）
- 投稿時間帯・曜日の提案は「一般に反応が得られやすいとされる時間帯」のような**一般論の提案**として書き、根拠のない断定をしない
- 医療広告規制に配慮する（受診誘導・効果保証を戦略に組み込まない）:
${MEDICAL_AD_NG_RULES}
- 誇張・不安煽り・限定性の演出を戦略に含めない
- 実行しやすさを優先し、1人（院長）が週数時間で回せる現実的な分量にする`;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const drIds = (Array.isArray(body.drIds) ? (body.drIds as unknown[]) : [])
      .map((v) => String(v).trim())
      .filter(Boolean)
      .slice(0, MAX_SOURCES);
    const articleIds = (Array.isArray(body.articleIds) ? (body.articleIds as unknown[]) : [])
      .map((v) => String(v).trim())
      .filter(Boolean)
      .slice(0, MAX_SOURCES);
    if (drIds.length === 0) {
      return NextResponse.json({ error: 'drIds（DR記事のID）が1件以上必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    // owner検証つきで本文を取得（他ユーザー・他typeの行は黙って落ちる）
    const drRows = (await sql`
      SELECT id, title, content FROM library
      WHERE user_id = ${userId} AND type = 'deepresearch' AND id = ANY(${drIds})
    `) as { id: string; title: string; content: string | null }[];
    if (drRows.length === 0) {
      return NextResponse.json({ error: 'DR記事が見つかりません' }, { status: 404 });
    }
    const articleRows = articleIds.length
      ? ((await sql`
          SELECT id, title, content FROM library
          WHERE user_id = ${userId} AND type = 'note-article' AND id = ANY(${articleIds})
        `) as { id: string; title: string; content: string | null }[])
      : [];

    const aiModel = body.model === 'claude' ? 'claude' : DEFAULT_AI_MODEL;

    const personaList = PERSONA_STYLE_KEYS.map(
      (k) => `- ${PERSONA_STYLES[k].emoji} ${PERSONA_STYLES[k].label}: ${PERSONA_STYLES[k].hint}`,
    ).join('\n');

    const drSection = drRows
      .map((r, i) => `## DR記事${i + 1}: ${r.title}\n${(r.content || '').slice(0, PER_SOURCE_CHARS)}`)
      .join('\n\n---\n\n');
    const articleSection = articleRows.length
      ? `\n# 生成済みのnote記事（${articleRows.length}件）\n` +
        articleRows
          .map((r, i) => `## note記事${i + 1}: ${r.title}\n${(r.content || '').slice(0, PER_SOURCE_CHARS / 2)}`)
          .join('\n\n---\n\n')
      : '';

    // 265d: KB v2.0 の④用の章を注入（4層モデル・ポジショニング・課金レイヤー・連携・
    // ワークフロー・セットアップ・数値リファレンス）。院長は Xプレミアム・noteプレミアム加入済み。
    const playbook = getPlaybook([
      'CORE-01', 'X-13', 'XP-02', 'XP-03',
      'NP-01', 'NP-02', 'NP-03', 'NP-04', 'NP-05', 'NP-06',
      'N-14', 'C-01', 'C-02', 'C-03', 'C-04',
      'PART-W', 'PART-S', 'PART-R',
    ]);

    const system = `あなたは医療クリニックの情報発信を支援するコンテンツ戦略プランナーです。
渡された素材（ディープリサーチ記事群・生成済みnote記事群）をもとに、院長が1人で実行できる発信戦略を策定してください。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${playbook}

# 前提
- 院長は **Xプレミアム・noteプレミアムの両方に加入済み**。課金レイヤーの施策（予約投稿・数量限定・価格上限10万円・
  コメント欄ON/OFF・リプライ優先表示 等）は「使える前提」で戦略に組み込んでよい

# ナレッジとガードの優先順位（最重要・厳守）
上のナレッジと以下の規約が衝突する場合は、**必ず規約を優先**する。
${STRATEGY_RULES}

# 数値の扱い（§8-1・厳守）
- XP-01のインプレッション倍率（プレミアム約6倍／プラス約15倍）やPART-Rの数値を提示する場合は、
  「中央値の比較であり対照実験ではない。自己選択バイアスを含み得る」「実践知見の集約値であり公式の確定値ではない。
  自アカウントの実測で補正する」という補正を必ず併記する。数値を断定的な効果予測として書かない

# 使える発信チャネル
- note記事（無料公開・この素材から生成できる）
- X投稿（単発ミニ講義・スレッド。note記事への導線）
- Kindle本（複数のDR記事・note記事を素材にできる。本命コンテンツ候補）

# 選べる読者ペルソナ（発信ハブに定義済み）
${personaList}

# 出力形式（Markdown・編集可能なドキュメントとして保存される前提で見出しを揃える）
# 発信戦略: <素材群を要約した短いタイトル>
## 1. 4層モデルでの現在地（CORE-01: あり方／設計技術／課金ツール／収益のどこが手薄か）
## 2. ポジショニング（X-13: WANTS × CAN × MUST の3円の重なりの言語化）
## 3. ターゲティング（どのペルソナに何を届けるか）
## 4. 導線設計（C-01/C-02: X＝認知と信頼／note＝収益の役割分担。URLはリプライに置く運用まで含める）
## 5. 収益ポートフォリオの成長順路（C-03/N-14: 単発→買い切りマガジン→メンバーシップ→定期購読/高単価のどのSTEPか）
## 6. プレミアム機能の使いどころ（NP-02〜NP-06: 予約投稿・数量限定・価格上限10万円・コメント欄ON/OFF・公式キュレーション）
## 7. 週次運用モデル（C-04ベースで、素材と診療の両立ができる分量に調整）
## 8. 追跡KPI（インプレッション・URL共有数・ブックマーク数・リプライ往復数・プロフィール遷移率・note購入率）
## 9. 数値リファレンス（PART-Rから戦略に関係する値のみ。必ず上記の補正を併記）
## 10. 最初の2週間のアクションリスト（チェックボックス形式）

冒頭に「この戦略はAIによる提案です。実際の成果を保証するものではありません。」の1行を必ず入れる。
前置き・コードフェンスは不要。`;

    const prompt = `以下の素材をもとに発信戦略を策定してください。

# ディープリサーチ記事群（${drRows.length}件）
${drSection}
${articleSection}`;

    // 265d: KB注入でプロンプトが大きくなったぶん、出力枠は据え置きでも思考分の余裕を確認済み（12000）
    const content = await generateWithModel(aiModel, prompt, system, 12000, GEMINI_TEXT_THINKING_MEDIUM);
    if (!content || !content.trim()) {
      return NextResponse.json({ error: '戦略の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      // §8-1: 数値の補正はプロンプト指示に加えて、サーバー側で定型の注意書きを必ず末尾に付与（決定的な担保）
      content: appendStrategyDisclaimer(content),
      usedDrIds: drRows.map((r) => r.id),
      usedArticleIds: articleRows.map((r) => r.id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/strategy] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
