// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindle本 → note記事の多軸展開（指示書269）— 章 × ペルソナ × 切り口
// - 章・節は既存構造をそのまま素材の単位にする（分割境界をAIに考えさせない＝決定的）
// - ペルソナは persona-styles.ts の9種を再利用（新規実装しない）
// - 切り口（7種）はここが正本。X-02の加点シグナルに紐づけて設計
// - 書籍本文は**複製せず書き下ろす**（KDPセレクトの10%制限が構造的に問題にならない設計・§2）
// - 検証はプロンプト遵守に依存しない二段構え（書籍文脈の残存検出・本文一致度の概算＝このファイルの純関数）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RemixAngleKey =
  | 'mechanism'
  | 'qa'
  | 'clinical'
  | 'glossary'
  | 'compare'
  | 'daily'
  | 'detour';

export interface RemixAngle {
  key: RemixAngleKey;
  emoji: string;
  label: string;
  hint: string;
  /** 狙う加点シグナル（X-02） */
  signal: string;
  promptBlock: string;
}

export const REMIX_ANGLES: Record<RemixAngleKey, RemixAngle> = {
  mechanism: {
    key: 'mechanism',
    emoji: '🔬',
    label: '機序解説',
    hint: 'なぜそうなるのかを掘り下げる',
    signal: '保存',
    promptBlock: `# 切り口: 🔬 機序解説（保存されやすい記事）
- 「なぜそうなるのか」の仕組みを、章のテーマに沿って順を追って説明する
- 因果の鎖を1段ずつ示す（AだからB、BだからC）。段を飛ばさない
- 図解的な整理（順序・対比）を文章で行い、読み返して使える形にする`,
  },
  qa: {
    key: 'qa',
    emoji: '💬',
    label: 'Q&A',
    hint: 'よく聞かれる質問に答える形',
    signal: '共有',
    promptBlock: `# 切り口: 💬 Q&A（誰かに教えたくなる記事）
- 章のテーマについて、現場でよく聞かれる質問を2〜4個立てて答える
- 質問は読者が実際に口にする言い回しにする（教科書的な設問にしない）
- 答えは結論→理由の順で短く（PREP）`,
  },
  clinical: {
    key: 'clinical',
    emoji: '🩺',
    label: '臨床判断のプロセス',
    hint: 'なぜその選択に至ったかの思考過程',
    signal: '共有（PART-Aの一次情報）',
    promptBlock: `# 切り口: 🩺 臨床判断のプロセス（専門職に転送される記事）
- 「何を見て・何を考えて・どう選ぶか」の思考の順序を開示する（結論だけを書かない）
- 判断が分かれる場面では、分かれる理由まで書く
- 患者・症例を主語にしない。主語は判断する側の自分`,
  },
  glossary: {
    key: 'glossary',
    emoji: '📖',
    label: '用語解説・辞書',
    hint: '概念の整理（辞書型）',
    signal: '保存',
    promptBlock: `# 切り口: 📖 用語解説・辞書（保存されやすい記事）
- 章に出てくる中心概念を3〜5個選び、「一言でいうと」→「もう少し詳しく」の2段で整理する
- 混同されやすい語は「〜と〜の違い」を1行で添える
- 後で見返す辞書として使える体裁にする`,
  },
  compare: {
    key: 'compare',
    emoji: '⚖️',
    label: '比較整理',
    hint: 'AとBはどう違うかを並べる',
    signal: '保存',
    promptBlock: `# 切り口: ⚖️ 比較整理（保存されやすい記事）
- 章のテーマから対比できる2〜3つを選び、観点を揃えて並べる（向いている場面／注意点 等）
- 優劣の断定ではなく「使い分けの軸」を示す
- 治療の効果比較・他院比較はしない（比較するのは概念・場面・考え方）`,
  },
  daily: {
    key: 'daily',
    emoji: '🏠',
    label: '日常への落とし込み',
    hint: '今日できることに変換する',
    signal: '共感',
    promptBlock: `# 切り口: 🏠 日常への落とし込み（共感される記事）
- 章の内容を、読者の今日の生活の1場面（朝・入浴後・寝る前 等）に接続する
- 「今日できること」は1つに絞る（あれもこれも並べない）
- 手間・費用がかかりすぎる提案をしない`,
  },
  detour: {
    key: 'detour',
    emoji: '🛤',
    label: '遠回りの共有',
    hint: '自分が理解に手間取った箇所を開示',
    signal: '共感（主語は自分）',
    promptBlock: `# 切り口: 🛤 遠回りの共有（共感される記事）
- **主語は必ず自分**（かつての自分／教える側としての自分）。患者を主語にしない
- 「昔の自分はこう誤解していた→何がきっかけで整理できたか→いま人に説明するならこう言う」の順
- 誤解の内容を紹介するときも、現在の正しい理解を必ず明示して締める`,
  },
};

export const REMIX_ANGLE_KEYS = Object.keys(REMIX_ANGLES) as RemixAngleKey[];

export function getRemixAngle(key: unknown): RemixAngle {
  if (typeof key === 'string' && key in REMIX_ANGLES) return REMIX_ANGLES[key as RemixAngleKey];
  return REMIX_ANGLES.mechanism;
}

// ── §7: 書籍文脈の残存検出（正規表現で検出可能な範囲・二段構えの機械側） ──────────
const BOOK_CONTEXT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /前[の]?章/g, label: '前章への参照' },
  { re: /次[の]?章/g, label: '次章への参照' },
  { re: /本書/g, label: '「本書」' },
  { re: /この本(?:で|の|は)/g, label: '「この本」' },
  { re: /第[0-9０-９一二三四五六七八九十]+章/g, label: '章番号への参照' },
  { re: /本章/g, label: '「本章」' },
  { re: /巻末/g, label: '巻末への参照' },
  { re: /付録/g, label: '付録への参照' },
  { re: /(?:前|先)の節/g, label: '節への参照' },
  { re: /(?:上|下)巻/g, label: '巻への参照' },
];

export interface BookContextHit {
  label: string;
  matched: string;
  /** 前後の文脈（ハイライト表示用） */
  excerpt: string;
}

export function detectBookContext(text: string): BookContextHit[] {
  const hits: BookContextHit[] = [];
  const t = text ?? '';
  for (const { re, label } of BOOK_CONTEXT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const i = m.index ?? 0;
      hits.push({
        label,
        matched: m[0],
        excerpt: t.slice(Math.max(0, i - 15), i + m[0].length + 15).replace(/\n/g, ' '),
      });
      if (hits.length >= 20) return hits;
    }
  }
  return hits;
}

// ── §2-2／§5: 文字3-gramの重なりによる一致度の概算（決定的・AI不使用） ──────────
// containment = |A∩B| / |A| （Aの3-gramのうちBにも現れる割合）。
// - KDP一致度: containment(記事, 書籍章) が高い＝書籍本文の複製に近い
// - 候補間の類似: 双方向の平均で「内容の被り」を見る
function trigrams(text: string): Set<string> {
  const t = (text ?? '').replace(/\s+/g, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function textOverlapRatio(a: string, b: string): number {
  const A = trigrams(a);
  if (A.size === 0) return 0;
  const B = trigrams(b);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / A.size;
}

/** KDP一致度の警告しきい値（fail-closedにしない＝警告のみ。判断は院長） */
export const KDP_OVERLAP_WARN = 0.35;
/** 候補どうしの「内容被り」警告しきい値（147の類似度0.65の先例に合わせる） */
export const CANDIDATE_SIMILARITY_WARN = 0.65;

export function candidateSimilarity(a: string, b: string): number {
  return (textOverlapRatio(a, b) + textOverlapRatio(b, a)) / 2;
}

// ── §4: 事実同一性の厳守事項（表現の変換で事実を変えない。ガードとは別に必ず注入） ──
export const FACT_FIDELITY_RULES = `# 事実同一性（最重要・切り口やペルソナより優先）
表現・視点・構成は変えてよいが、**医学的な事実関係は元の章と同一**でなければならない。
- 元の章に書かれていない医学的主張を追加しない
- 喩えは理解の補助にとどめる。**喩えから新たな結論を導かない**
- 簡略化によって因果関係を変えない（「AだからB」を「AならすぐB」に縮めない）
- 不確かな場合は書かない（迷ったら落とす）`;

// ── §2: 書き下ろしの明示（KDPセレクト配慮） ──
export const REWRITE_NOT_COPY_RULES = `# 書き下ろし（複製禁止）
- 書籍本文の文章をそのまま複製・言い換え転載しない。**テーマと事実関係だけを素材に、記事として書き下ろす**
- 書籍の文の並び・段落構成をなぞらない（記事は§で指定する独自の型で組む）`;

// ── §7: 書籍文脈の禁止（プロンプト側・二段構えのもう一方） ──
export const NO_BOOK_CONTEXT_RULES = `# 書籍文脈の禁止（単独で読み切れる記事にする）
- 「前章で」「次章では」「本書では」「第◯章で」「巻末の」「付録に」等、書籍の構造への参照を一切書かない
- この記事だけで完結させる（書籍を読んでいない読者が最初の読者）`;
