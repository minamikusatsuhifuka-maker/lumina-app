// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// まとめビジュアル画像テンプレート（227【C】で新設・228でKindle/note共用に汎用化）
// 文字はsatori（next/og）でそのまま描画するため100%正確（AIによる文言の創作・再要約なし）。
// テンプレート3種（カード型・表型・ポスター型）はいずれもクリニックグリーン #2F6B4F 基調。
// 要素はJSX不使用のプレーンオブジェクト（satoriが構造的に解釈する）＝route.tsから直接使える。
// 描画は SummaryImageData のみに依存し媒体（Kindle/note）の語彙を持たない。
// Kindle固有の器の型（book_meta.summaryImages）は kindle-summary-image-templates.ts 側。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SummaryImageTemplateKey = 'card' | 'table' | 'poster';

export const SUMMARY_IMAGE_TEMPLATES: Record<SummaryImageTemplateKey, { emoji: string; label: string }> = {
  card: { emoji: '🗂', label: 'カード型' },
  table: { emoji: '📊', label: '表型' },
  poster: { emoji: '🪧', label: 'ポスター型' },
};

export const SUMMARY_IMAGE_TEMPLATE_KEYS = Object.keys(SUMMARY_IMAGE_TEMPLATES) as SummaryImageTemplateKey[];
export const DEFAULT_SUMMARY_IMAGE_TEMPLATE: SummaryImageTemplateKey = 'card';

// ── 図表テンプレ4種（228a・記事図表の主力）───────────────────────
// まとめ3種と同じくプログラム描画＝文言は編集後データのみ（創作・文字崩れゼロ）。
// beforeafter は生活習慣・考え方・手順の変化用（患者の治療前後・効果対比には使わない＝医療広告配慮）。
export type FigureTemplateKey = 'steps' | 'compare' | 'qa' | 'beforeafter';

export const FIGURE_TEMPLATES: Record<FigureTemplateKey, { emoji: string; label: string; hint: string }> = {
  steps: { emoji: '🪜', label: '手順ステップ図', hint: '1グループ・pointsが上から順のステップ' },
  compare: { emoji: '⚖️', label: '比較表', hint: 'グループ=列（2〜3列）・headingが列名' },
  qa: { emoji: '💬', label: 'Q&Aカード', hint: 'グループ=1問・headingが質問・pointsが回答' },
  beforeafter: { emoji: '🔁', label: 'ビフォーアフター枠', hint: 'グループ2つ（前/後）。習慣・手順の変化用' },
};

export const FIGURE_TEMPLATE_KEYS = Object.keys(FIGURE_TEMPLATES) as FigureTemplateKey[];

// まとめ画像・図表の描画で受け付ける全テンプレ
export type AnyImageTemplateKey = SummaryImageTemplateKey | FigureTemplateKey;

export function isImageTemplateKey(v: unknown): v is AnyImageTemplateKey {
  return typeof v === 'string' && (v in SUMMARY_IMAGE_TEMPLATES || v in FIGURE_TEMPLATES);
}

// 保存する1画像分のメタ（Kindle=book_meta.summaryImages / note=enhance状態、器は媒体側が持つ）
export interface SummaryImageEntry {
  url: string;
  pathname: string;
  template: SummaryImageTemplateKey;
  // 生成時点のまとめデータのupdatedAt（編集後との不一致=古い画像→UIで🔄再生成を促す）
  sourceUpdatedAt: string;
  updatedAt: string;
}

// 描画データ: 章/記事ごと=groups 1件（heading省略）／一覧=単位ごとのgroup
export interface SummaryImageData {
  title: string;
  groups: { heading?: string; points: string[] }[];
}

const GREEN = '#2F6B4F';
const GREEN_SOFT = '#EAF3EE';
const INK = '#1F2A25';
const MUTED = '#5B6B63';
export const SUMMARY_IMAGE_WIDTH = 1200;

// 267【3】: タイトルの折り返し行数の概算（全角基準・テンプレごとの実効幅/フォントサイズから算出）。
// タイトルが2行に折り返すとき、この行数がキャンバス高さに入っていないと
// 「緑のタイトルボックスの2行目の下端が切れる」崩れになる（院長実地確認で確定した事象）。
const TITLE_CHARS_PER_LINE: Record<string, number> = {
  card: 24, // 1200 - padding56×2 - 箱padding32×2 = 1024px ÷ 40px ≒ 25字 → 安全側24
  poster: 22, // 1056px ÷ 44px（中央寄せ）→ 安全側22
  // 表型・図表4種はタイトルが全幅40px: 1088px ÷ 40px ≒ 27字 → 安全側26
};
export function estimateTitleLines(template: AnyImageTemplateKey, title: string): number {
  const perLine = TITLE_CHARS_PER_LINE[template] ?? 26;
  return Math.max(1, Math.ceil((title ?? '').length / perLine));
}

// 高さの見積もり（satoriは固定キャンバスのため内容量から算出。上限でクランプ）
export function estimateSummaryImageHeight(template: AnyImageTemplateKey, data: SummaryImageData): number {
  const points = data.groups.reduce((n, g) => n + g.points.length, 0);
  const headings = data.groups.filter((g) => g.heading).length;
  // 2行に折り返す長文ポイントを概算で加味（38字/行想定）
  const wraps = data.groups.reduce((n, g) => n + g.points.filter((p) => p.length > 38).length, 0);
  // 267【3】: タイトルの折り返し分（2行目以降）を全テンプレ共通で上乗せする。
  // 1行あたり: poster=44px×1.35≒60 → 62／その他=40px×1.35≒54 → 56（切れるより余る方に倒す）
  const titleExtra = (estimateTitleLines(template, data.title) - 1) * (template === 'poster' ? 62 : 56);
  // 図表系の見積もり
  if (template === 'steps') {
    return Math.max(630, Math.min(3600, titleExtra + 260 + points * 108 + wraps * 34));
  }
  if (template === 'compare') {
    // 列は横に並ぶ＝最大の列の行数で決まる
    const maxRows = Math.max(1, ...data.groups.map((g) => g.points.length));
    const maxWraps = Math.max(0, ...data.groups.map((g) => g.points.filter((p) => p.length > 18).length));
    return Math.max(630, Math.min(3600, titleExtra + 300 + maxRows * 74 + maxWraps * 30));
  }
  if (template === 'qa') {
    return Math.max(630, Math.min(3600, titleExtra + 240 + headings * 96 + points * 64 + wraps * 34 + data.groups.length * 40));
  }
  if (template === 'beforeafter') {
    const maxRows = Math.max(1, ...data.groups.map((g) => g.points.length));
    const maxWraps = Math.max(0, ...data.groups.map((g) => g.points.filter((p) => p.length > 18).length));
    return Math.max(630, Math.min(3600, titleExtra + 320 + maxRows * 74 + maxWraps * 30));
  }
  const base = template === 'poster' ? 320 : 240;
  const perPoint = template === 'table' ? 78 : 64;
  const h = titleExtra + base + headings * 86 + points * perPoint + wraps * 34;
  return Math.max(630, Math.min(3600, h));
}

type El = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const div = (style: Record<string, unknown>, children: unknown): El => ({ type: 'div', props: { style, children } });

const pointRow = (text: string, marker: El | string, fontSize = 30): El =>
  div(
    { display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 18 },
    [
      typeof marker === 'string'
        ? div({ display: 'flex', color: GREEN, fontSize, fontWeight: 700, flexShrink: 0 }, marker)
        : marker,
      div({ display: 'flex', fontSize, color: INK, lineHeight: 1.5, flex: 1 }, text),
    ],
  );

const checkCircle = (): El =>
  div(
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 38,
      height: 38,
      borderRadius: 19,
      background: GREEN,
      color: '#ffffff',
      fontSize: 24,
      fontWeight: 700,
      flexShrink: 0,
      marginTop: 3,
    },
    '✓',
  );

// カード型: 濃緑ヘッダ帯＋✓チェックリスト
function cardTemplate(data: SummaryImageData): El {
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div(
        // 267【3】: flexShrink 0 = 高さ見積もりが足りない場合でもタイトル箱を圧縮させない（切れるのは余白側）
        { display: 'flex', flexShrink: 0, background: GREEN, color: '#ffffff', padding: '20px 32px', borderRadius: 16, fontSize: 40, fontWeight: 700, lineHeight: 1.35 },
        data.title,
      ),
      ...data.groups.map((g) =>
        div({ display: 'flex', flexDirection: 'column', marginTop: g.heading ? 30 : 10 }, [
          ...(g.heading
            ? [div({ display: 'flex', color: GREEN, fontSize: 30, fontWeight: 700, borderBottom: `3px solid ${GREEN_SOFT}`, paddingBottom: 8 }, g.heading)]
            : []),
          ...g.points.map((p) => pointRow(p, checkCircle())),
        ]),
      ),
    ],
  );
}

// 表型: 左列=番号（緑地白文字）／右列=要点。見出しは結合行
function tableTemplate(data: SummaryImageData): El {
  const rows: El[] = [];
  for (const g of data.groups) {
    if (g.heading) {
      rows.push(
        div({ display: 'flex', background: GREEN, color: '#ffffff', padding: '14px 24px', fontSize: 30, fontWeight: 700 }, g.heading),
      );
    }
    g.points.forEach((p, i) => {
      rows.push(
        div({ display: 'flex', background: i % 2 === 0 ? '#ffffff' : '#F6FAF8', borderBottom: '2px solid #E2EDE7' }, [
          div(
            { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 96, background: GREEN_SOFT, color: GREEN, fontSize: 30, fontWeight: 700, flexShrink: 0, padding: '16px 0' },
            String(i + 1),
          ),
          div({ display: 'flex', alignItems: 'center', flex: 1, padding: '16px 24px', fontSize: 29, color: INK, lineHeight: 1.5 }, p),
        ]),
      );
    });
  }
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', flexShrink: 0, color: GREEN, fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 24 }, data.title),
      div({ display: 'flex', flexDirection: 'column', border: `3px solid ${GREEN}`, borderRadius: 14, overflow: 'hidden' }, rows),
    ],
  );
}

// ポスター型: 中央大見出し＋番号付き要点＋下端アクセント帯
function posterTemplate(data: SummaryImageData): El {
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F7FBF9', padding: 0, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', height: 14, background: GREEN, width: '100%' }, ''),
      div({ display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 72px' }, [
        div({ display: 'flex', justifyContent: 'center', color: MUTED, fontSize: 24, letterSpacing: 6 }, 'POINT'),
        div({ display: 'flex', flexShrink: 0, justifyContent: 'center', textAlign: 'center', color: INK, fontSize: 44, fontWeight: 700, marginTop: 10, lineHeight: 1.35 }, data.title),
        div({ display: 'flex', justifyContent: 'center', marginTop: 14 }, div({ display: 'flex', width: 120, height: 6, background: GREEN, borderRadius: 3 }, '')),
        ...data.groups.map((g) =>
          div({ display: 'flex', flexDirection: 'column', marginTop: g.heading ? 30 : 16 }, [
            ...(g.heading ? [div({ display: 'flex', color: GREEN, fontSize: 30, fontWeight: 700 }, g.heading)] : []),
            ...g.points.map((p, i) => pointRow(p, `${String(i + 1).padStart(2, '0')}`, 30)),
          ]),
        ),
      ]),
      div({ display: 'flex', height: 14, background: GREEN, width: '100%' }, ''),
    ],
  );
}

// ── 図表テンプレの描画（228a）──────────────────────────────────

// 手順ステップ図: 番号バッジ＋テキスト、ステップ間に下向き矢印
function stepsTemplate(data: SummaryImageData): El {
  const steps = data.groups.flatMap((g) => g.points);
  const rows: El[] = [];
  steps.forEach((s, i) => {
    rows.push(
      div({ display: 'flex', alignItems: 'center', gap: 18, background: '#ffffff', border: `2px solid ${GREEN_SOFT}`, borderRadius: 14, padding: '16px 22px' }, [
        div(
          { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 88, height: 44, borderRadius: 22, background: GREEN, color: '#ffffff', fontSize: 22, fontWeight: 700, flexShrink: 0, letterSpacing: 2 },
          `STEP${i + 1}`,
        ),
        div({ display: 'flex', fontSize: 30, color: INK, lineHeight: 1.5, flex: 1 }, s),
      ]),
    );
    if (i < steps.length - 1) {
      rows.push(div({ display: 'flex', justifyContent: 'center', color: GREEN, fontSize: 30, fontWeight: 700, padding: '4px 0' }, '↓'));
    }
  });
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F7FBF9', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', flexShrink: 0, color: GREEN, fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 24 }, data.title),
      div({ display: 'flex', flexDirection: 'column', gap: 8 }, rows),
    ],
  );
}

// 比較表: グループ=列（2〜3列）。列見出し帯＋✓行を横に並べる
function compareTemplate(data: SummaryImageData): El {
  const cols = data.groups.slice(0, 3);
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', flexShrink: 0, color: GREEN, fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 24 }, data.title),
      div(
        { display: 'flex', gap: 20, flex: 1 },
        cols.map((g, ci) =>
          div({ display: 'flex', flexDirection: 'column', flex: 1, border: `3px solid ${ci === 0 ? GREEN : '#C9DCD2'}`, borderRadius: 14, overflow: 'hidden' }, [
            div(
              { display: 'flex', justifyContent: 'center', background: ci === 0 ? GREEN : GREEN_SOFT, color: ci === 0 ? '#ffffff' : GREEN, padding: '14px 16px', fontSize: 28, fontWeight: 700 },
              g.heading || `案${ci + 1}`,
            ),
            div(
              { display: 'flex', flexDirection: 'column', padding: '6px 18px 18px' },
              g.points.map((p) => pointRow(p, '・', 26)),
            ),
          ]),
        ),
      ),
    ],
  );
}

// Q&Aカード: グループ=1問。Q帯（緑）＋A本文のカードを縦に並べる
function qaTemplate(data: SummaryImageData): El {
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F7FBF9', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', flexShrink: 0, color: GREEN, fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 24 }, data.title),
      ...data.groups.map((g) =>
        div({ display: 'flex', flexDirection: 'column', background: '#ffffff', border: `2px solid ${GREEN_SOFT}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }, [
          div({ display: 'flex', alignItems: 'flex-start', gap: 12, background: GREEN, color: '#ffffff', padding: '14px 22px' }, [
            div({ display: 'flex', fontSize: 28, fontWeight: 700, flexShrink: 0 }, 'Q.'),
            div({ display: 'flex', fontSize: 28, fontWeight: 700, lineHeight: 1.4, flex: 1 }, g.heading || ''),
          ]),
          div({ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 22px' }, [
            div({ display: 'flex', color: GREEN, fontSize: 28, fontWeight: 700, flexShrink: 0 }, 'A.'),
            div(
              { display: 'flex', flexDirection: 'column', flex: 1 },
              g.points.map((p) => div({ display: 'flex', fontSize: 27, color: INK, lineHeight: 1.55, marginTop: 4 }, p)),
            ),
          ]),
        ]),
      ),
    ],
  );
}

// ビフォーアフター枠: 左=変化前（グレー基調）→ 右=変化後（緑基調）。
// 生活習慣・考え方・手順の変化用（患者の治療前後・効果対比には使わない＝医療広告配慮）
function beforeAfterTemplate(data: SummaryImageData): El {
  const before = data.groups[0] ?? { points: [] };
  const after = data.groups[1] ?? { points: [] };
  const panel = (g: { heading?: string; points: string[] }, kind: 'before' | 'after'): El =>
    div(
      { display: 'flex', flexDirection: 'column', flex: 1, border: `3px solid ${kind === 'after' ? GREEN : '#C4CCC8'}`, borderRadius: 14, overflow: 'hidden', background: '#ffffff' },
      [
        div(
          { display: 'flex', justifyContent: 'center', background: kind === 'after' ? GREEN : '#E8ECEA', color: kind === 'after' ? '#ffffff' : MUTED, padding: '14px 16px', fontSize: 28, fontWeight: 700 },
          g.heading || (kind === 'after' ? 'After' : 'Before'),
        ),
        div(
          { display: 'flex', flexDirection: 'column', padding: '6px 18px 18px' },
          g.points.map((p) => pointRow(p, kind === 'after' ? checkCircle() : '・', 26)),
        ),
      ],
    );
  return div(
    { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F7FBF9', padding: 56, fontFamily: 'NotoSansJP' },
    [
      div({ display: 'flex', flexShrink: 0, color: GREEN, fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 24 }, data.title),
      div({ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1 }, [
        panel(before, 'before'),
        div({ display: 'flex', alignItems: 'center', color: GREEN, fontSize: 44, fontWeight: 700, padding: '0 14px' }, '→'),
        panel(after, 'after'),
      ]),
    ],
  );
}

export function buildSummaryImageElement(template: AnyImageTemplateKey, data: SummaryImageData): El {
  if (template === 'table') return tableTemplate(data);
  if (template === 'poster') return posterTemplate(data);
  if (template === 'steps') return stepsTemplate(data);
  if (template === 'compare') return compareTemplate(data);
  if (template === 'qa') return qaTemplate(data);
  if (template === 'beforeafter') return beforeAfterTemplate(data);
  return cardTemplate(data);
}

// フォントサブセット取得用: 描画対象の全文字を集める（固定ラベル・数字・記号も含める）
export function collectSummaryImageText(data: SummaryImageData): string {
  const parts = [
    data.title,
    'POINT✓0123456789・STEPQABeforeAfter案↓→',
    ...data.groups.flatMap((g) => [g.heading ?? '', ...g.points]),
  ];
  return Array.from(new Set(parts.join(''))).join('');
}
