'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

function renderMarkdown(text: string): string {
  return text
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;color:#6c63ff;margin:16px 0 6px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border);">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:24px 0 10px;">$2</h2>'.replace('$2', '$1'))
    .replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 12px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary);">$1</strong>')
    .replace(/^> (.+)$/gm, '<div style="padding:8px 12px;border-left:3px solid #6c63ff;background:rgba(108,99,255,0.06);margin:6px 0;font-size:13px;color:var(--text-secondary);">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:4px 0;font-size:13px;color:var(--text-secondary);">$1</li>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, '<ul style="padding-left:20px;margin:8px 0;">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;font-size:13px;color:var(--text-secondary);line-height:1.8;">')
    .replace(/\n/g, '<br>');
}

export default function GrowthReportPage() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState('');
  const [summary, setSummary] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchMonthlyData(selectedMonth);
    fetch('/api/clinic/staff/summary').then(r => r.json()).then(d => {
      if (d?.summary) setSummary(d.summary);
    });
  }, [selectedMonth]);

  const fetchMonthlyData = async (month: string) => {
    setLoading(true);
    setReport('');
    try {
      const res = await fetch(`/api/clinic/staff/growth-report?month=${month}`);
      const data = await res.json();
      setReportData(data);
    } catch {}
    setLoading(false);
  };

  const generateReport = async () => {
    if (!reportData) return;
    setGenerating(true);
    setReport('');
    try {
      const res = await fetch('/api/clinic/staff/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          staffSummary: summary,
        }),
      });
      const data = await res.json();
      setReport(data.report || 'レポートの生成に失敗しました。');
    } catch {
      setReport('レポートの生成に失敗しました。再度お試しください。');
    } finally {
      setGenerating(false);
    }
  };

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>📋 月次成長レポート</h1>
        <Link href="/admin/staff/summary" style={{ fontSize: 13, color: '#6c63ff', textDecoration: 'none' }}>← 成長サマリーへ</Link>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>月ごとの全スタッフ成長ハイライトをAIがまとめます</p>

      {/* 月選択 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {months.map(m => (
          <button key={m} onClick={() => setSelectedMonth(m)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, cursor: 'pointer', background: selectedMonth === m ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: selectedMonth === m ? '#6c63ff' : 'var(--text-muted)', borderColor: selectedMonth === m ? 'rgba(108,99,255,0.3)' : 'var(--border)', fontWeight: selectedMonth === m ? 600 : 400 }}>
            {m}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : (
        <>
          {/* 月次サマリーカード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: '1on1実施', value: `${reportData?.meetingCount || 0}件`, color: '#6c63ff' },
              { label: '実施スタッフ', value: `${reportData?.staffWithMeeting || 0}名`, color: '#4ade80' },
              { label: 'ステージアップ', value: `${reportData?.stageUps?.length || 0}名`, color: '#f59e0b' },
              { label: '昇格承認', value: `${reportData?.promotions?.length || 0}名`, color: '#06b6d4' },
            ].map(s => (
              <div key={s.label} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ステージアップ */}
          {reportData?.stageUps?.length > 0 && (
            <div style={{ marginBottom: 16, padding: 14, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', marginBottom: 8 }}>🌱 成長ステージアップ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reportData.stageUps.map((s: any) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.from}</span>
                    <span style={{ color: '#f59e0b' }}>→</span>
                    <span style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#d97706', fontSize: 12, fontWeight: 600 }}>{s.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AIレポート生成 */}
          <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 AI成長レポート</div>
              <button onClick={generateReport} disabled={generating}
                style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {generating ? '生成中...' : report ? '再生成' : '✨ AIレポートを生成'}
              </button>
            </div>
            {report ? (
              <>
                <div
                  style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, padding: '12px 14px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 10 }}
                  dangerouslySetInnerHTML={{ __html: '<p style="margin:8px 0;font-size:13px;color:var(--text-secondary);line-height:1.8;">' + renderMarkdown(report) + '</p>' }}
                />
                <button onClick={() => navigator.clipboard.writeText(report)}
                  style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                  📋 コピー
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                「AIレポートを生成」ボタンで、今月の成長ハイライトをAIがまとめます
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
