// 317 §3-2: プレゼン素材パック（テキスト系）。1件ずつ独立（R-39）: kind ごとに 1 リクエスト。
// - 元＝まとめの保存行（library・要約＋詳細）。本文は fetchVisualSources（315）で読む
// - slides／qa: Gemini（Markdown）。glossary: Gemini（JSON）→ term と evidence の実在検証 → 表（Markdown）。citations: 決定的抽出（AIなし）
// - 公開される種類（slides／qa／glossary）は医療広告ガードをプロンプト末尾（後勝ち・R-69）＋出力の NG 表現を警告として metadata に
// - 保存は library に別行（type='pack'・metadata.pack={of, kind}）。パック用の新テーブルは作らない
import { stripInlineLatex } from '@/lib/note-format';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_MODEL, GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { findBannedExpressions } from '@/lib/content-verify';
import { fetchVisualSources } from '@/lib/visuals-server';
import { parseTalkTarget } from '@/lib/visuals';
import { getPersonaStyle } from '@/lib/persona-styles';
import { MERGE_REPORT_GROUP } from '@/lib/merge-report';
import {
  PACK_PUBLIC_KINDS,
  PACK_TYPE,
  buildGlossaryPrompt,
  buildQaPrompt,
  buildSlidesPrompt,
  citationsMarkdown,
  extractCitations,
  glossaryMarkdown,
  isPackTextKind,
  packMetadata,
  packTags,
  packTitle,
  validateGlossary,
} from '@/lib/presentation-pack';

export const runtime = 'nodejs';
export const maxDuration = 120;
const PACK_TIMEOUT_MS = 100_000;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; ids?: unknown; sourceIds?: unknown; fixture?: unknown; sourceText?: unknown; sourceTitle?: unknown; talk?: unknown };
  const kind = body.kind;
  if (!isPackTextKind(kind) || kind === 'script') return NextResponse.json({ error: 'kind は slides / qa / glossary / citations のいずれかです（script は画面側の handoff）' }, { status: 400 });
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 3);
  // 325: プレゼン構成の9マスから直接（オプトイン・R-88）: sourceText＋sourceTitle（＋talk）。ids が無いときだけ
  const directText = typeof body.sourceText === 'string' ? body.sourceText.trim().slice(0, 60_000) : '';
  const talk = body.talk !== undefined && body.talk !== null ? parseTalkTarget(body.talk) : null;
  if (ids.length === 0 && (directText.length < 20 || kind !== 'slides')) return NextResponse.json({ error: 'まとめの保存行 ids が必要です（プレゼン構成からの直接指定は slides だけ）' }, { status: 400 });
  try {
    const rows = ids.length > 0 ? await fetchVisualSources(guard.userId, 'library', ids) : [];
    if (ids.length > 0 && rows.length === 0) return NextResponse.json({ error: 'まとめの行が見つかりません' }, { status: 404 });
    const baseTitle = ids.length > 0 ? rows[0].title : (typeof body.sourceTitle === 'string' && body.sourceTitle.trim() ? body.sourceTitle.trim().slice(0, 120) : 'プレゼン構成');
    const source = ids.length > 0 ? rows.map((r) => `# ${r.title}\n\n${r.text}`).join('\n\n---\n\n').slice(0, 60_000) : directText;
    let content = '';
    const extra: Record<string, unknown> = {};
    if (kind === 'citations') {
      // 引用集は元資料（sourceIds＝まとめの元）からも抜く。無ければまとめ自身から
      const srcIds = (Array.isArray(body.sourceIds) ? body.sourceIds : []).map(String).filter(Boolean).slice(0, 10);
      const originals = srcIds.length > 0 ? await fetchVisualSources(guard.userId, 'library', srcIds).catch(() => []) : [];
      const items = extractCitations((originals.length > 0 ? originals : rows).map((r) => ({ title: r.title, text: r.text })));
      content = citationsMarkdown(items);
      extra.count = items.length;
    } else {
      const talkLabel = talk ? { ...talk, personaLabel: talk.persona ? (() => { const p = getPersonaStyle(talk.persona); return `${p.emoji} ${p.label}`; })() : null } : null;
      const { system, prompt } = kind === 'slides' ? buildSlidesPrompt(source, talkLabel) : kind === 'qa' ? buildQaPrompt(source) : buildGlossaryPrompt(source);
      let raw: string;
      if (typeof body.fixture === 'string') raw = body.fixture;
      else if (body.fixture !== undefined) raw = JSON.stringify(body.fixture);
      else {
        raw = await Promise.race([
          generateWithModel('gemini', prompt, system, 8192, kind === 'glossary' ? { responseMimeType: 'application/json', ...GEMINI_TEXT_THINKING_LOW } : GEMINI_TEXT_THINKING_LOW),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`時間切れです（${PACK_TIMEOUT_MS / 1000}秒）。この素材だけ再実行できます`)), PACK_TIMEOUT_MS)),
        ]);
      }
      if (kind === 'glossary') {
        let parsed: unknown;
        try {
          parsed = robustJsonParse(raw);
        } catch {
          return NextResponse.json({ error: 'AI の出力を JSON として読めませんでした（この素材だけ再実行できます）', kind }, { status: 502 });
        }
        const { terms, dropped } = validateGlossary(parsed, source);
        if (terms.length === 0) return NextResponse.json({ error: `引用が実在する用語がありません（${dropped}件を捨てました）`, kind, dropped }, { status: 422 });
        content = stripInlineLatex(glossaryMarkdown(terms));
        extra.dropped = dropped;
        extra.count = terms.length;
      } else {
        // R-114: note記事の整形（1文1行・見出し段）は note の6経路限定。素材は Gemini の出力（## 見出し指定）をそのまま使う
        content = stripInlineLatex(raw.trim());
        if (!content) return NextResponse.json({ error: 'AI の出力が空でした', kind }, { status: 502 });
      }
      if (PACK_PUBLIC_KINDS.includes(kind)) {
        const warnings = findBannedExpressions(content, { maxResults: 10 }).map((b) => `${b.matched}（${b.reason}）`);
        if (warnings.length > 0) extra.adWarnings = warnings;
      }
      extra.model = body.fixture !== undefined ? 'fixture' : GEMINI_TEXT_MODEL;
    }
    const id = uuidv4();
    const title = packTitle(kind, baseTitle);
    const metadata = packMetadata(ids, kind, { ...extra, generatedAt: new Date().toISOString(), ...(ids.length === 0 ? { source: 'visual_plan', sourceTitle: baseTitle, ...(talk ? { talk } : {}) } : {}) });
    await sql`INSERT INTO library (id, user_id, type, title, content, metadata, tags, group_name, is_favorite, folder_name)
      VALUES (${id}, ${guard.userId}, ${PACK_TYPE}, ${sanitizeForDb(title)}, ${sanitizeForDb(content)}, ${JSON.stringify(metadata)}, ${packTags(kind)}, ${MERGE_REPORT_GROUP}, 0, NULL)`;
    return NextResponse.json({ id, title, kind, chars: content.length, ...extra });
  } catch (e) {
    console.error('[pack]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : '素材の生成に失敗しました', kind }, { status: 500 });
  }
}
