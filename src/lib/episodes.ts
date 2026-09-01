// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281: 📔 エピソード記録（一次情報の貯蔵）— クライアント共用の純関数・定数
//
// ナレッジ（PART-A／X-07②／N-03）は一貫して**一次情報**＝著者本人の実体験を求めているが、
// それを貯める場所が無かった。ここはその貯蔵庫の「型」と「判定」を置く。
//
// 三つの設計原則（指示書281）:
//   §2 参考例（AIの提示物）と記録欄（本人が書く）を**分離**する。参考例→記録欄への経路を作らない（R-90）
//   §3 数字は「自分の行動の数字（1日10時間）」と「効果の標榜（8割改善）」を混同しない。
//      記録欄では前者を制限せず、後者にだけ**警告**を出す（保存は妨げない・判断は院長）
//   §6 下流（note記事・X・Kindle）は記録を**脚色しない**（R-75の直接適用）
//
// 判定はすべて純関数（同じ入力→同じ出力・R-74）。AI依存の判定はこのファイルに置かない。
// サーバ専用（DB）は episodes-server.ts。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EpisodeFieldKey =
  | 'title'
  | 'period'
  | 'situation'
  | 'feelings'
  | 'details'
  | 'thoughts'
  | 'reflection';

export interface EpisodeFieldDef {
  key: EpisodeFieldKey;
  label: string;
  hint: string;
  placeholder: string;
  /** 1行入力か複数行か */
  multiline: boolean;
  /** 一次情報の価値が宿る欄（画面で強調する） */
  core?: boolean;
}

/** §4-1 記録の項目（表示順）。**すべて任意入力**＝空でも保存できる */
export const EPISODE_FIELDS: readonly EpisodeFieldDef[] = [
  { key: 'title', label: 'タイトル', hint: '短い見出し', placeholder: '例: 浪人時代の1日10時間', multiline: false },
  { key: 'period', label: '時期', hint: '年・年代・「20代前半」等で可', placeholder: '例: 19歳の春〜翌年2月', multiline: false },
  { key: 'situation', label: '状況', hint: '何が起きていたか', placeholder: '例: 現役で不合格。予備校に通いながら自宅で勉強していた', multiline: true },
  { key: 'feelings', label: '感情・身体感覚', hint: '辛さ・焦り・痛みなど', placeholder: '例: 毎朝、手のこわばりで目が覚めた。焦りで夜眠れない日が続いた', multiline: true },
  { key: 'details', label: '具体的なディテール', hint: '時刻・回数・場所・モノ。一次情報の価値はここに宿る', placeholder: '例: 朝5時起床。机の上には赤い付箋が貼られた過去問集。1日10時間、週6日', multiline: true, core: true },
  { key: 'thoughts', label: 'そのとき考えたこと・したこと', hint: '判断のプロセス', placeholder: '例: 暗記科目を朝に回し、午後は演習だけにすると決めた', multiline: true },
  { key: 'reflection', label: '今振り返って言えること', hint: '現在の視点', placeholder: '例: 量より「同じ時間に同じことをする」仕組みが効いていたと思う', multiline: true },
] as const;

export const EPISODE_FIELD_KEYS: readonly EpisodeFieldKey[] = EPISODE_FIELDS.map((f) => f.key);

/** 1欄あたりの上限（DBの保護。日常の記録で超えることはまず無い） */
export const EPISODE_FIELD_MAX = 8000;
/** タグの上限 */
export const EPISODE_TAG_MAX = 20;
export const EPISODE_TAG_LEN_MAX = 30;

/** 記録の型（API/画面共用）。テキスト欄は常に string（null を持ち回らない） */
export interface EpisodeRecord {
  id: number;
  title: string;
  period: string;
  situation: string;
  feelings: string;
  details: string;
  thoughts: string;
  reflection: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type EpisodeInput = Pick<
  EpisodeRecord,
  'title' | 'period' | 'situation' | 'feelings' | 'details' | 'thoughts' | 'reflection' | 'tags'
>;

export function emptyEpisodeInput(): EpisodeInput {
  return { title: '', period: '', situation: '', feelings: '', details: '', thoughts: '', reflection: '', tags: [] };
}

/** 表示用タイトル（空でも保存できるので、表示側で補う。DBには入れない） */
export function episodeDisplayTitle(ep: Pick<EpisodeRecord, 'title' | 'situation' | 'details' | 'period'>): string {
  const t = ep.title.trim();
  if (t) return t;
  const fallback = (ep.situation || ep.details || '').trim().replace(/\s+/g, ' ');
  if (fallback) return fallback.slice(0, 30) + (fallback.length > 30 ? '…' : '');
  return ep.period.trim() ? `（無題・${ep.period.trim()}）` : '（無題）';
}

/** 記録の本文を1本のテキストにする（下流の素材・文字数・検索の見せ方で共用） */
export function episodeToText(ep: EpisodeInput | EpisodeRecord): string {
  const lines: string[] = [];
  for (const f of EPISODE_FIELDS) {
    if (f.key === 'title') continue;
    const v = (ep[f.key] ?? '').trim();
    if (!v) continue;
    lines.push(`【${f.label}】${v}`);
  }
  return lines.join('\n');
}

export function episodeCharCount(ep: EpisodeInput | EpisodeRecord): number {
  return EPISODE_FIELDS.reduce((sum, f) => sum + (ep[f.key] ?? '').length, 0);
}

/** タグ文字列（カンマ・読点・空白区切り）を正規化する。重複・空・上限超えを落とす */
export function normalizeEpisodeTags(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,、\s]+/) : [];
  const out: string[] = [];
  for (const v of arr) {
    const t = String(v ?? '').trim().slice(0, EPISODE_TAG_LEN_MAX);
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= EPISODE_TAG_MAX) break;
  }
  return out;
}

// ── §3 効果を数値化した記述の検出（決定的・警告のみ）─────────────────────
//
// 「自分の行動の数字」（1日10時間・毎朝5時・3年続けた）は具体性であり、制限しない。
// 「効果の標榜」（8割改善・95%の人が・2倍の効果）だけを拾う。
// 判定は〈数量表現〉と〈効果語〉が**同じ文の中に**同居することで決める。
// 効果語が無ければ、どんな数字でも警告しない（=行動の数字は絶対に拾わない）。
// 辞書はここ1箇所（PLAIN_CHECK と同じ流儀）。増やすときはU55の固定ケースも足す。

/** 数量表現: 割合・倍率・「N人中M人」。時間・回数（時間/回/日/年）は含めない＝行動の数字 */
const QUANTITY_RE = /(\d+(?:[.,]\d+)?\s*(?:%|％|パーセント|割|倍)|\d+\s*人中\s*\d+\s*人|[０-９]+(?:％|割|倍))/;
/** 効果語: 治療・方法の成果を主張する語 */
export const EFFECT_WORDS: readonly string[] = [
  '改善', '効果', '効い', '効く', '治っ', '治り', '治る', '治癒', '完治', '寛解', '軽減', '緩和',
  '減少', '減っ', '減る', '向上', '上がっ', '上がる', '成功率', '満足度', '有効', '奏功', '解消',
  '消え', '再発', 'よくなっ', '良くなっ', '症状が', '痛みが',
] as const;

export interface EffectClaim {
  /** どの欄か */
  field: EpisodeFieldKey;
  /** 該当した文（そのまま） */
  sentence: string;
  /** 該当した数量表現 */
  quantity: string;
  /** 該当した効果語 */
  effectWord: string;
}

/** 文に分ける（。！？と改行）。判定の単位を文に固定する */
export function splitEpisodeSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 1つのテキストから効果の数値化を拾う（純関数） */
export function detectEffectClaimsInText(text: string, field: EpisodeFieldKey): EffectClaim[] {
  const out: EffectClaim[] = [];
  for (const sentence of splitEpisodeSentences(text)) {
    const q = QUANTITY_RE.exec(sentence);
    if (!q) continue;
    const effectWord = EFFECT_WORDS.find((w) => sentence.includes(w));
    if (!effectWord) continue;
    out.push({ field, sentence, quantity: q[1], effectWord });
  }
  return out;
}

/** 記録全体から効果の数値化を拾う。欄の並びは EPISODE_FIELDS 順＝決定的 */
export function detectEffectClaims(ep: EpisodeInput | EpisodeRecord): EffectClaim[] {
  const out: EffectClaim[] = [];
  for (const f of EPISODE_FIELDS) out.push(...detectEffectClaimsInText(ep[f.key] ?? '', f.key));
  return out;
}

export const EFFECT_CLAIM_NOTICE =
  '効果を数値化した記述があります。記録として保存はできますが、note・X・Kindleに出すときは医療広告のガードで削られる可能性があります（自分の行動の数字はそのまま使えます）。';

// ── §2 参考例（あるある）────────────────────────────────────────────
//
// 参考例は「思い出すための引き金」。断定形だと事実として受け取られやすいので**問いかけの形**に限る。
// 5〜7件（多すぎると誘導になる）。分野は限定しない（入力テーマに応じて出す）。

export const EXAMPLE_COUNT_MIN = 5;
export const EXAMPLE_COUNT_MAX = 7;
export const EXAMPLE_THEME_MAX = 200;
/** 参考例の近くに**常時**表示する注意書き（§2-2） */
export const EXAMPLE_NOTICE = '参考例は思い出すためのきっかけです。実際にあったことだけを書いてください。';

/** 問いかけの形か（末尾が「か」「？」「?」）。断定形の参考例はここで落とす */
export function isQuestionForm(s: string): boolean {
  const t = s.trim().replace(/[」』)）]+$/, '');
  return /(?:か|\?|？)$/.test(t);
}

/**
 * AIの応答から参考例を整える（決定的）:
 * 文字列以外・空・重複・断定形を落とし、上限件数で切る。
 * 下限未満でも返す（参考例は付加情報。件数が足りないことを理由に空にしない・R-39）
 */
export function normalizeExamples(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const v of arr) {
    const s = typeof v === 'string' ? v.trim().replace(/^[-・*\d.\s]+/, '') : '';
    if (!s || out.includes(s)) continue;
    if (!isQuestionForm(s)) continue;
    out.push(s);
    if (out.length >= EXAMPLE_COUNT_MAX) break;
  }
  return out;
}

// R-73: 参考例の生成は1リクエスト。25秒 ×（本番1回＋再試行1回）= 50秒 ≤ maxDuration 60秒
export const EXAMPLES_TIMEOUT_MS = 25_000;
export const EXAMPLES_RETRIES = 1;
export const EXAMPLES_MAX_DURATION_S = 60;

export function buildExamplesPrompt(theme: string): string {
  return `あなたは聞き上手なインタビュアーです。相手が「${theme}」について自分の経験を思い出す手助けをします。

# 出力するもの
その状況で**ありがちな場面**を、相手に尋ねる「問いかけ」の形で ${EXAMPLE_COUNT_MIN}〜${EXAMPLE_COUNT_MAX} 件。
- 必ず問いかけの形にする（「〜はありましたか？」「〜のような場面はどうでしたか？」）。断定形（「〜でしたよね」「〜だったはず」）は禁止
- 場面は具体的に（時刻・場所・モノ・体の感覚・周りの人）。ただし相手の事実を決めつけない
- 分野は限定しない（受験・仕事・健康・家族・趣味など、テーマに合わせる）
- 相手の記憶を上書きしない。誘導せず、思い出すきっかけになる問いにする
- 医療・健康のテーマでも、治療の効果や数値を示唆する問いにしない

# 出力形式（JSONのみ・前置き不要）
{"items": ["問いかけ1", "問いかけ2", ...]}`;
}

// ── §6 下流での活用（脚色の禁止・R-75）────────────────────────────────

/** 生成経路に**必ず**併せて注入する規約。エピソードが選ばれたときだけ入る（R-88＝オプトイン） */
export const EPISODE_FACT_GUARD = `# 著者の実体験エピソードの扱い（厳守・R-75）
- 下の「実体験エピソード」は著者本人の一次情報。**記録にある事実だけ**を使う
- 記録にない出来事・人物・会話・数字を足さない（時刻・回数・期間も記録どおり）
- 感情を誇張しない（記録の表現より強い言葉に置き換えない）
- 記録が薄い箇所は、無理に膨らませず**そのまま使うか、使わない**（想像で補わない）
- 主語は著者本人（「私」）。他者や患者の体験に置き換えない
- 記録にある「自分の行動の数字」（例: 1日10時間）はそのまま使ってよい。効果・成果の数値化は記録にあっても本文に出さない（医療広告ガードが優先）`;

/** 下流のプロンプトに載せる形。欄は埋まっているものだけ・記録の文言をそのまま */
export function formatEpisodesForPrompt(episodes: EpisodeRecord[]): string {
  if (episodes.length === 0) return '';
  const blocks = episodes.map((ep, i) => {
    const lines = [`## エピソード${i + 1}: ${episodeDisplayTitle(ep)}`];
    for (const f of EPISODE_FIELDS) {
      if (f.key === 'title') continue;
      const v = (ep[f.key] ?? '').trim();
      if (v) lines.push(`- ${f.label}: ${v}`);
    }
    if (ep.tags.length > 0) lines.push(`- タグ: ${ep.tags.join('、')}`);
    return lines.join('\n');
  });
  return `# 著者の実体験エピソード（一次情報・記録どおりに使う）\n${blocks.join('\n\n')}`;
}

/** 下流のリクエストから episodeIds を取り出す（正の整数のみ・重複除去・上限） */
export const EPISODE_SELECT_MAX = 10;
export function parseEpisodeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0 || out.includes(n)) continue;
    out.push(n);
    if (out.length >= EPISODE_SELECT_MAX) break;
  }
  return out;
}
