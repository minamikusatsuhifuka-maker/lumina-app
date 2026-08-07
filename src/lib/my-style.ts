// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// マイ文体プロファイル 一元管理（228c）
// 院長自身の文章（マイ文体ソース）から抽出した文体特徴のJSONと、
// 生成プロンプトへ注入する文体ブロックの生成をここに集約する。
// 【絶対制約】文体ソースは院長自身の文章のみ（他者の文体模倣はしない）。
//   - libraryのnote-article（AI生成下書き）・note検索保存分（他者記事のまとめ）は使用不可
//   - ソースは /dashboard/my-style で院長が自分で貼り付けたものだけ（my_style_sources）
// 注入の優先順位（ブロック文言にも明記）:
//   画面での明示指定（tonePreference等） ＞ マイ文体 ＞ プリセット文体（note-styles）。
//   バズりパターン（他者由来）からは構成・展開のみ取り込み、文体・口調は真似ない。
// クライアント/サーバ共用のため server-only 依存を置かない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MyStyleProfile {
  // 文体の総評（1〜2文）
  summary: string;
  // 文の長さ・リズムの特徴
  sentence: string;
  // 段落の長さ・構成の特徴
  paragraph: string;
  // 読者への語りかけ方（呼びかけ・問いかけの頻度と形）
  address: string;
  // 口調（です・ます／常体、柔らかさ）
  tone: string;
  // よく使う言い回し・接続の癖（原文由来のみ）
  phrases: string[];
  // 避ける・使わない表現
  avoid: string[];
  // 改行・箇条書き・強調の使い方
  rhythm: string;
}

export const MY_STYLE_PROFILE_KEYS: Array<{ key: keyof MyStyleProfile; label: string; isList: boolean }> = [
  { key: 'summary', label: '総評', isList: false },
  { key: 'sentence', label: '文の長さ・リズム', isList: false },
  { key: 'paragraph', label: '段落の特徴', isList: false },
  { key: 'address', label: '語りかけ方', isList: false },
  { key: 'tone', label: '口調', isList: false },
  { key: 'phrases', label: 'よく使う言い回し', isList: true },
  { key: 'avoid', label: '避ける表現', isList: true },
  { key: 'rhythm', label: '改行・強調の使い方', isList: false },
];

// ソースの登録制限（コスト・プロンプト長の暴発防止）
export const MY_STYLE_SOURCE_MIN_CHARS = 200;
export const MY_STYLE_SOURCE_MAX_CHARS = 30_000;
export const MY_STYLE_MAX_SOURCES = 20;
// 抽出に使う合計文字数の上限（超過分は新しい順に切る）
export const MY_STYLE_EXTRACT_MAX_CHARS = 80_000;

// 揺れ・旧データを吸収して MyStyleProfile に正規化（不正な形は null）
export function normalizeMyStyleProfile(raw: unknown): MyStyleProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '');
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 12);
  const profile: MyStyleProfile = {
    summary: s(o.summary),
    sentence: s(o.sentence),
    paragraph: s(o.paragraph),
    address: s(o.address),
    tone: s(o.tone),
    phrases: list(o.phrases),
    avoid: list(o.avoid),
    rhythm: s(o.rhythm),
  };
  // 中身が実質空なら不正扱い（空プロファイルの注入を防ぐ）
  const hasBody =
    profile.summary || profile.sentence || profile.tone || profile.phrases.length > 0;
  return hasBody ? profile : null;
}

// 生成プロンプトへ注入する文体ブロック。
// 事実・内容には一切影響させない（語り口のみ）ことをブロック内で明示する。
export function buildMyStyleBlock(profile: MyStyleProfile): string {
  const lines: string[] = [
    '# マイ文体プロファイル（筆者本人の過去記事から抽出した文体。語り口はこれを最優先で再現する）',
  ];
  if (profile.summary) lines.push(`- 総評: ${profile.summary}`);
  if (profile.sentence) lines.push(`- 文の長さ・リズム: ${profile.sentence}`);
  if (profile.paragraph) lines.push(`- 段落: ${profile.paragraph}`);
  if (profile.address) lines.push(`- 語りかけ: ${profile.address}`);
  if (profile.tone) lines.push(`- 口調: ${profile.tone}`);
  if (profile.phrases.length > 0) lines.push(`- よく使う言い回し（自然な範囲で使う。乱用しない）: ${profile.phrases.join('／')}`);
  if (profile.avoid.length > 0) lines.push(`- 避ける表現: ${profile.avoid.join('／')}`);
  if (profile.rhythm) lines.push(`- 改行・強調: ${profile.rhythm}`);
  lines.push(
    '【優先順位】この記事で個別に文体・口調の指定がある場合はそちらを優先する。プリセット文体と矛盾する場合は本プロファイルを優先する。バズりパターン等の参考資料からは構成・展開のみ取り入れ、文体・口調は真似ない。',
    '【厳守】本プロファイルは語り口にのみ適用し、内容・事実・数値には一切影響させない。',
  );
  return lines.join('\n');
}
