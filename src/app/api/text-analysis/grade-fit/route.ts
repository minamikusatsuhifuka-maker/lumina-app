import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { robustJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 212: 横断分析「等級評価・人材像」の第2パス（方針適合判定・恒久ルート）。
// 本文Markdown（cross-analyze・ストリーミング）とは別に、対象資料が当院の人材育成方針に
// 合うか／合わないかを 🟢match／🟡caution／⚪neutral で判定してJSONで返す。
// - 判定対象は「元資料テキスト」が主・生成済み分析本文は補助（二次加工への判定を避ける・213指示2）
// - パースは robustJsonParse＋全textブロック連結（content[0]固定参照禁止・206/207の原則）
// - 失敗時は偽の判定を返さず502（fail-closed。UI側は本文無傷のまま⚠️＋再試行を表示）
// - 件数（matchCount等）はAIに書かせずサーバ側で集計（152: AIに数値を書かせない）

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface FitSegment {
  text: string;
  fitLevel: 'match' | 'caution' | 'neutral';
  axes: string[];
  rationale: string;
  reframe?: string;
}

export interface FitSummary {
  matchCount: number;
  cautionCount: number;
  neutralCount: number;
  matchHighlights: string[];
  cautionNotes: string[];
}

const VALID_AXES = ['才', '徳', '美', '感謝', '誠実', '分かち愛', '選択理論', 'インサイドアウト'];

// 1資料あたりの入力上限（判定は要点抽出なので全文は不要。合計入力を抑える）
const PER_ARTICLE_CHARS = 6000;

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { articles, analysisText } = (await req.json()) as {
      articles: Array<{ title?: string; content: string }>;
      analysisText?: string;
    };
    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: '対象資料がありません' }, { status: 400 });
    }

    const articlesText = articles
      .map(
        (a, i) => `## 資料${i + 1}${a.title ? `：${a.title}` : ''}
${(a.content ?? '').slice(0, PER_ARTICLE_CHARS)}`,
      )
      .join('\n---\n');

    const prompt = `あなたは南草津皮フ科クリニックの人材育成方針に照らして資料を選別するアシスタントです。
以下の【元資料】の内容が、当院の方針に合うか／合わないかを判定してください。

# 判定基準（CDB 2026年7月版準拠）

## 🟢 合致（match）— 以下のいずれかに沿う内容
- 人材育成方針: 才・徳・美を備えた、明るくポジティブなリーダー
  - 才=主体的に取り組み成し遂げる能力 ／ 徳=素直さ・謙虚さ・思いやり・信頼される品性 ／ 美=内面も外見も磨き美しく生きる姿勢
- 理念 A.I.R.: 感謝（Appreciation）・誠実（Integrity）・分かち愛（Relationship）
- 選択理論・リードマネジメント（内発的動機・上質世界・身に付けたい7つの習慣）
- インサイドアウト（「過去と他人は変えられない、変えられるのは自分と未来」）
- 成長三段階: 自己愛 → 自己成長 → 他者貢献
- Win-Win以外すべてLose ／ 業績と人間関係の両立（クオリティカンパニー）

## 🟡 要注意（caution）— 以下に該当・接近する内容
- 外的コントロール（致命的な7つの習慣: 批判する・責める・文句を言う・ガミガミ言う・脅す・罰する・褒美で釣る）
- ボスマネジメント的手法（恐怖・命令・強制による管理）
- 他責・無責任・無関心を助長する内容
- 相対評価・人と比べる評価、個人数字の晒し上げ（当院は絶対評価・チーム数字のみ）
- アウトサイドイン（環境や他人のせいにする枠組み）

## ⚪ 中立（neutral）
- 事実情報・手順・データなど、方針との整合を問わない内容

# 厳守事項
- 判定対象はあくまで【元資料】の内容。参考の分析本文は文脈理解の補助にのみ使う
- 資料に書かれていないことを推測で補わない
- text は元資料から抽出した文・要点（原文の丸写しでなく要約可）。10〜20項目程度で資料全体をカバーする
- axes は match の項目のみ、${VALID_AXES.join('・')} のうち該当するもの（複数可）
- reframe は caution の項目のみ、「当院ではどう読み替えるか」を1文で

# 出力形式（このJSONのみを返す。前置き・後置き不要）
{
  "fitSegments": [
    { "text": "...", "fitLevel": "match" | "caution" | "neutral", "axes": ["才"], "rationale": "判定理由を1文で", "reframe": "cautionのみ" }
  ],
  "fitSummary": {
    "matchHighlights": ["特に方針に合致する上位3〜5点"],
    "cautionNotes": ["要注意の要点＋読み替えの一言"]
  }
}

# 元資料（${articles.length}件・判定対象）
${articlesText}
${analysisText ? `\n# 参考: 生成済みの分析本文（文脈理解の補助。判定対象ではない）\n${analysisText.slice(0, 6000)}` : ''}`;

    const message = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });

    // 全textブロック連結（content[0]固定参照だと非textブロック先頭時に空になる。207実測）
    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');

    const parsed = robustJsonParse<{
      fitSegments?: Array<Partial<FitSegment>>;
      fitSummary?: Partial<FitSummary>;
    }>(raw);

    // サーバ側検証: fitLevel は3値のみ・axes は正規一覧のみ・件数は自前集計
    const fitSegments: FitSegment[] = (Array.isArray(parsed.fitSegments) ? parsed.fitSegments : [])
      .filter((s) => typeof s?.text === 'string' && s.text.trim())
      .map((s) => {
        const fitLevel: FitSegment['fitLevel'] =
          s.fitLevel === 'match' || s.fitLevel === 'caution' ? s.fitLevel : 'neutral';
        return {
          text: String(s.text).trim(),
          fitLevel,
          axes:
            fitLevel === 'match' && Array.isArray(s.axes)
              ? s.axes.filter((a): a is string => typeof a === 'string' && VALID_AXES.includes(a))
              : [],
          rationale: typeof s.rationale === 'string' ? s.rationale : '',
          reframe: fitLevel === 'caution' && typeof s.reframe === 'string' ? s.reframe : undefined,
        };
      });

    if (fitSegments.length === 0) {
      // 空の判定は「成功」として返さない（偽の全中立に見えるため）。fail-closed で再試行を促す
      return NextResponse.json({ error: '判定結果が空でした' }, { status: 502 });
    }

    const fitSummary: FitSummary = {
      matchCount: fitSegments.filter((s) => s.fitLevel === 'match').length,
      cautionCount: fitSegments.filter((s) => s.fitLevel === 'caution').length,
      neutralCount: fitSegments.filter((s) => s.fitLevel === 'neutral').length,
      matchHighlights: Array.isArray(parsed.fitSummary?.matchHighlights)
        ? parsed.fitSummary.matchHighlights.filter((x): x is string => typeof x === 'string').slice(0, 5)
        : [],
      cautionNotes: Array.isArray(parsed.fitSummary?.cautionNotes)
        ? parsed.fitSummary.cautionNotes.filter((x): x is string => typeof x === 'string')
        : [],
    };

    return NextResponse.json({ fitSegments, fitSummary });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    console.error('grade-fit failed:', message);
    return NextResponse.json(
      { error: `方針適合判定に失敗しました: ${message}` },
      { status: 502 },
    );
  }
}
