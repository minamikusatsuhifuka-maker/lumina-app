'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnalysisHistory } from '@/components/AnalysisHistory';

interface ContactLog {
  id: number;
  log_date: string;
  web_bookings: number;
  phone_bookings: number;
  line_inquiries: number;
  other_inquiries: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

interface Insight {
  title: string;
  body: string;
  type: 'positive' | 'warning' | 'info';
}
interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}
interface InsightResponse {
  summary: string;
  insights: Insight[];
  recommendations: Recommendation[];
  conversionRate: number;
  totalContacts: number;
}

const PRIORITY_CONFIG = {
  high: { label: '高', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  medium: { label: '中', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
  low: { label: '低', bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e' },
};

const INSIGHT_STYLE = {
  positive: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: '✅' },
  warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '⚠️' },
  info: { bg: 'rgba(108,99,255,0.08)', border: 'rgba(108,99,255,0.3)', icon: '💡' },
};

export default function ContactsPage() {
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // フォーム
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formWeb, setFormWeb] = useState(0);
  const [formPhone, setFormPhone] = useState(0);
  const [formLine, setFormLine] = useState(0);
  const [formOther, setFormOther] = useState(0);
  const [formMemo, setFormMemo] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/contacts');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '取得に失敗しました');
      setLogs(json.logs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const saveLog = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_date: formDate,
          web_bookings: formWeb,
          phone_bookings: formPhone,
          line_inquiries: formLine,
          other_inquiries: formOther,
          memo: formMemo || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存に失敗しました');
      setFormWeb(0);
      setFormPhone(0);
      setFormLine(0);
      setFormOther(0);
      setFormMemo('');
      await fetchLogs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (id: number) => {
    if (!confirm('この記録を削除しますか？')) return;
    try {
      await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      await fetchLogs();
    } catch {
      // 無視
    }
  };

  const runInsight = async () => {
    if (logs.length === 0) {
      setError('先に問い合わせデータを入力してください');
      return;
    }
    setInsightLoading(true);
    setError(null);
    try {
      // 同期間のGA4セッション数を取得
      const logDates = logs.map((l) => l.log_date).sort();
      const startDate = logDates[0];
      const endDate = logDates[logDates.length - 1];
      let gaSessions = 0;
      try {
        const gaRes = await fetch('/api/ga/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate }),
        });
        const gaJson = await gaRes.json();
        if (gaRes.ok) gaSessions = gaJson.metrics?.sessions ?? 0;
      } catch {
        // GA取得失敗時は0で続行
      }

      const res = await fetch('/api/contacts/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs, gaSessions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI分析に失敗しました');
      setInsight(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI分析に失敗しました');
    } finally {
      setInsightLoading(false);
    }
  };

  // 集計・グラフ用データ
  const sortedLogs = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const displayLogs = viewMode === 'week' ? sortedLogs.slice(-7) : sortedLogs.slice(-30);
  const maxTotal = Math.max(
    1,
    ...displayLogs.map(
      (l) => l.web_bookings + l.phone_bookings + l.line_inquiries + l.other_inquiries,
    ),
  );

  const totalWeb = sortedLogs.reduce((s, l) => s + l.web_bookings, 0);
  const totalPhone = sortedLogs.reduce((s, l) => s + l.phone_bookings, 0);
  const totalLine = sortedLogs.reduce((s, l) => s + l.line_inquiries, 0);
  const totalOther = sortedLogs.reduce((s, l) => s + l.other_inquiries, 0);
  const totalAll = totalWeb + totalPhone + totalLine + totalOther;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ct-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          animation: slideUp 0.4s ease both;
          transition: box-shadow 0.2s;
        }
        .ct-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
        }
      `}</style>

      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              fontSize: 18,
            }}
          >
            📞
          </span>
          問い合わせトラッキング
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          日次の予約・問い合わせ数を記録し、GA4セッション数から転換率を分析します。
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 分析保存・履歴 */}
      <AnalysisHistory<{ insight: InsightResponse; logCount: number; recentLogs: ContactLog[] }>
        pageType="contacts"
        currentData={
          insight ? { insight, logCount: logs.length, recentLogs: logs.slice(0, 30) } : null
        }
        canSave={!!insight}
        buildTitle={(d) =>
          `問い合わせ分析 (転換率: ${d.insight.conversionRate.toFixed(2)}% / ${d.logCount}日分)`
        }
        themeColor="#6c63ff"
        buildMarkdown={(d) => {
          const lines: string[] = [];
          lines.push(`# 問い合わせ転換率分析レポート`);
          lines.push('');
          lines.push(`記録日数: ${d.logCount}日`);
          lines.push(`合計問い合わせ: ${d.insight.totalContacts.toLocaleString()}件`);
          lines.push(`セッション→予約転換率: ${d.insight.conversionRate.toFixed(2)}%`);
          lines.push('');
          if (d.insight.summary) {
            lines.push(`## AIサマリー`);
            lines.push(d.insight.summary);
            lines.push('');
          }
          if (d.insight.insights?.length) {
            lines.push(`## 気づき`);
            for (const i of d.insight.insights) {
              lines.push(`### ${i.title}`);
              lines.push(i.body);
              lines.push('');
            }
          }
          if (d.insight.recommendations?.length) {
            lines.push(`## 改善アクション`);
            for (const r of d.insight.recommendations) {
              lines.push(`- **[優先度${r.priority}] ${r.title}** — ${r.description}`);
            }
            lines.push('');
          }
          if (d.recentLogs?.length) {
            lines.push(`## 直近の日次記録`);
            lines.push(`| 日付 | Web | 電話 | LINE | その他 | 合計 |`);
            lines.push(`|---|---|---|---|---|---|`);
            for (const l of d.recentLogs) {
              const total =
                l.web_bookings + l.phone_bookings + l.line_inquiries + l.other_inquiries;
              lines.push(
                `| ${l.log_date} | ${l.web_bookings} | ${l.phone_bookings} | ${l.line_inquiries} | ${l.other_inquiries} | ${total} |`,
              );
            }
          }
          return lines.join('\n');
        }}
      />

      {/* 入力フォーム */}
      <div className="ct-card" style={{ padding: 18, marginBottom: 20 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 12,
          }}
        >
          ✏️ 日次データ入力
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <FormField label="日付">
            <input
              type="date"
              value={formDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setFormDate(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Web予約数">
            <input
              type="number"
              min={0}
              value={formWeb}
              onChange={(e) => setFormWeb(parseInt(e.target.value) || 0)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="電話予約数">
            <input
              type="number"
              min={0}
              value={formPhone}
              onChange={(e) => setFormPhone(parseInt(e.target.value) || 0)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="LINE問い合わせ数">
            <input
              type="number"
              min={0}
              value={formLine}
              onChange={(e) => setFormLine(parseInt(e.target.value) || 0)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="その他">
            <input
              type="number"
              min={0}
              value={formOther}
              onChange={(e) => setFormOther(parseInt(e.target.value) || 0)}
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="メモ（任意）">
          <input
            type="text"
            value={formMemo}
            onChange={(e) => setFormMemo(e.target.value)}
            placeholder="例: 祝日営業 / キャンペーン告知日"
            style={inputStyle}
          />
        </FormField>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={saveLog}
            disabled={saving}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving
                ? 'rgba(108,99,255,0.4)'
                : 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              boxShadow: '0 4px 14px rgba(108,99,255,0.25)',
            }}
          >
            {saving ? '保存中…' : '💾 保存（同日上書き）'}
          </button>
          <button
            onClick={runInsight}
            disabled={insightLoading || logs.length === 0}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: '1px solid rgba(245,158,11,0.4)',
              cursor: insightLoading || logs.length === 0 ? 'not-allowed' : 'pointer',
              background: 'rgba(245,158,11,0.08)',
              color: '#f59e0b',
              fontWeight: 700,
              fontSize: 13,
              opacity: logs.length === 0 ? 0.5 : 1,
            }}
          >
            {insightLoading ? '🤖 分析中…' : '🤖 AI転換率分析'}
          </button>
        </div>
      </div>

      {/* KPIカード */}
      {logs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <KpiCard label="Web予約 累計" value={totalWeb.toLocaleString()} color="#6c63ff" icon="💻" />
          <KpiCard label="電話予約 累計" value={totalPhone.toLocaleString()} color="#00d4b8" icon="📞" />
          <KpiCard label="LINE問い合わせ 累計" value={totalLine.toLocaleString()} color="#10b981" icon="💬" />
          <KpiCard label="その他 累計" value={totalOther.toLocaleString()} color="#f59e0b" icon="📋" />
          <KpiCard label="合計" value={totalAll.toLocaleString()} color="#ef4444" icon="📊" />
        </div>
      )}

      {/* トレンドグラフ */}
      {displayLogs.length > 0 && (
        <div className="ct-card" style={{ padding: 18, marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              📈 問い合わせトレンド
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['week', 'month'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: viewMode === m ? 'rgba(108,99,255,0.1)' : 'var(--bg-primary)',
                    color: viewMode === m ? '#6c63ff' : 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m === 'week' ? '直近7日' : '直近30日'}
                </button>
              ))}
            </div>
          </div>

          {/* 折れ線グラフ（簡易SVG） */}
          <div
            style={{
              position: 'relative',
              height: 240,
              padding: '10px 20px 30px 50px',
              background: 'var(--bg-primary)',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 600 200" preserveAspectRatio="none">
              {/* グリッド */}
              {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                <line
                  key={r}
                  x1="0"
                  y1={200 * (1 - r)}
                  x2="600"
                  y2={200 * (1 - r)}
                  stroke="var(--border)"
                  strokeWidth="0.5"
                  strokeDasharray={r === 0 || r === 1 ? '0' : '2,2'}
                />
              ))}
              {/* 折れ線: 合計 */}
              {displayLogs.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#6c63ff"
                  strokeWidth="2"
                  points={displayLogs
                    .map((l, i) => {
                      const total =
                        l.web_bookings + l.phone_bookings + l.line_inquiries + l.other_inquiries;
                      const x = (i / (displayLogs.length - 1)) * 600;
                      const y = 200 - (total / maxTotal) * 190;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}
              {/* データポイント */}
              {displayLogs.map((l, i) => {
                const total =
                  l.web_bookings + l.phone_bookings + l.line_inquiries + l.other_inquiries;
                const x = displayLogs.length > 1 ? (i / (displayLogs.length - 1)) * 600 : 300;
                const y = 200 - (total / maxTotal) * 190;
                return (
                  <g key={l.id}>
                    <circle cx={x} cy={y} r="4" fill="#6c63ff" />
                    <text
                      x={x}
                      y={y - 8}
                      fontSize="10"
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontWeight="700"
                    >
                      {total}
                    </text>
                  </g>
                );
              })}
            </svg>
            {/* Y軸ラベル */}
            <div
              style={{
                position: 'absolute',
                left: 6,
                top: 10,
                bottom: 30,
                fontSize: 10,
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                textAlign: 'right',
                width: 38,
              }}
            >
              <span>{maxTotal}</span>
              <span>{Math.round(maxTotal / 2)}</span>
              <span>0</span>
            </div>
            {/* X軸ラベル */}
            <div
              style={{
                position: 'absolute',
                bottom: 6,
                left: 50,
                right: 20,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: 'var(--text-muted)',
              }}
            >
              {displayLogs.length > 0 && <span>{displayLogs[0].log_date.slice(5)}</span>}
              {displayLogs.length > 1 && (
                <span>{displayLogs[displayLogs.length - 1].log_date.slice(5)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 日次記録テーブル */}
      {loading ? (
        <div className="ct-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          読み込み中…
        </div>
      ) : logs.length > 0 ? (
        <div className="ct-card" style={{ padding: 18, marginBottom: 20 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 12,
            }}
          >
            📋 日次記録
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th align="left">日付</Th>
                  <Th>Web予約</Th>
                  <Th>電話予約</Th>
                  <Th>LINE</Th>
                  <Th>その他</Th>
                  <Th>合計</Th>
                  <Th align="left">メモ</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 60).map((l) => {
                  const total =
                    l.web_bookings + l.phone_bookings + l.line_inquiries + l.other_inquiries;
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <Td align="left">{l.log_date}</Td>
                      <Td>{l.web_bookings}</Td>
                      <Td>{l.phone_bookings}</Td>
                      <Td>{l.line_inquiries}</Td>
                      <Td>{l.other_inquiries}</Td>
                      <Td style={{ fontWeight: 700, color: '#6c63ff' }}>{total}</Td>
                      <Td align="left" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {l.memo || '—'}
                      </Td>
                      <Td>
                        <button
                          onClick={() => deleteLog(l.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.06)',
                            color: '#ef4444',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          削除
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !error && (
          <div
            className="ct-card"
            style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
          >
            まだ記録がありません。上のフォームから日次データを入力してください。
          </div>
        )
      )}

      {/* AI分析結果 */}
      {insight && (
        <>
          {insight.summary && (
            <div
              className="ct-card"
              style={{
                padding: 18,
                marginBottom: 20,
                background:
                  'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.08))',
                border: '1px solid rgba(108,99,255,0.3)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6c63ff',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                🤖 AI転換率サマリー
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                {insight.summary}
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                セッション→予約転換率: <strong style={{ color: '#6c63ff', fontSize: 16 }}>
                  {insight.conversionRate.toFixed(2)}%
                </strong>{' '}
                / 合計問い合わせ: <strong>{insight.totalContacts.toLocaleString()}件</strong>
              </div>
            </div>
          )}

          {insight.insights.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              {insight.insights.map((ins, i) => {
                const style = INSIGHT_STYLE[ins.type] ?? INSIGHT_STYLE.info;
                return (
                  <div
                    key={i}
                    className="ct-card"
                    style={{
                      padding: 14,
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      {style.icon} {ins.title}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {ins.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {insight.recommendations.length > 0 && (
            <div className="ct-card" style={{ padding: 18, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 14,
                }}
              >
                📋 改善アクション
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insight.recommendations.map((r, i) => {
                  const p = PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.medium;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 4,
                            background: p.bg,
                            border: `1px solid ${p.border}`,
                            color: p.text,
                          }}
                        >
                          優先度{p.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        {r.title}
                      </div>
                      <div
                        style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}
                      >
                        {r.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 小コンポーネント ───
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  boxSizing: 'border-box',
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: 5,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <div
      className="ct-card"
      style={{ padding: 16, position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function Th({
  children,
  align = 'right',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        padding: '10px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'right',
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: '10px 8px',
        color: 'var(--text-secondary)',
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
