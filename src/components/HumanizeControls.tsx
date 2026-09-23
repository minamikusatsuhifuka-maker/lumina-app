'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 336: 「✍️ 人間らしく整える」の画面部品（note 7経路・Kindle 2画面で共用）
// - useHumanizeSetting: ☑ の状態（既定オン・端末に記憶・localStorage・273 のホバープレビューと同じ型）
// - HumanizeToggle: 生成画面に置くチェックボックス（data-humanize-toggle）
// - HumanizeBadge: 生成後の1行「✍️ 整え済み・AIらしい言い回し 14 → 2」＋「整える前を見る」＋警告＋「再試行」
//   （再試行は /api/humanize に本文を渡し、戻った本文と記録を onApply で親に返す＝保存は整えた版）
// 案内は操作要素に重ねない（in-flow・R-133）。Tailwind は使わずインライン（この画面群の慣行）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { MarkdownBody } from '@/components/MarkdownBody';
import {
  HUMANIZE_LABEL,
  HUMANIZE_STORAGE_KEY,
  humanizeCanRetry,
  humanizeStatusLine,
  type HumanizeInfo,
  type HumanizeKind,
  type HumanizeMetadata,
} from '@/lib/humanize';

export const HUMANIZE_EVENT = 'humanize-setting-change';

/** 既定オン（'0' が保存されているときだけオフ） */
export function isHumanizeEnabled(): boolean {
  try {
    return localStorage.getItem(HUMANIZE_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHumanizeEnabled(on: boolean) {
  try {
    localStorage.setItem(HUMANIZE_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* 保存できない環境でもタブ内の挙動は揃える */
  }
  window.dispatchEvent(new CustomEvent(HUMANIZE_EVENT, { detail: { enabled: on } }));
}

export function useHumanizeSetting(): { enabled: boolean; setEnabled: (on: boolean) => void; mounted: boolean } {
  const [enabled, setEnabledState] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(isHumanizeEnabled());
    setMounted(true);
    const onChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabledState(on);
    };
    window.addEventListener(HUMANIZE_EVENT, onChange);
    return () => window.removeEventListener(HUMANIZE_EVENT, onChange);
  }, []);
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setHumanizeEnabled(on);
  }, []);
  return { enabled, setEnabled, mounted };
}

export function HumanizeToggle({ style, hint = true }: { style?: CSSProperties; hint?: boolean }) {
  const { enabled, setEnabled, mounted } = useHumanizeSetting();
  return (
    <label
      data-humanize-toggle-label
      title="生成した本文を、意味と数字を変えずに人間らしい文章へ整えます（AIで1回・既定オン・この端末に記憶）"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', ...style }}
    >
      <input type="checkbox" data-humanize-toggle checked={mounted ? enabled : true} onChange={(e) => setEnabled(e.target.checked)} />
      {HUMANIZE_LABEL}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>（意味・数字は変えない）</span>}
    </label>
  );
}

type BadgeInfo = HumanizeInfo | HumanizeMetadata;

interface BadgeProps {
  info: BadgeInfo | null | undefined;
  /** 再試行で渡す本文（現在の本文）と種別。onApply が無ければ再試行ボタンは出さない */
  content?: string;
  kind?: HumanizeKind;
  onApply?: (content: string, info: HumanizeInfo) => void;
  /** 整えている途中（ストリーミング経路） */
  busy?: boolean;
  style?: CSSProperties;
}

export function HumanizeBadge({ info, content, kind = 'note', onApply, busy = false, style }: BadgeProps) {
  const [showBefore, setShowBefore] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  if (busy) {
    return (
      <div data-humanize-status="busy" style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', ...style }}>
        ✍️ 整えています…
      </div>
    );
  }
  if (!info) return null;

  const canRetry = !!onApply && !!content?.trim() && humanizeCanRetry(info);
  const retry = async () => {
    if (!onApply || !content || retrying) return;
    setRetrying(true);
    setRetryError('');
    try {
      const res = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.content !== 'string' || !data.humanize) throw new Error(data.error || `再試行に失敗しました（${res.status}）`);
      onApply(data.content, data.humanize as HumanizeInfo);
      setShowBefore(false);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };

  const before = typeof info.before === 'string' && info.before.trim() ? info.before : null;
  const color = info.applied ? '#0f766e' : 'var(--text-muted)';
  return (
    <div data-humanize-badge style={{ marginBottom: 8, fontSize: 11, lineHeight: 1.7, ...style }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span data-humanize-status={info.applied ? 'applied' : info.reason ?? 'error'} style={{ color }}>
          {humanizeStatusLine(info)}
          {'detail' in info && info.detail ? `（${info.detail}）` : ''}
        </span>
        {info.applied && before && (
          <button
            type="button"
            data-humanize-before-toggle
            onClick={() => setShowBefore((v) => !v)}
            style={{ padding: '2px 8px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer' }}
          >
            {showBefore ? '整えた後に戻す' : '整える前を見る'}
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            data-humanize-retry
            onClick={retry}
            disabled={retrying}
            style={{ padding: '2px 8px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: retrying ? 'not-allowed' : 'pointer' }}
          >
            {retrying ? '✍️ 整えています…' : '🔄 再試行'}
          </button>
        )}
      </div>
      {info.warnings.length > 0 && (
        <div data-humanize-warnings style={{ color: '#B45309' }}>
          {info.warnings.map((w, i) => (
            <div key={i} data-humanize-warning>⚠️ {w}（元の資料と見比べてください）</div>
          ))}
        </div>
      )}
      {retryError && <div style={{ color: '#ef4444' }}>❌ {retryError}</div>}
      {showBefore && before && (
        <div data-humanize-before style={{ marginTop: 6, padding: 10, background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>整える前（保存されるのは整えた後の本文）</div>
          <MarkdownBody text={before} style={{ fontSize: 12, lineHeight: 1.75, maxHeight: 360, overflowY: 'auto' }} />
        </div>
      )}
    </div>
  );
}
