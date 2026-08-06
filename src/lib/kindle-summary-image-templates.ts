// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの「まとめビジュアル画像」テンプレート（227【C】・方式b=プログラム描画）
// 文字はsatori（next/og）でそのまま描画するため100%正確（AIによる文言の創作・再要約なし）。
// テンプレート3種（カード型・表型・ポスター型）はいずれもクリニックグリーン #2F6B4F 基調。
// 要素はJSX不使用のプレーンオブジェクト（satoriが構造的に解釈する）＝route.tsから直接使える。
// クライアントはメタ（キー・ラベル）のみ参照する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SummaryImageTemplateKey = 'card' | 'table' | 'poster';

export const SUMMARY_IMAGE_TEMPLATES: Record<SummaryImageTemplateKey, { emoji: string; label: string }> = {
  card: { emoji: '🗂', label: 'カード型' },
  table: { emoji: '📊', label: '表型' },
  poster: { emoji: '🪧', label: 'ポスター型' },
};

export const SUMMARY_IMAGE_TEMPLATE_KEYS = Object.keys(SUMMARY_IMAGE_TEMPLATES) as SummaryImageTemplateKey[];
export const DEFAULT_SUMMARY_IMAGE_TEMPLATE: SummaryImageTemplateKey = 'card';

// book_meta.summaryImages に保存する1画像分のメタ
export interface SummaryImageEntry {
  url: string;
  pathname: string;
  template: SummaryImageTemplateKey;
  // 生成時点のまとめデータのupdatedAt（編集後との不一致=古い画像→UIで🔄再生成を促す）
  sourceUpdatedAt: string;
  updatedAt: string;
}

export interface KindleSummaryImages {
  // key = 章ID（文字列）
  chapters?: Record<string, SummaryImageEntry>;
  // 巻末「全章まとめ」一覧画像
  book?: SummaryImageEntry;
}

// 描画データ: 章ごと=groups 1件（heading省略）／巻末一覧=章ごとのgroup
export interface SummaryImageData {
  title: string;
  groups: { heading?: string; points: string[] }[];
}

const GREEN = '#2F6B4F';
const GREEN_SOFT = '#EAF3EE';
const INK = '#1F2A25';
const MUTED = '#5B6B63';
export const SUMMARY_IMAGE_WIDTH = 1200;

// 高さの見積もり（satoriは固定キャンバスのため内容量から算出。上限でクランプ）
export function estimateSummaryImageHeight(template: SummaryImageTemplateKey, data: SummaryImageData): number {
  const points = data.groups.reduce((n, g) => n + g.points.length, 0);
  const headings = data.groups.filter((g) => g.heading).length;
  // 2行に折り返す長文ポイントを概算で加味（38字/行想定）
  const wraps = data.groups.reduce((n, g) => n + g.points.filter((p) => p.length > 38).length, 0);
  const base = template === 'poster' ? 320 : 240;
  const perPoint = template === 'table' ? 78 : 64;
  const h = base + headings * 86 + points * perPoint + wraps * 34;
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
        { display: 'flex', background: GREEN, color: '#ffffff', padding: '20px 32px', borderRadius: 16, fontSize: 40, fontWeight: 700, lineHeight: 1.35 },
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

// 表型: 左列=番号（緑地白文字）／右列=要点。章見出しは結合行
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
      div({ display: 'flex', color: GREEN, fontSize: 40, fontWeight: 700, marginBottom: 24 }, data.title),
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
        div({ display: 'flex', justifyContent: 'center', textAlign: 'center', color: INK, fontSize: 44, fontWeight: 700, marginTop: 10, lineHeight: 1.35 }, data.title),
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

export function buildSummaryImageElement(template: SummaryImageTemplateKey, data: SummaryImageData): El {
  if (template === 'table') return tableTemplate(data);
  if (template === 'poster') return posterTemplate(data);
  return cardTemplate(data);
}

// フォントサブセット取得用: 描画対象の全文字を集める（固定ラベル・数字・記号も含める）
export function collectSummaryImageText(data: SummaryImageData): string {
  const parts = [data.title, 'POINT✓0123456789', ...data.groups.flatMap((g) => [g.heading ?? '', ...g.points])];
  return Array.from(new Set(parts.join(''))).join('');
}
