// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// X投稿の機械的バリデーション（指示書265c）— プロンプト頼みにせずコードで検証する。
// 媒体別ルール（§5-1）: ハッシュタグ制限は**X側のみ**。noteはお題タグ積極参加の方針のため適用しない。
// 検証は警告表示のみ（自動修正しない＝R-26）。文字数超過だけはAPI側で1回自動再生成する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { findBannedExpressions } from '@/lib/content-verify';

export type XPostMedia = 'x' | 'note';

export interface XPostWarning {
  code: 'url-in-body' | 'too-many-hashtags' | 'no-blank-lines' | 'banned-expression' | 'over-limit';
  message: string;
}

/** Xの投稿上限（プレミアム）。超過は投稿不能なのでAPI側で自動再生成する */
export const X_HARD_LIMIT = 25000;

/** 長さプリセット（v2: 既定はミニ講義。旧140字上限は既定にしない） */
export type XLength = 'short' | 'mini' | 'long';
export const X_LENGTH_CONFIG: Record<
  XLength,
  { label: string; chars: string; maxTokens: number }
> = {
  short: { label: '短文', chars: '140字前後', maxTokens: 4000 },
  mini: { label: 'ミニ講義（既定）', chars: '1,000〜2,000字', maxTokens: 8000 },
  long: { label: '長編', chars: '3,000〜5,000字', maxTokens: 13000 },
};

/** 投稿テンプレート5型（X-07）。既定は①ノウハウ体系化型（PART-A: 共有シグナルとの相性が最良） */
export type XPostType = 'knowhow' | 'story' | 'debate' | 'insight' | 'infographic';
export const X_POST_TYPES: Record<
  XPostType,
  { emoji: string; label: string; signal: string; promptBlock: string }
> = {
  knowhow: {
    emoji: '📚',
    label: 'ノウハウ体系化型',
    signal: '保存・共有',
    promptBlock: `# 投稿の型: ① ノウハウ体系化型（保存・共有を狙う）
- 「【保存推奨】〇〇の鉄則7選」のように知識を体系化して並べる（数字は項目数・手順数のみ）
- 各項目は1行で完結させ、特に効く1項目を深掘りする
- 末尾に「※後で見返せるようにブックマークを」等の保存CTAを置く`,
  },
  story: {
    emoji: '🔄',
    label: 'Before/After逆転ストーリー型',
    signal: '共感・プロフィール遷移',
    promptBlock: `# 投稿の型: ② Before/After逆転ストーリー型（共感を狙う）
- **主語は必ず自分**（かつての自分／教える側としての自分）。患者・症例を主語にしない（医療広告規制）
- 過去の失敗・誤解の自己開示 → 転機となった原則 → 変化を箇条書き → 普遍化の順で運ぶ
- 治療効果の対比ではなく、理解・教え方・仕事の仕方の変化として書く`,
  },
  debate: {
    emoji: '💬',
    label: '二者択一・議論型',
    signal: 'リプライ',
    promptBlock: `# 投稿の型: ③ 二者択一・議論型（リプライを狙う）
- 「AとB、どちらを先にやる？」のような選択式の問いかけでハードルを下げる
- **治療選択の是非を問う形にしない**（仕事の進め方・学び方・説明の仕方など非医療判断のテーマに限る）
- 自分の失敗経験を添え、「ご意見をリプ欄で」と締める`,
  },
  insight: {
    emoji: '💡',
    label: '常識破壊・本質論型',
    signal: '引用リポスト',
    promptBlock: `# 投稿の型: ④ 常識破壊・本質論型（引用リポストを狙う）
- **主語を「過去の自分の理解」に限定する**（「私は〜だと思っていた」「〜と教わってきたが」）。
  一般論・他者・他院を否定する形にしない（比較優良広告・断定の回避）
- 一段深い視点を示したあと、今日からできる極小の行動を1つ提示する
- 「〜しないと危険」「知らないと損」型の煽りは禁止`,
  },
  infographic: {
    emoji: '🖼',
    label: '図解・インフォグラフィック型',
    signal: '滞在時間',
    promptBlock: `# 投稿の型: ⑤ 図解・インフォグラフィック型（滞在時間を狙う）
- 本文は図解のダイジェストとして書く（1枚目=結論図、2〜4枚目=詳細の想定）
- 図解にする要点を「▼図解の構成案」として本文の後に箇条書きで添える（画像は🎨ボタンで別途生成）`,
  },
};

export const DEFAULT_X_POST_TYPE: XPostType = 'knowhow';

export function getXPostType(key: unknown): (typeof X_POST_TYPES)[XPostType] {
  if (typeof key === 'string' && key in X_POST_TYPES) return X_POST_TYPES[key as XPostType];
  return X_POST_TYPES[DEFAULT_X_POST_TYPE];
}

/** 投稿時間帯の目安（§5-2: 媒体でズレる。共有ロジックにしない） */
export const POSTING_TIME_GUIDE = {
  x: { morning: '7:00〜8:30', noon: '12:00〜13:00', night: '18:00〜21:00' },
  note: { morning: '7:00〜8:30', noon: '12:00〜13:00', night: '20:00〜22:30' },
} as const;

export function hasUrl(text: string): boolean {
  return /https?:\/\/\S+/i.test(text);
}

export function countHashtags(text: string): number {
  return (text.match(/[#＃][^\s#＃]+/g) ?? []).length;
}

/** 2〜3行ごとに空白行が入っているか（X-06）。連続する非空行が5行以上続いたらNG */
export function hasBlankLineRhythm(text: string): boolean {
  const lines = text.split('\n');
  let run = 0;
  for (const l of lines) {
    if (l.trim() === '') {
      run = 0;
    } else {
      run++;
      if (run >= 5) return false;
    }
  }
  return true;
}

/**
 * 生成後の機械検証（表示用の警告リストを返す。自動修正はしない）。
 * - media='x' のときだけハッシュタグ上限（0〜2個）を見る（§5-1: noteは適用しない）
 * - isFirstPost=true のときだけ本文内URLを警告（URLは2通目=リプライへ置く運用）
 */
export function validateXPost(
  text: string,
  opts: { media: XPostMedia; isFirstPost?: boolean } = { media: 'x', isFirstPost: true },
): XPostWarning[] {
  const warnings: XPostWarning[] = [];
  const t = text ?? '';

  if ((opts.isFirstPost ?? true) && hasUrl(t)) {
    warnings.push({
      code: 'url-in-body',
      message: '本文にURLが入っています。露出低下を避けるため、URLは1つ目のリプライへ移してください',
    });
  }

  if (opts.media === 'x') {
    const tags = countHashtags(t);
    if (tags > 2) {
      warnings.push({
        code: 'too-many-hashtags',
        message: `ハッシュタグが${tags}個あります（Xは原則0個・最大1〜2個。スパム判定の回避）`,
      });
    }
  }

  // 短文では改行リズムの検証は意味が薄いので、5行以上の投稿だけ見る
  if (t.split('\n').length >= 5 && !hasBlankLineRhythm(t)) {
    warnings.push({
      code: 'no-blank-lines',
      message: '2〜3行ごとの空白行がありません（読みやすさのため空行を入れてください）',
    });
  }

  const banned = findBannedExpressions(t);
  for (const b of banned) {
    warnings.push({
      code: 'banned-expression',
      message: `禁止表現の疑い（${b.category}）: 「${b.matched}」`,
    });
  }

  return warnings;
}
