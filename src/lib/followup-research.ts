// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 319: 🔭 追加リサーチ — 保存済みの結果（📚リサーチ保存・🗂テキスト分析）を前提資料に、院長のプロンプトで
// ディープリサーチを続ける（純関数・DB 非依存・R-108・決定的・R-74）
//
// 発注文はここで**決定的に**組み立てる（AI で作らない）。311 の buildResearchOrder（マンダラ専用）の形を
// 「前提資料＋指示＋書き方」に一般化した汎用版。311 は不変。
// - 前提資料の本文は改変しない（R-75）。上限を超えたら末尾を切らず「上限超え」で無効化＋理由（R-101）。要約で圧縮しない
// - 医療広告ガード等は DR 経路（/api/deepresearch）の既存規約が後勝ち（R-69）。ここでは新しい規約を足さない
// - 出どころは library.metadata.followUp（キー単位・R-113）。連鎖は of に**直前だけ**を持つ（辿れば分かる・ツリー表示は範囲外）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 前提資料の本文の合計上限（字）。309（マンダラ→note の素材）と同値。Gemini 3.7 Flash の入力 $0.75/1M で約 $0.05 増 */
export const FOLLOWUP_CONTEXT_LIMIT = 60_000;
/** 前提資料の件数上限（R-101・図解の VISUAL_SOURCE_MAX_ITEMS と同値） */
export const FOLLOWUP_MAX_SOURCES = 3;
/** 院長のプロンプトの上限（字） */
export const FOLLOWUP_PROMPT_MAX = 2_000;
/** 結果タイトルに使うプロンプトの先頭の字数 */
export const FOLLOWUP_TITLE_PROMPT_CHARS = 30;
/** ダイアログのプレビューに出す冒頭の字数 */
export const FOLLOWUP_PREVIEW_CHARS = 160;

/** 前提資料にできる出どころ（📚📚🗂。🧠 AI参照素材は本便では対象外） */
export const FOLLOWUP_SCOPES = ['library', 'text_analysis'] as const;
export type FollowUpScope = (typeof FOLLOWUP_SCOPES)[number];
export function isFollowUpScope(v: unknown): v is FollowUpScope {
  return v === 'library' || v === 'text_analysis';
}
export const FOLLOWUP_SCOPE_LABEL: Record<FollowUpScope, string> = { library: '📚 リサーチ保存', text_analysis: '🗂 テキスト分析' };

export const FOLLOWUP_MODES = ['quick', 'standard', 'deep'] as const;
export type FollowUpMode = (typeof FOLLOWUP_MODES)[number];
export const FOLLOWUP_MODE_DEFAULT: FollowUpMode = 'standard';
export const FOLLOWUP_MODE_LABEL: Record<FollowUpMode, string> = { quick: 'クイック', standard: 'スタンダード', deep: 'ディープ' };
export function isFollowUpMode(v: unknown): v is FollowUpMode {
  return v === 'quick' || v === 'standard' || v === 'deep';
}

/** 実行先（通常DR＝Gemini・既定／3つのAIで比較＝314 のダイアログへ） */
export const FOLLOWUP_TARGETS = ['normal', 'compare'] as const;
export type FollowUpTarget = (typeof FOLLOWUP_TARGETS)[number];
export function isFollowUpTarget(v: unknown): v is FollowUpTarget {
  return v === 'normal' || v === 'compare';
}

/** 定型の候補チップ（押すと入力欄に文字列を入れるだけ・院長が直せる・決定的） */
export const FOLLOWUP_PROMPT_CHIPS: readonly string[] = [
  'これらの企業の直近4年の年間売上を調べて',
  'この分野の主要な論文と、その結論をまとめて',
  '競合と、その差別化点を整理して',
  '規制・法令上の注意点を調べて',
  '反論・限界・未解決の論点を挙げて',
];

/** 【書き方】の3行（前提資料の事実と新たな事実の区別・未確認の明示・数値と固有名詞の不改変） */
export const FOLLOWUP_WRITING_RULES: readonly string[] = [
  '前提資料にある事実と、新たに調べた事実を区別して書く（新たな事実は出典URLつき）',
  '前提資料に無く、調べても確認できない事項は「未確認」と書く（推測で補わない）',
  '前提資料の数値・固有名詞は改変しない',
];

export const FOLLOWUP_REJECT_NO_SOURCES = '前提資料がありません（📚🗂の保存済みの結果を選んでください）';
export const FOLLOWUP_REJECT_MISSING = '資料なし（削除済みか、他の人の資料です）';
export const FOLLOWUP_REJECT_EMPTY_PROMPT = 'プロンプトを入力してください（何を調べるかを書くと開始できます）';
export function followUpTooManyReason(count: number): string {
  return `前提資料は${FOLLOWUP_MAX_SOURCES}件までです（${count}件選択中。チェックを外して減らしてください）`;
}
export function followUpOverLimitReason(chars: number): string {
  return `前提資料が上限を超えています（合計 ${chars.toLocaleString()} 字・上限 ${FOLLOWUP_CONTEXT_LIMIT.toLocaleString()} 字）。末尾を切ったり要約したりはしません。件数を減らすか、短い資料を選んでください`;
}
export function followUpPromptTooLongReason(chars: number): string {
  return `プロンプトが長すぎます（${chars.toLocaleString()} 字・上限 ${FOLLOWUP_PROMPT_MAX.toLocaleString()} 字）`;
}

/** 前提資料の参照（画面→API・handoff に載る最小形） */
export interface FollowUpRef {
  scope: FollowUpScope;
  id: string;
}
/** 前提資料（本文つき・サーバが取得） */
export interface FollowUpSource extends FollowUpRef {
  title: string;
  text: string;
}

/** 参照の検証（fail-closed）。不正なら null（R-88: 付帯情報が無ければ何もしない） */
export function parseFollowUpRefs(v: unknown): FollowUpRef[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: FollowUpRef[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== 'object') return null;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : typeof r.id === 'number' ? String(r.id) : '';
    if (!isFollowUpScope(r.scope) || !id) return null;
    const key = `${r.scope}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scope: r.scope, id });
  }
  return out.length > 0 ? out : null;
}

/** 同じ入力→同じ順（scope→id）。逆順で渡しても発注文が一致する（R-74） */
export function sortFollowUpSources<T extends FollowUpRef>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export function followUpTotalChars(sources: readonly { text: string }[]): number {
  return sources.reduce((n, s) => n + s.text.length, 0);
}

export interface FollowUpOrder {
  ok: true;
  sources: FollowUpSource[];
  prompt: string;
  /** 発注文（決定的） */
  text: string;
  /** 前提資料の合計字数 */
  sourceChars: number;
}
export type FollowUpOrderResult = FollowUpOrder | { ok: false; reason: string };

/**
 * 発注文を組み立てる。要素の順は固定: 【前提資料】（n件）→ 各資料（タイトル・出どころ・字数・本文）→【指示】→【書き方】
 * 上限超え・件数超え・空プロンプトは ok:false＋理由（切らない・要約しない・R-101／R-75）
 */
export function buildFollowUpOrder(sourcesInput: readonly FollowUpSource[], promptInput: string): FollowUpOrderResult {
  const prompt = promptInput.replace(/\r\n?/g, '\n').trim();
  if (sourcesInput.length === 0) return { ok: false, reason: FOLLOWUP_REJECT_NO_SOURCES };
  if (sourcesInput.length > FOLLOWUP_MAX_SOURCES) return { ok: false, reason: followUpTooManyReason(sourcesInput.length) };
  const sources = sortFollowUpSources(sourcesInput);
  const sourceChars = followUpTotalChars(sources);
  if (sourceChars > FOLLOWUP_CONTEXT_LIMIT) return { ok: false, reason: followUpOverLimitReason(sourceChars) };
  if (!prompt) return { ok: false, reason: FOLLOWUP_REJECT_EMPTY_PROMPT };
  if (prompt.length > FOLLOWUP_PROMPT_MAX) return { ok: false, reason: followUpPromptTooLongReason(prompt.length) };
  const lines: string[] = [];
  lines.push(`【前提資料】（${sources.length}件）`);
  sources.forEach((s, i) => {
    if (i > 0) lines.push('');
    lines.push(`${s.title.trim() || '（無題）'}（${FOLLOWUP_SCOPE_LABEL[s.scope]}・${s.text.length.toLocaleString()}字）`);
    lines.push(s.text.replace(/\r\n?/g, '\n').replace(/\s+$/, ''));
  });
  lines.push('', '【指示】', prompt);
  lines.push('', '【書き方】', ...FOLLOWUP_WRITING_RULES.map((r) => `- ${r}`));
  return { ok: true, sources, prompt, text: lines.join('\n'), sourceChars };
}

/** ダイアログの開始ボタンの可否（順序は固定・R-101）。本文を取る前でも件数と字数だけで判定できる */
export function followUpStartState(
  sources: readonly { chars: number; missing?: boolean }[],
  prompt: string,
): { enabled: boolean; reason: string | null } {
  if (sources.length === 0) return { enabled: false, reason: FOLLOWUP_REJECT_NO_SOURCES };
  if (sources.length > FOLLOWUP_MAX_SOURCES) return { enabled: false, reason: followUpTooManyReason(sources.length) };
  if (sources.some((s) => s.missing)) return { enabled: false, reason: FOLLOWUP_REJECT_MISSING };
  const chars = sources.reduce((n, s) => n + s.chars, 0);
  if (chars > FOLLOWUP_CONTEXT_LIMIT) return { enabled: false, reason: followUpOverLimitReason(chars) };
  const p = prompt.trim();
  if (!p) return { enabled: false, reason: FOLLOWUP_REJECT_EMPTY_PROMPT };
  if (p.length > FOLLOWUP_PROMPT_MAX) return { enabled: false, reason: followUpPromptTooLongReason(p.length) };
  return { enabled: true, reason: null };
}

/** 結果のタイトルの既定「<プロンプトの先頭30字> — <元資料のタイトル>」（院長が変更できる・決定的） */
export function followUpTitle(prompt: string, sourceTitles: readonly string[]): string {
  const p = prompt.replace(/\s+/g, ' ').trim();
  const head = Array.from(p).slice(0, FOLLOWUP_TITLE_PROMPT_CHARS).join('') || '追加リサーチ';
  const titles = sourceTitles.map((t) => t.replace(/\s+/g, ' ').trim() || '（無題）');
  return titles.length > 0 ? `${head} — ${titles.join('・')}` : head;
}

// ───────────────────────────────────────────────────────────────────────────
// 出どころ library.metadata.followUp（R-113 キー単位）
// ───────────────────────────────────────────────────────────────────────────

export interface FollowUpOf {
  scope: FollowUpScope;
  item_key: string;
  title: string;
}
export interface FollowUpMeta {
  of: FollowUpOf[];
  prompt: string;
  mode: FollowUpMode;
  model: string;
  /** ISO */
  at: string;
  /** ☑ 元資料の用途カテゴリ・マイフォルダを結果に付ける（保存APIのフックが読む・既定オン R-77） */
  inherit: boolean;
}

/** 保存に載せる metadata.followUp を組む（決定的。at は呼び出し側が渡す） */
export function followUpMetadata(input: {
  sources: readonly { scope: FollowUpScope; id: string; title: string }[];
  prompt: string;
  mode: FollowUpMode;
  model: string;
  at: string;
  inherit: boolean;
}): FollowUpMeta {
  return {
    of: sortFollowUpSources(input.sources).map((s) => ({ scope: s.scope, item_key: String(s.id), title: (s.title || '').trim() || '（無題）' })),
    prompt: input.prompt.trim(),
    mode: input.mode,
    model: input.model,
    at: input.at,
    inherit: !!input.inherit,
  };
}

/** metadata.followUp の読み出し（形を検証して不正なら null・R-113） */
export function parseFollowUp(metadata: unknown): FollowUpMeta | null {
  let meta: Record<string, unknown> | null = null;
  try {
    meta = typeof metadata === 'string' ? (JSON.parse(metadata) as Record<string, unknown>) : ((metadata ?? null) as Record<string, unknown> | null);
  } catch {
    return null;
  }
  const f = meta?.followUp;
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  if (!Array.isArray(o.of) || o.of.length === 0) return null;
  const of: FollowUpOf[] = [];
  for (const x of o.of) {
    if (!x || typeof x !== 'object') return null;
    const r = x as Record<string, unknown>;
    if (!isFollowUpScope(r.scope) || typeof r.item_key !== 'string' || !r.item_key) return null;
    of.push({ scope: r.scope, item_key: r.item_key, title: typeof r.title === 'string' ? r.title : '' });
  }
  if (typeof o.prompt !== 'string' || !isFollowUpMode(o.mode) || typeof o.model !== 'string' || typeof o.at !== 'string') return null;
  return { of, prompt: o.prompt, mode: o.mode, model: o.model, at: o.at, inherit: o.inherit === true };
}

/** 結果の行の「🔭 <元資料のタイトル> を元に」 */
export function followUpOriginLabel(meta: FollowUpMeta): string {
  const titles = meta.of.map((o) => o.title.trim() || '（無題）');
  return `🔭 ${titles.join('・')} を元に`;
}

/** プロンプトの冒頭（行の添え書き用） */
export function followUpPromptHead(meta: FollowUpMeta, max = 40): string {
  const p = meta.prompt.replace(/\s+/g, ' ').trim();
  const a = Array.from(p);
  return a.length > max ? `${a.slice(0, max).join('')}…` : p;
}

/** 元資料ごとの「🔭 追加: n」（画面側の導出。同じ画面に読み込まれた結果から数える。サーバ集計は followup-research-server） */
export function followUpCountsOf(items: readonly { metadata?: unknown }[], scope: FollowUpScope): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const f = parseFollowUp(it.metadata);
    if (!f) continue;
    for (const o of f.of) if (o.scope === scope) out[o.item_key] = (out[o.item_key] ?? 0) + 1;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// ダイアログ → 🔭ディープリサーチ画面への受け渡し（新タブ＝localStorage の一回限りキー・R-121）
// ───────────────────────────────────────────────────────────────────────────

export const FOLLOWUP_HANDOFF_KEY = 'followup-research-handoff';
export const FOLLOWUP_FROM_PARAM = 'followup';
export const FOLLOWUP_PAGE_HREF = `/dashboard/deepresearch?from=${FOLLOWUP_FROM_PARAM}`;

export interface FollowUpHandoff {
  sources: { scope: FollowUpScope; id: string; title: string; chars: number }[];
  prompt: string;
  mode: FollowUpMode;
  target: FollowUpTarget;
  inherit: boolean;
  at: string;
}

/** handoff の検証（受け側・fail-closed）。壊れていれば null＝何もしない */
export function parseFollowUpHandoff(raw: unknown): FollowUpHandoff | null {
  let o: Record<string, unknown> | null = null;
  try {
    o = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? null) as Record<string, unknown> | null);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (!Array.isArray(o.sources) || o.sources.length === 0 || o.sources.length > FOLLOWUP_MAX_SOURCES) return null;
  const sources: FollowUpHandoff['sources'] = [];
  for (const x of o.sources) {
    if (!x || typeof x !== 'object') return null;
    const r = x as Record<string, unknown>;
    if (!isFollowUpScope(r.scope) || typeof r.id !== 'string' || !r.id) return null;
    sources.push({ scope: r.scope, id: r.id, title: typeof r.title === 'string' ? r.title : '', chars: typeof r.chars === 'number' ? r.chars : 0 });
  }
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : '';
  if (!prompt) return null;
  return {
    sources,
    prompt,
    mode: isFollowUpMode(o.mode) ? o.mode : FOLLOWUP_MODE_DEFAULT,
    target: isFollowUpTarget(o.target) ? o.target : 'normal',
    inherit: o.inherit !== false,
    at: typeof o.at === 'string' ? o.at : '',
  };
}

/** 画面のバナー「🔭 前提資料: A・B（2件・12,345字）」 */
export function followUpBannerLabel(sources: readonly { title: string; chars: number }[]): string {
  const titles = sources.map((s) => s.title.trim() || '（無題）').join('・');
  const chars = sources.reduce((n, s) => n + s.chars, 0);
  return `🔭 前提資料: ${titles}（${sources.length}件・${chars.toLocaleString()}字）`;
}

/** 時間切れ（サーバ側の個別タイムアウト・R-118）の画面文言 */
export const FOLLOWUP_TIMEOUT_MESSAGE = '時間切れで中断しました（結果は保存していません）。分量を減らすか、前提資料を短くして再実行してください。';
