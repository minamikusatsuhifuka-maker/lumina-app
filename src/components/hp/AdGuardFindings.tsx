'use client';

// 184: 医療広告ガードの指摘・修正案リスト（人間承認型）。
// /api/hp-guard の {before, after, reason} を一覧表示し、院長が個別に「適用」「却下」する。
// 適用の確定・再チェックの実行は親が行う（このコンポーネントは表示と操作の受付のみ）。
// HP内容生成の結果（①②）と既存HP文章の加筆修正（④）の両方から使う（コピペしない）。

import type { CSSProperties } from 'react';

export interface AdGuardEdit {
  before: string;
  after: string;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
  // 構造化結果でどのセクションに属するか（④のプレーンテキストでは未使用）
  sectionLabel?: string;
}

// 「AIがチェックしたから安全」と誤認させないための免責（必ず表示・文言を弱めない）
export const AD_GUARD_DISCLAIMER =
  '⚠️ AIによるチェックは参考情報です。見落としの可能性があります。最終的な適法性の確認は医療機関（掲載者）の責任で行ってください。';

export default function AdGuardFindings({
  status,
  edits,
  checking,
  onSetStatus,
  onApplyAll,
  onRecheck,
}: {
  status: 'ok' | 'warn' | null; // null = 未チェック
  edits: AdGuardEdit[];
  checking: boolean;
  onSetStatus: (index: number, status: AdGuardEdit['status']) => void;
  onApplyAll: () => void;
  onRecheck: () => void;
}) {
  const pendingCount = edits.filter((e) => e.status === 'pending').length;

  const smallBtn = (extra?: CSSProperties): CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    ...extra,
  });

  return (
    <div>
      {/* ステータスバナー（⚠️がある間は隠さない） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 14px',
          borderRadius: 8,
          marginBottom: 10,
          background: checking
            ? 'var(--bg-secondary)'
            : status === 'warn'
              ? 'rgba(239,68,68,0.08)'
              : status === 'ok'
                ? 'rgba(16,185,129,0.08)'
                : 'var(--bg-secondary)',
          border: checking
            ? '1px solid var(--border)'
            : status === 'warn'
              ? '1px solid rgba(239,68,68,0.35)'
              : status === 'ok'
                ? '1px solid rgba(16,185,129,0.3)'
                : '1px dashed var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: checking
              ? 'var(--text-muted)'
              : status === 'warn'
                ? '#ef4444'
                : status === 'ok'
                  ? '#10b981'
                  : 'var(--text-muted)',
          }}
        >
          {checking
            ? '🛡 医療広告チェック中...'
            : status === 'warn'
              ? `🚨 医療広告チェック: 要修正 ${edits.filter((e) => e.status !== 'rejected').length}件`
              : status === 'ok'
                ? '✅ 医療広告チェック: 問題なし'
                : '🛡 医療広告チェック: 未実行'}
        </span>
        <button type="button" onClick={onRecheck} disabled={checking} style={smallBtn()}>
          🔄 再チェック
        </button>
        {pendingCount > 0 && !checking && (
          <button
            type="button"
            onClick={onApplyAll}
            title="表示中の修正案をすべて適用します（確定はこの操作＝自動実行はしません）"
            style={smallBtn({ background: '#1D9E75', border: '1px solid #1D9E75', color: '#fff' })}
          >
            ✅ すべて適用（{pendingCount}件）
          </button>
        )}
      </div>

      {/* 免責（常時表示・チェック結果に関わらず） */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
        {AD_GUARD_DISCLAIMER}
      </p>

      {/* 指摘・修正案（差分ペア・個別に適用/却下） */}
      {edits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {edits.map((e, i) => (
            <div
              key={`${i}-${e.before.slice(0, 20)}`}
              style={{
                padding: 10,
                borderRadius: 8,
                border:
                  e.status === 'applied'
                    ? '1px solid rgba(16,185,129,0.35)'
                    : '1px solid var(--border)',
                background:
                  e.status === 'applied'
                    ? 'rgba(16,185,129,0.06)'
                    : e.status === 'rejected'
                      ? 'var(--bg-secondary)'
                      : 'var(--bg-primary)',
                opacity: e.status === 'rejected' ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {e.sectionLabel && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 8px', borderRadius: 8 }}>
                    {e.sectionLabel}
                  </span>
                )}
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444', textDecoration: 'line-through' }}>
                  {e.before}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600 }}>
                  {e.after || '（削除を推奨）'}
                </span>
                {e.status === 'pending' ? (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => onSetStatus(i, 'applied')} style={smallBtn({ background: '#1D9E75', border: '1px solid #1D9E75', color: '#fff' })}>
                      適用
                    </button>
                    <button type="button" onClick={() => onSetStatus(i, 'rejected')} style={smallBtn()}>
                      却下
                    </button>
                  </span>
                ) : (
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.status === 'applied' ? '#10b981' : 'var(--text-muted)' }}>
                      {e.status === 'applied' ? '✓ 適用済み' : '却下'}
                    </span>
                    {e.status === 'rejected' && (
                      <button type="button" onClick={() => onSetStatus(i, 'pending')} style={smallBtn({ fontSize: 10, padding: '2px 8px' })}>
                        戻す
                      </button>
                    )}
                  </span>
                )}
              </div>
              {e.reason && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.6 }}>
                  理由: {e.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
