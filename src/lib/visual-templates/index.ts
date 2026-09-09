// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 315 §3-4: 図解テンプレート（表・フロー・比較・手順・概念図）＋イメージへの文字の重ね（DB 非依存・決定的・R-108）
//
// - 描画は satori（next/og ImageResponse）。要素は summary-image-templates と同じプレーンオブジェクト（JSX 不使用）
// - 文字は**プランの文字列そのまま**（折り返しは wrapText で決定的・省略しない＝はみ出すより高さを伸ばす・R-72）
// - collectElementText で要素木から文字列を集め、プランの文字列と一致することを機械判定する（verifyRenderedText）
// - 色・フォントは既定1種（クリニックグリーン）。マイ文体の画像版は範囲外
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  VISUAL_CANVAS_WIDTH,
  collectPlanStrings,
  lineCount,
  minCanvasHeight,
  relationEdgesOf,
  type VisualOrientation,
  type VisualPlan,
} from '@/lib/visuals';

export type El = { type: string; props: { style?: Record<string, unknown>; children?: unknown; src?: string; width?: number; height?: number } };

const GREEN = '#2F6B4F';
const GREEN_SOFT = '#EAF3EE';
const INK = '#1F2A25';
const MUTED = '#5B6B63';
const LINE = '#C9DACF';
const FONT = 'NotoSansJP';

// satori の規則: 子が文字列以外（要素・配列。空配列 [] でも）の div は display: flex/none/contents が必須（無いと描画時に throw）。
// ヘルパーで機械的に補い、線・点などの装飾 div で落ちないようにする（317・B38 で発覚）
const div = (style: Record<string, unknown>, children: unknown): El => {
  const needsDisplay = children !== null && children !== undefined && typeof children !== 'string' && !['flex', 'none', 'contents'].includes(String(style.display ?? ''));
  return { type: 'div', props: { style: needsDisplay ? { display: 'flex', ...style } : style, children } };
};
const text = (s: string, style: Record<string, unknown> = {}): El => div({ display: 'flex', ...style }, s);

/** キャンバス幅ごとの1行の文字数（全角基準・安全側） */
function charsPerLine(width: number, fontSize: number, padding: number): number {
  return Math.max(6, Math.floor((width - padding * 2) / (fontSize * 1.05)));
}

export interface VisualCanvas {
  width: number;
  height: number;
}

/** 高さの見積もり（R-72: 折り返しうる全要素を行数で数える）。向きの最小高さは確保 */
export function estimateVisualHeight(plan: VisualPlan, orientation: VisualOrientation): number {
  const width = VISUAL_CANVAS_WIDTH[orientation];
  const titleLines = lineCount(plan.title, charsPerLine(width, 40, 56));
  const titleH = 56 + titleLines * 56 + 24;
  let body = 0;
  const pointsTotal = plan.groups.reduce((n, g) => n + g.points.length, 0);
  if (plan.type === 'steps') {
    const cpl = charsPerLine(width, 30, 56 + 80);
    body = plan.groups.reduce((n, g) => n + (g.heading ? 60 : 0) + g.points.reduce((m, p) => m + 40 + lineCount(p, cpl) * 46, 0), 0);
  } else if (plan.type === 'flow') {
    const cols = Math.max(1, plan.groups[0]?.points.length ?? 1);
    const boxW = Math.floor((width - 56 * 2 - (cols - 1) * 48) / cols);
    const cpl = charsPerLine(boxW, 26, 16);
    const maxLines = Math.max(1, ...(plan.groups[0]?.points ?? ['']).map((p) => lineCount(p, cpl)));
    body = 80 + maxLines * 40 + 40;
    if (cols > 4) body += 200; // 5〜6要素は2段に折る
  } else if (plan.type === 'table' || plan.type === 'compare') {
    const cols = Math.max(1, plan.groups.length);
    const colW = Math.floor((width - 56 * 2) / cols);
    const cpl = charsPerLine(colW, 26, 16);
    const rows = Math.max(1, ...plan.groups.map((g) => g.points.length));
    let rowsH = 0;
    for (let r = 0; r < rows; r++) {
      const maxLines = Math.max(1, ...plan.groups.map((g) => lineCount(g.points[r] ?? '', cpl)));
      rowsH += 28 + maxLines * 40;
    }
    body = 72 + rowsH + 24;
  } else if (plan.type === 'relation') {
    // 円周配置: 正方形に近い領域（幅の 0.8）＋ラベル分
    body = Math.round(width * 0.82) + 40;
  } else if (plan.type === 'timeline') {
    const n = Math.max(1, plan.groups.length);
    const colW = Math.floor((width - 56 * 2) / n);
    const cpl = charsPerLine(colW, 22, 8);
    const maxLines = Math.max(1, ...plan.groups.map((g) => lineCount(g.heading ?? '', cpl) + lineCount(g.points[0] ?? '', cpl) + (g.points[1] ? lineCount(g.points[1], cpl) : 0)));
    body = 120 + maxLines * 34 + 60;
  } else if (plan.type === 'figures') {
    const n = Math.max(1, plan.groups.length);
    const cols = n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const colW = Math.floor((width - 56 * 2 - (cols - 1) * 24) / cols);
    const cpl = charsPerLine(colW, 26, 20);
    let h = 0;
    for (let r = 0; r < rows; r++) {
      const slice = plan.groups.slice(r * cols, r * cols + cols);
      h += Math.max(...slice.map((g) => 40 + lineCount(g.points[0] ?? '', Math.max(4, Math.floor(colW / 60))) * 72 + lineCount(g.heading ?? '', cpl) * 34 + 40)) + 24;
    }
    body = h;
  } else if (plan.type === 'onepage') {
    const cpl = charsPerLine(width, 34, 56 + 60);
    const pts = plan.groups[0]?.points ?? [];
    const one = plan.groups[1]?.points[0] ?? '';
    body = pts.reduce((n, p) => n + 30 + lineCount(p, cpl) * 50, 0) + (one ? 60 + lineCount(one, cpl) * 44 : 0) + (plan.embedImage ? Math.round(width * 0.45) : 0) + 60;
  } else if (plan.type === 'concept') {
    const branches = Math.max(1, plan.groups.length);
    const cols = branches <= 2 ? branches : branches <= 4 ? 2 : 3;
    const colW = Math.floor((width - 56 * 2 - (cols - 1) * 32) / cols);
    const cpl = charsPerLine(colW, 26, 20);
    const rowsOfBranches = Math.ceil(branches / cols);
    let h = 0;
    for (let r = 0; r < rowsOfBranches; r++) {
      const slice = plan.groups.slice(r * cols, r * cols + cols);
      h += Math.max(...slice.map((g) => 70 + g.points.reduce((m, p) => m + lineCount(p, cpl) * 38 + 10, 0))) + 32;
    }
    body = 140 + h;
  } else {
    body = 120 + pointsTotal * 48;
  }
  const est = 56 + titleH + body + 56;
  return Math.max(minCanvasHeight(orientation), Math.min(4000, est));
}

function titleBlock(plan: VisualPlan, width: number): El {
  return div(
    { display: 'flex', width: '100%', background: GREEN, color: '#fff', borderRadius: 18, padding: '20px 28px', marginBottom: 24 },
    text(plan.title, { fontSize: 40, fontWeight: 700, lineHeight: 1.4, width: width - 56 * 2 - 56 }),
  );
}

function frame(width: number, height: number, children: El[]): El {
  return div(
    { width, height, display: 'flex', flexDirection: 'column', background: '#FFFFFF', padding: 56, fontFamily: FONT, color: INK },
    children,
  );
}

// ── 表（groups＝列・heading＝列名・points＝各行） ──
function tableTemplate(plan: VisualPlan, width: number): El[] {
  const cols = Math.max(1, plan.groups.length);
  const rows = Math.max(1, ...plan.groups.map((g) => g.points.length));
  const header = div(
    { display: 'flex', width: '100%' },
    plan.groups.map((g, i) =>
      div(
        { display: 'flex', flex: 1, background: GREEN_SOFT, borderTop: `3px solid ${GREEN}`, borderRight: i < cols - 1 ? `1px solid ${LINE}` : 'none', padding: '14px 16px', minWidth: 0 },
        text(g.heading ?? '', { fontSize: 28, fontWeight: 700, color: GREEN, lineHeight: 1.4 }),
      ),
    ),
  );
  const body: El[] = [];
  for (let r = 0; r < rows; r++) {
    body.push(
      div(
        { display: 'flex', width: '100%', borderBottom: `1px solid ${LINE}` },
        plan.groups.map((g, i) =>
          div(
            { display: 'flex', flex: 1, padding: '14px 16px', borderRight: i < cols - 1 ? `1px solid ${LINE}` : 'none', minWidth: 0 },
            text(g.points[r] ?? '', { fontSize: 26, lineHeight: 1.5 }),
          ),
        ),
      ),
    );
  }
  return [titleBlock(plan, width), div({ display: 'flex', flexDirection: 'column', width: '100%', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }, [header, ...body])];
}

// ── フロー（1グループ・左→右。5要素以上は2段） ──
function flowTemplate(plan: VisualPlan, width: number): El[] {
  const points = plan.groups.flatMap((g) => g.points);
  const perRow = points.length > 4 ? Math.ceil(points.length / 2) : points.length;
  const rows: string[][] = [];
  for (let i = 0; i < points.length; i += perRow) rows.push(points.slice(i, i + perRow));
  const rowEls = rows.map((row, ri) =>
    div(
      { display: 'flex', width: '100%', alignItems: 'stretch', marginTop: ri > 0 ? 40 : 0 },
      row.flatMap((p, i) => {
        const box = div(
          { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: GREEN_SOFT, border: `2px solid ${GREEN}`, borderRadius: 16, padding: '18px 16px', minWidth: 0 },
          text(p, { fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1.45, textAlign: 'center' }),
        );
        if (i === row.length - 1) return [box];
        return [box, div({ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, color: GREEN, fontSize: 34, fontWeight: 700, flexShrink: 0 }, '→')];
      }),
    ),
  );
  const headings = plan.groups.filter((g) => g.heading).map((g) => text(g.heading!, { fontSize: 24, color: MUTED, marginBottom: 12 }));
  return [titleBlock(plan, width), ...headings, ...rowEls];
}

// ── 比較（groups＝対象・heading＝対象名・points＝特徴） ──
function compareTemplate(plan: VisualPlan, width: number): El[] {
  const cols = Math.max(1, plan.groups.length);
  return [
    titleBlock(plan, width),
    div(
      { display: 'flex', width: '100%', gap: 20 },
      plan.groups.map((g) =>
        div(
          { display: 'flex', flexDirection: 'column', flex: 1, border: `2px solid ${GREEN}`, borderRadius: 16, overflow: 'hidden', minWidth: 0 },
          [
            div({ display: 'flex', background: GREEN, color: '#fff', padding: '14px 16px', justifyContent: 'center' }, text(g.heading ?? '', { fontSize: 28, fontWeight: 700, lineHeight: 1.4, textAlign: 'center' })),
            ...g.points.map((p) =>
              div({ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${LINE}` }, [
                text('✓', { color: GREEN, fontSize: 26, fontWeight: 700, flexShrink: 0 }),
                text(p, { fontSize: 26, lineHeight: 1.5, flex: 1 }),
              ]),
            ),
          ],
        ),
      ),
    ),
    ...(cols === 0 ? [] : []),
  ];
}

// ── 手順（1グループ・番号つき） ──
function stepsTemplate(plan: VisualPlan, width: number): El[] {
  const items: El[] = [];
  let n = 0;
  for (const g of plan.groups) {
    if (g.heading) items.push(text(g.heading, { fontSize: 26, fontWeight: 700, color: GREEN, marginTop: 12, marginBottom: 4 }));
    for (const p of g.points) {
      n += 1;
      items.push(
        div({ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 18 }, [
          div({ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 62, height: 62, borderRadius: 31, background: GREEN, color: '#fff', fontSize: 28, fontWeight: 700, flexShrink: 0 }, String(n)),
          div({ display: 'flex', flex: 1, background: GREEN_SOFT, borderRadius: 14, padding: '14px 20px', minWidth: 0 }, text(p, { fontSize: 30, lineHeight: 1.5 })),
        ]),
      );
    }
  }
  return [titleBlock(plan, width), ...items];
}

// ── 概念図（中心＝タイトル・枝＝groups） ──
function conceptTemplate(plan: VisualPlan, width: number): El[] {
  const branches = plan.groups.length;
  const cols = branches <= 2 ? Math.max(1, branches) : branches <= 4 ? 2 : 3;
  const rows: El[] = [];
  for (let r = 0; r < branches; r += cols) {
    const slice = plan.groups.slice(r, r + cols);
    rows.push(
      div(
        { display: 'flex', width: '100%', gap: 32, marginTop: r > 0 ? 32 : 0 },
        slice.map((g) =>
          div(
            { display: 'flex', flexDirection: 'column', flex: 1, border: `2px solid ${GREEN}`, borderRadius: 18, padding: '16px 20px', minWidth: 0, background: '#fff' },
            [
              text(g.heading ?? '', { fontSize: 28, fontWeight: 700, color: GREEN, lineHeight: 1.4, marginBottom: 8 }),
              ...g.points.map((p) => div({ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }, [text('・', { color: GREEN, fontSize: 26, flexShrink: 0 }), text(p, { fontSize: 26, lineHeight: 1.45, flex: 1 })])),
            ],
          ),
        ),
      ),
    );
  }
  const center = div(
    { display: 'flex', width: '100%', justifyContent: 'center', marginBottom: 28 },
    div({ display: 'flex', background: GREEN, color: '#fff', borderRadius: 999, padding: '20px 40px', maxWidth: width - 56 * 2 }, text(plan.title, { fontSize: 40, fontWeight: 700, lineHeight: 1.4, textAlign: 'center' })),
  );
  const connector = div({ display: 'flex', width: '100%', justifyContent: 'center', color: GREEN, fontSize: 36, fontWeight: 700, marginBottom: 12 }, '↓');
  return [center, connector, ...rows];
}

// ── 317: 関連図（円周配置・ノード順で角度を割当・辺は直線＝回転した細い div・ラベルは中点。力学レイアウトは使わない・R-74） ──
function relationTemplate(plan: VisualPlan, width: number): El[] {
  const nodes = plan.groups.map((g) => (g.heading ?? '').trim());
  const { edges } = relationEdgesOf(plan);
  const n = Math.max(1, nodes.length);
  const area = Math.round(width * 0.82);
  const inner = width - 56 * 2;
  const cx = inner / 2;
  const cy = area / 2;
  const r = Math.min(inner, area) / 2 - 110;
  const boxW = 200;
  const boxH = 64;
  const pos = nodes.map((_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });
  const lines: El[] = edges.map((e) => {
    const a = pos[e.from];
    const b = pos[e.to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.round(Math.sqrt(dx * dx + dy * dy));
    const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 100) / 100;
    return div({ display: 'flex', position: 'absolute', left: a.x, top: a.y - 2, width: len, height: 4, background: GREEN, transform: `rotate(${angle}deg)`, transformOrigin: '0 50%', opacity: 0.55 }, []);
  });
  const edgeLabels: El[] = edges.filter((e) => e.label).map((e) => {
    const a = pos[e.from];
    const b = pos[e.to];
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2);
    return div({ position: 'absolute', left: mx - 80, top: my - 16, width: 160, display: 'flex', justifyContent: 'center' }, div({ display: 'flex', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '2px 8px', fontSize: 20, color: MUTED }, e.label));
  });
  const nodeEls: El[] = nodes.map((label, i) =>
    div(
      { position: 'absolute', left: pos[i].x - boxW / 2, top: pos[i].y - boxH / 2, width: boxW, minHeight: boxH, display: 'flex', alignItems: 'center', justifyContent: 'center', background: GREEN_SOFT, border: `2px solid ${GREEN}`, borderRadius: 16, padding: '8px 12px' },
      text(label, { fontSize: 24, fontWeight: 700, color: INK, lineHeight: 1.35, textAlign: 'center' }),
    ),
  );
  return [titleBlock(plan, width), div({ position: 'relative', width: inner, height: area, display: 'flex' }, [...lines, ...edgeLabels, ...nodeEls])];
}

// ── 317: タイムライン（横1本の軸に等間隔・when は文字列のまま） ──
function timelineTemplate(plan: VisualPlan, width: number): El[] {
  const items = plan.groups;
  const n = Math.max(1, items.length);
  const inner = width - 56 * 2;
  const colW = Math.floor(inner / n);
  return [
    titleBlock(plan, width),
    div({ position: 'relative', width: inner, display: 'flex', flexDirection: 'column' }, [
      div({ display: 'flex', position: 'absolute', left: Math.floor(colW / 2), top: 22, width: inner - colW, height: 4, background: GREEN, borderRadius: 2 }, []),
      div(
        { display: 'flex', width: inner },
        items.map((g) =>
          div({ display: 'flex', flexDirection: 'column', alignItems: 'center', width: colW, minWidth: 0, padding: '0 6px' }, [
            div({ display: 'flex', width: 24, height: 24, borderRadius: 12, background: GREEN, border: '4px solid #fff', marginTop: 12, flexShrink: 0 }, []),
            text(g.heading ?? '', { fontSize: 22, fontWeight: 700, color: GREEN, marginTop: 12, textAlign: 'center', lineHeight: 1.4 }),
            text(g.points[0] ?? '', { fontSize: 24, fontWeight: 700, color: INK, marginTop: 6, textAlign: 'center', lineHeight: 1.45 }),
            ...(g.points[1] ? [text(g.points[1], { fontSize: 20, color: MUTED, marginTop: 4, textAlign: 'center', lineHeight: 1.45 })] : []),
          ]),
        ),
      ),
    ]),
  ];
}

// ── 317: 数値ハイライト（カード並び 2〜3列・数値＋単位を大きく・見出し。引用は描かない＝検証用） ──
function figuresTemplate(plan: VisualPlan, width: number): El[] {
  const n = plan.groups.length;
  const cols = n <= 4 ? 2 : 3;
  const rows: El[] = [];
  for (let r = 0; r < n; r += cols) {
    const slice = plan.groups.slice(r, r + cols);
    rows.push(
      div(
        { display: 'flex', width: '100%', gap: 24, marginTop: r > 0 ? 24 : 0 },
        slice.map((g) =>
          div({ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: GREEN_SOFT, border: `2px solid ${GREEN}`, borderRadius: 18, padding: '20px 20px', alignItems: 'center' }, [
            text(g.points[0] ?? '', { fontSize: 56, fontWeight: 700, color: GREEN, lineHeight: 1.2, textAlign: 'center' }),
            text(g.heading ?? '', { fontSize: 26, color: INK, marginTop: 8, lineHeight: 1.4, textAlign: 'center' }),
          ]),
        ),
      ),
    );
  }
  return [titleBlock(plan, width), ...rows];
}

// ── 317: 1枚サマリー（タイトル＋要点3＋一言・描画済みの図を埋め込み可） ──
function onepageTemplate(plan: VisualPlan, width: number): El[] {
  const pts = plan.groups[0]?.points ?? [];
  const one = plan.groups[1]?.points[0] ?? '';
  const inner = width - 56 * 2;
  return [
    titleBlock(plan, width),
    ...(plan.embedImage ? [{ type: 'img', props: { src: plan.embedImage, width: inner, height: Math.round(inner * 0.5), style: { width: inner, height: Math.round(inner * 0.5), objectFit: 'contain', borderRadius: 12, marginBottom: 20 } } } as El] : []),
    ...pts.map((p, i) =>
      div({ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 14 }, [
        div({ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 26, background: GREEN, color: '#fff', fontSize: 26, fontWeight: 700, flexShrink: 0 }, String(i + 1)),
        text(p, { fontSize: 34, fontWeight: 700, color: INK, lineHeight: 1.45, flex: 1 }),
      ]),
    ),
    ...(one ? [div({ display: 'flex', marginTop: 28, padding: '16px 22px', background: GREEN_SOFT, borderLeft: `6px solid ${GREEN}`, borderRadius: 12 }, text(one, { fontSize: 30, color: INK, lineHeight: 1.5 }))] : []),
  ];
}

/** 決定的描画（9種）。type='image' はここでは描かない（overlay を使う） */
export function buildVisualElement(plan: VisualPlan, orientation: VisualOrientation): { element: El; canvas: VisualCanvas } {
  const width = VISUAL_CANVAS_WIDTH[orientation];
  const height = estimateVisualHeight(plan, orientation);
  const children =
    plan.type === 'table' ? tableTemplate(plan, width)
    : plan.type === 'flow' ? flowTemplate(plan, width)
    : plan.type === 'compare' ? compareTemplate(plan, width)
    : plan.type === 'steps' ? stepsTemplate(plan, width)
    : plan.type === 'relation' ? relationTemplate(plan, width)
    : plan.type === 'timeline' ? timelineTemplate(plan, width)
    : plan.type === 'figures' ? figuresTemplate(plan, width)
    : plan.type === 'onepage' ? onepageTemplate(plan, width)
    : conceptTemplate(plan, width);
  return { element: frame(width, height, children), canvas: { width, height } };
}

/**
 * 317: 型ごとの「描画される文字列」（照合用）。関連図＝ノード名＋辺ラベル（「→ 相手: ラベル」の生文字列は描かない）、
 * 数値＝見出し＋数値（引用は描かない）、タイムライン＝時期＋出来事＋補足、1枚サマリー＝タイトル＋要点＋一言。他は全文字列
 */
export function expectedStringsOf(plan: VisualPlan): string[] {
  if (plan.type === 'relation') {
    const { edges } = relationEdgesOf(plan);
    return [plan.title.trim(), ...plan.groups.map((g) => (g.heading ?? '').trim()), ...edges.map((e) => e.label)].filter(Boolean);
  }
  if (plan.type === 'figures') return [plan.title.trim(), ...plan.groups.flatMap((g) => [(g.points[0] ?? '').trim(), (g.heading ?? '').trim()])].filter(Boolean);
  if (plan.type === 'onepage') return [plan.title.trim(), ...(plan.groups[0]?.points ?? []).map((p) => p.trim()), (plan.groups[1]?.points[0] ?? '').trim()].filter(Boolean);
  return collectPlanStrings(plan);
}

/** イメージ（AI の絵柄）にプランの文字を重ねる。上にタイトル帯・下に見出し／要素の帯（半透明）。画像は data URI */
export function buildOverlayElement(plan: VisualPlan, imageDataUrl: string, canvas: VisualCanvas): El {
  const { width, height } = canvas;
  const labels = plan.groups.flatMap((g) => [...(g.heading ? [g.heading] : []), ...g.points]);
  return {
    type: 'div',
    props: {
      style: { width, height, display: 'flex', position: 'relative', fontFamily: FONT, color: '#fff' },
      children: [
        { type: 'img', props: { src: imageDataUrl, width, height, style: { position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' } } },
        div(
          { position: 'absolute', top: 0, left: 0, width, display: 'flex', padding: '28px 36px', background: 'rgba(31,42,37,0.72)' },
          text(plan.title, { fontSize: Math.round(width / 26), fontWeight: 700, lineHeight: 1.35, width: width - 72 }),
        ),
        ...(labels.length > 0
          ? [
              div(
                { position: 'absolute', bottom: 0, left: 0, width, display: 'flex', flexDirection: 'column', padding: '20px 36px', background: 'rgba(47,107,79,0.82)', gap: 6 },
                labels.map((l) => text(l, { fontSize: Math.round(width / 38), lineHeight: 1.4, width: width - 72 })),
              ),
            ]
          : []),
      ],
    },
  };
}

/** 要素木から文字列を集める（描画される文字＝プランの文字かを機械判定するため） */
export function collectElementText(el: unknown, out: string[] = []): string[] {
  if (el === null || el === undefined || typeof el === 'boolean') return out;
  if (typeof el === 'string') {
    if (el.trim()) out.push(el);
    return out;
  }
  if (typeof el === 'number') {
    out.push(String(el));
    return out;
  }
  if (Array.isArray(el)) {
    for (const c of el) collectElementText(c, out);
    return out;
  }
  const node = el as El;
  if (node.props && 'children' in node.props) collectElementText(node.props.children, out);
  return out;
}

/** 固定の記号（矢印・チェック・番号・中黒）はプランの文字ではないので除外して照合 */
const FIXED_MARKS = new Set(['→', '↓', '✓', '・']);

/** 描画される文字列 ＝ プランの文字列（順序不問・固定記号と番号を除く）。missing／extra を返す */
export function verifyRenderedText(plan: VisualPlan, element: El): { ok: boolean; missing: string[]; extra: string[] } {
  const rendered = collectElementText(element).filter((s) => !FIXED_MARKS.has(s) && !/^\d+$/.test(s));
  const expected = expectedStringsOf(plan);
  const missing = expected.filter((s) => !rendered.includes(s));
  const extra = rendered.filter((s) => !expected.includes(s));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/** フォントサブセット取得用: 描画対象の全文字（固定記号・数字を含む） */
export function collectVisualText(plan: VisualPlan): string {
  return Array.from(new Set([...expectedStringsOf(plan), '0123456789→↓✓・'].join(''))).join('');
}
