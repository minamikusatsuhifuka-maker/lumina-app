// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// note記事の執筆設計（構成）一元管理（183）
// 文体プリセット（note-styles.ts＝語り口）とは別軸の「構成設計」。両方を独立に選べる。
// バズりパターン辞書（library type='buzz-pattern'）の注入形式は既存 /api/note-article と同一に揃える。
// 調整はこのファイルの変更だけで完結させる（プロンプトへの直書き禁止）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 執筆設計ブロック：バズり分析の知見に基づく「読まれる書き方」の共通指示。
// 医療機関の情報発信として、煽り・不安訴求・受診誘導は明示的に禁止する（緩和しない）。
export const NOTE_WRITING_DESIGN = `# 執筆設計（読まれる構成のための指示）
## 心理学的要素
- 冒頭で読者の課題・痛み・モヤモヤを具体的に言語化し、「自分のことだ」と思わせてから本題に入る
- 具体（身近な場面）→ 抽象（背景・原理）→ 具体（どうすればよいか）の順で腹落ちさせる
- 認知バイアスの活用は誠実な範囲のみ（例: 一貫性のある論理展開、資料に基づく社会的証明）。読者を操作する書き方はしない

## マーケティング要素
- 読者像を1人に絞る（誰に向けた記事かが冒頭で伝わるように書く）
- ベネフィットを先出しする（「この記事を読むと何が分かるか」を導入で明示）
- 見出しだけを拾い読みしても筋が通る構成にする（流し読み耐性）
- 1記事1メッセージ。伝えたいことを詰め込みすぎない

## 結び（次の行動）
- 結びに「次の行動」を1つだけ示す（例: 今日からできるセルフケア、関連テーマをさらに知る）。複数並べない

## 禁止事項（バズらせるために誠実さを捨てない）
- 煽り・不安訴求は禁止（「今すぐ」「手遅れ」「〜しないと危険」等の表現を使わない）
- 限定性・希少性の演出は禁止（「今だけ」「あなただけ」等）
- 受診誘導・特定医療機関への集客表現は入れない（医療広告ガイドライン配慮。「役立つ情報の提供」で完結させる）
- 効果効能の断定を新たに書き足さない
- 心理学・マーケティングの理論名や研究を持ち出す場合も、渡された資料に無い研究名・数値を創作しない`;

// プロンプトに注入するバズりパターンの形（library type='buzz-pattern' の1件分）
export interface BuzzPatternForPrompt {
  title: string;
  category: string;
  framework: string;
  content: string;
}

// バズりパターン辞書のプロンプト注入セクション（既存 /api/note-article と同じ整形・同じ文言）。
// パターンが0件なら空文字（従来どおり何も付与しない）。
export function buildPatternsSection(patterns: BuzzPatternForPrompt[]): string {
  const list = patterns.filter((p) => p && (p.title || p.content)).slice(0, 10);
  if (list.length === 0) return '';
  return `\n# 📖 活用するバズりパターン（${list.length}件）
以下のパターン・型を意識して記事を執筆してください。それぞれの構造や心理的効果を理解し、自然に記事に組み込んでください。

${list.map((p, i) => `## パターン${i + 1}: ${p.title || '(無題)'}
カテゴリ: ${p.category || '-'}
フレームワーク: ${p.framework || '-'}

${(p.content || '').slice(0, 2000)}
`).join('\n---\n\n')}

上記パターンを参考に、表面的な模倣ではなく、構造・心理効果を理解して記事に活かしてください。`;
}

// library.metadata（文字列/オブジェクト両対応）から category/framework/description を安全に取り出す
export function parsePatternMeta(metadata: unknown): {
  category: string;
  framework: string;
  description: string;
} {
  let meta: Record<string, unknown> = {};
  if (typeof metadata === 'string') {
    try {
      meta = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata as Record<string, unknown>;
  }
  return {
    category: typeof meta.category === 'string' ? meta.category : '',
    framework: typeof meta.framework === 'string' ? meta.framework : '',
    description: typeof meta.description === 'string' ? meta.description : '',
  };
}

// 1記事に割り当てられるパターン数の上限（詰め込み防止）
export const MAX_PATTERNS_PER_ARTICLE = 5;
