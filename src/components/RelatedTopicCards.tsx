'use client';

/**
 * 331: 「🔗 次に調べると理解が深まるトピック」の候補カード（共通部品・R-91）
 *
 * 症状（院長の実測・PC / 🔭DR結果の下部）:
 *   9枚のカードでタイトルと説明文が枠の右へはみ出し、隣のカードの文字と重なって読めない。
 * 原因:
 *   321（R-124）で globals.css に `button { white-space: nowrap }` を入れたため、
 *   カード型ボタン（中に div の文章を持つボタン）の文章が1行に伸び、
 *   grid の `minmax(280px, 1fr)` トラックを超えて隣に重なっていた（grid アイテムの
 *   自動最小サイズ＝min-content がトラック幅より大きくなる）。
 * 対策（この部品）:
 *   - カード自身に `white-space: normal` / `min-width: 0` / `overflow: hidden`
 *   - タイトル・説明は2行で省略記号（R-109）。全文は `title` 属性＝即時ツールチップ（R-110）
 *   - バッジ・チェックは `flex: 0 0 auto`（縮まない）。縮むのはテキスト側だけ
 *   - 狭幅は1列（`minmax(min(280px, 100%), 1fr)`）で横スクロールを出さない
 */

import type { CSSProperties, ReactNode } from 'react';

export type RelatedTopic = { title: string; reason: string; category?: string; level: string };

/** 難易度バッジの色（🔭DR・✍️note・🌳知識ツリーで共通） */
export function relatedLevelColor(level: string): { bg: string; color: string } {
  if (level === 'プロ') return { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' };
  if (level === '専門') return { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' };
  if (level === '応用') return { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04' };
  if (level === '基礎') return { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' };
  return { bg: 'rgba(59,130,246,0.18)', color: '#3b82f6' };
}

/** n行で省略（R-109）。全文は title 属性で出す（R-110） */
export function clampLines(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    minWidth: 0,
  };
}

export function RelatedTopicGrid({ children }: { children: ReactNode }) {
  return (
    <div
      data-related-topic-grid=""
      style={{
        display: 'grid',
        // 狭幅（コンテナが 280px 未満）でも 280px のトラックを作らない＝横スクロールを出さない
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
        alignItems: 'stretch',
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

export function RelatedTopicCard({
  topic,
  selectable = false,
  selected = false,
  disabled = false,
  onClick,
}: {
  topic: RelatedTopic;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const lv = relatedLevelColor(topic.level);
  return (
    <button
      type="button"
      data-related-topic-card=""
      data-selected={selected ? '1' : '0'}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        // 331: カード型ボタンは R-124 の nowrap を継承しない（1行に伸びて隣に重なる）
        whiteSpace: 'normal',
        minWidth: 0,
        overflow: 'hidden',
        textAlign: 'left',
        padding: 12,
        background: selected ? 'rgba(139,92,246,0.12)' : 'var(--bg-primary)',
        border: `1px solid ${selected ? '#8b5cf6' : 'var(--border)'}`,
        boxShadow: selected ? 'inset 0 0 0 1px #8b5cf6' : 'none',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = selected ? '#8b5cf6' : 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = selected ? '#8b5cf6' : 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
        {selectable && (
          <span
            style={{
              fontSize: 14,
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: selected ? '2px solid #8b5cf6' : '2px solid var(--border)',
              background: selected ? '#8b5cf6' : 'transparent',
              color: '#fff',
              fontWeight: 700,
              flex: '0 0 auto',
              marginTop: 1,
            }}
          >
            {selected ? '✓' : ''}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 6,
            background: lv.bg,
            color: lv.color,
            fontWeight: 700,
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
          }}
        >
          {topic.level}
        </span>
        {/* 縮むのはテキスト側だけ（minWidth:0 を通す） */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div
            title={topic.title}
            data-related-topic-title=""
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.4, ...clampLines(2) }}
          >
            {topic.title}
          </div>
          <div
            title={topic.reason}
            data-related-topic-reason=""
            style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, ...clampLines(2) }}
          >
            {topic.reason}
          </div>
        </div>
      </div>
    </button>
  );
}
