import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import {
  DEFAULT_NOTE_STYLE,
  NOTE_STYLES,
  NOTE_STYLE_KEYS,
  type NoteStyleKey,
} from '@/lib/note-styles';
import {
  MAX_BUNDLE_SOURCES,
  BUNDLE_SOURCE_META,
  normalizeBundleRefs,
} from '@/lib/note-bundle';
import { fetchBundleMaterials } from '@/lib/note-bundle-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 179/180 パス1: 選択された保存資料から「note記事プラン」をJSONで提案する。
// - 180: 素材は 🧠AI参照素材(context_saves) と 🗂テキスト分析(text_analysis_saves) を横断選択できる。
//   受け取りは {source,id}[]（後方互換: ids number[] は context 扱い）。
//   2テーブルでIDが衝突するため、プラン内の資料キーは ctx-<id> / ana-<id> の文字列。
// - 本文はサーバ側でIDから直接取得（owner検証は両テーブルとも必須）。一覧APIの本文非返却を壊さない
// - 出力が短いプラン提案のため thinking は low（178の設計）。JSON mime + robustJsonParse（確立方式）
// - プランは人間（院長）が確認・編集してからパス2へ進む前提。この段階で記事は作らない

// パス1に渡す各資料の本文抜粋の上限（要約フィールドが無いため先頭抜粋で代用）
const EXCERPT_CHARS = 3000;

interface PlanArticle {
  title: string;
  sources: string[]; // 資料キー（ctx-<id> / ana-<id>）
  points: string[];
  style: NoteStyleKey;
}

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const userId = guard.userId;

  try {
    const body = (await req.json()) as { sources?: unknown; ids?: unknown };
    const refs = normalizeBundleRefs(body);
    if (refs.length === 0) {
      return NextResponse.json({ error: '資料を選択してください' }, { status: 400 });
    }
    if (refs.length > MAX_BUNDLE_SOURCES) {
      return NextResponse.json(
        { error: `選択できる資料は最大${MAX_BUNDLE_SOURCES}件です（${refs.length}件選択中）` },
        { status: 400 },
      );
    }

    const rows = await fetchBundleMaterials(userId, refs);
    if (rows.length === 0) {
      return NextResponse.json({ error: '選択された資料が見つかりません' }, { status: 404 });
    }

    const materialsSection = rows
      .map(
        (r) =>
          `## 資料ID: ${r.key}（種別: ${BUNDLE_SOURCE_META[r.source].label}）\n### タイトル\n${r.topic}\n### 内容（先頭抜粋）\n${r.text.slice(0, EXCERPT_CHARS)}`,
      )
      .join('\n\n---\n\n');

    const styleGuide = NOTE_STYLE_KEYS.map(
      (k) => `- "${k}": ${NOTE_STYLES[k].emoji} ${NOTE_STYLES[k].label} — ${NOTE_STYLES[k].description}`,
    ).join('\n');

    const system = `あなたは note プラットフォームの編集者です。手元の資料群から「どんな記事を何本作れるか」を設計するのが仕事です。読者にとって価値が明確で、1本1テーマに絞られた記事プランを提案してください。`;

    const prompt = `以下の${rows.length}件の資料から作れる note 記事のプランを提案してください。

# 資料一覧
${materialsSection}

# プランの作り方
- 資料の内容から、読者にとって価値のある記事テーマを見つけて記事に分ける（1本1テーマ。無理に本数を増やさない）
- 各記事には、その記事で実際に使う資料のIDだけを割り当てる（全資料を全記事に割り当てない）
- sources に入れる資料IDは、資料一覧の「資料ID:」の文字列（例: "ctx-12"・"ana-34"）をそのまま使う
- points は、その記事に盛り込む要点（資料の内容に基づく具体的な要点を3〜6個）
- style は記事の内容に最も合う文体を下記から選ぶ（迷ったら "${DEFAULT_NOTE_STYLE}"）:
${styleGuide}
- title は読者の興味を引く30〜40字。誇大表現・効果保証は使わない
- 要点に数値を書く場合は資料に書かれている数値の転記のみ可。資料に無い数値を作らない

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "articles": [ { "title": "記事タイトル", "sources": ["ctx-12", "ana-34"], "points": ["要点1", "要点2"], "style": "friendly|expert|balanced|story" } ] }`;

    // プラン提案は出力が短い＝thinking low + JSON mime（178の設計・確立方式）
    const raw = await generateWithModel('gemini', prompt, system, 8192, {
      responseMimeType: 'application/json',
      ...GEMINI_TEXT_THINKING_LOW,
    });

    const parsed = robustJsonParse<{ articles?: unknown }>(raw);
    const validKeys = new Set(rows.map((r) => r.key));
    const articles: PlanArticle[] = (Array.isArray(parsed.articles) ? parsed.articles : [])
      .map((a: any): PlanArticle | null => {
        const title = typeof a?.title === 'string' ? a.title.trim() : '';
        if (!title) return null;
        const sources = (Array.isArray(a?.sources) ? a.sources : [])
          .map((s: unknown) => String(s).trim())
          .filter((k: string) => validKeys.has(k));
        const points = (Array.isArray(a?.points) ? a.points : [])
          .map((p: unknown) => String(p).trim())
          .filter(Boolean);
        const style: NoteStyleKey =
          typeof a?.style === 'string' && (NOTE_STYLE_KEYS as string[]).includes(a.style)
            ? (a.style as NoteStyleKey)
            : DEFAULT_NOTE_STYLE;
        // 資料の割り当てが空になったプランは全選択資料でフォールバック（生成不能を防ぐ）
        return { title, sources: sources.length > 0 ? sources : rows.map((r) => r.key), points, style };
      })
      .filter((a): a is PlanArticle => a !== null);

    if (articles.length === 0) {
      return NextResponse.json({ error: 'プランの提案に失敗しました。もう一度お試しください' }, { status: 502 });
    }

    // 編集UI用に資料のキー・種別・タイトル一覧も返す（本文は返さない）
    const materials = rows.map((r) => ({ key: r.key, source: r.source, id: r.id, topic: r.topic }));
    return NextResponse.json({ articles, materials });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-bundle/plan] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
