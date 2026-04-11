'use client';
import { useState, useEffect } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { DateRangePicker, DateRange, getDateCondition } from '@/components/DateRangePicker';

const FREQUENCIES = [
  { id: 'daily', label: '毎日', desc: '毎朝最新情報を収集' },
  { id: 'weekly', label: '週1回', desc: '週次でまとめてリサーチ' },
  { id: 'manual', label: '手動のみ', desc: 'ボタンを押した時だけ' },
];

const PRESETS = [
  'AI・ChatGPT最新動向', '競合他社の動向', '業界トレンド',
  '採用市場の動向', 'マーケティング最新手法', '人材育成・マネジメント手法',
  'SNSトレンド・バズり情報', '医療・ヘルスケア最新情報',
];

export default function AlertsPage() {
  const { progress, loading: progressLoading, setProgress, startProgress, completeProgress, resetProgress } = useProgress();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [topic, setTopic] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [results, setResults] = useState<Record<string, string>>({});
  const [diffs, setDiffs] = useState<Record<string, { newInfo?: string[]; changedInfo?: string[]; summary?: string }>>({});
  const [running, setRunning] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [runningAll, setRunningAll] = useState(false);
  const [allProgress, setAllProgress] = useState({ done: 0, total: 0 });
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [savedResults, setSavedResults] = useState<Record<string, { text: string; date: string }[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem('lumina_alert_results') || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    fetch('/api/alerts').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAlerts(data);
    });
  }, []);

  const addAlert = async () => {
    if (!topic.trim()) return;
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, frequency }),
    });
    const data = await res.json();
    if (data.success) {
      setAlerts(prev => [{ id: data.id, topic, frequency, is_active: 1 }, ...prev]);
      setTopic('');
    }
  };

  const deleteAlert = async (id: string) => {
    await fetch('/api/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const runAlert = async (alertTopic: string, id: string) => {
    setRunning(id);
    startProgress();
    try {
      const res = await fetch('/api/alerts/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: alertTopic + getDateCondition(dateRange) }),
      });
      const data = await res.json();
      if (data.result) {
        setResults(prev => ({ ...prev, [id]: data.result }));
        if (data.diffAnalysis) {
          setDiffs(prev => ({ ...prev, [id]: data.diffAnalysis }));
        }

        const newEntry = { text: data.result, date: new Date().toLocaleString('ja-JP') };
        setSavedResults(prev => {
          const existing = prev[id] || [];
          const updated = [newEntry, ...existing].slice(0, 5);
          const next = { ...prev, [id]: updated };
          localStorage.setItem('lumina_alert_results', JSON.stringify(next));
          return next;
        });

        setExpandedResults(prev => new Set([...prev, id]));

        await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'alert',
            title: `アラート: ${alertTopic} (${new Date().toLocaleDateString('ja-JP')})`,
            content: data.result,
            metadata: { topic: alertTopic, collectedAt: new Date().toISOString() },
            tags: '定期アラート',
            group_name: 'アラート',
          }),
        });
      }
    } finally {
      setRunning('');
      completeProgress();
    }
  };

  const runAllAlerts = async () => {
    if (alerts.length === 0) return;
    setRunningAll(true);
    startProgress();
    setAllProgress({ done: 0, total: alerts.length });

    for (let i = 0; i < alerts.length; i++) {
      const alert = alerts[i];
      try {
        const res = await fetch('/api/alerts/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: alert.topic }),
        });
        const data = await res.json();
        if (data.result) {
          setResults(prev => ({ ...prev, [alert.id]: data.result }));
          const newEntry = { text: data.result, date: new Date().toLocaleString('ja-JP') };
          setSavedResults(prev => {
            const existing = prev[alert.id] || [];
            const updated = [newEntry, ...existing].slice(0, 5);
            const next = { ...prev, [alert.id]: updated };
            localStorage.setItem('lumina_alert_results', JSON.stringify(next));
            return next;
          });
          setExpandedResults(prev => new Set([...prev, alert.id]));
          await fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'alert',
              title: `アラート: ${alert.topic} (${new Date().toLocaleDateString('ja-JP')})`,
              content: data.result,
              metadata: { topic: alert.topic, collectedAt: new Date().toISOString() },
              tags: '定期アラート',
              group_name: 'アラート',
            }),
          });
        }
      } catch {}
      setAllProgress({ done: i + 1, total: alerts.length });
      setProgress(Math.round(((i + 1) / alerts.length) * 100));
    }

    completeProgress();
    setRunningAll(false);
    setAllProgress({ done: 0, total: 0 });
  };

  const freqColors: Record<string, string> = { daily: '#f5a623', weekly: '#6c63ff', manual: '#7878a0' };
  const freqLabels: Record<string, string> = { daily: '毎日', weekly: '週1', manual: '手動' };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="🔔 アラート収集中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🔔 定期リサーチアラート</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>登録したトピックの最新情報を自動収集します</p>

      {/* 新規追加 */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>＋ 新しいアラートを追加</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="監視したいトピック（例：AI最新動向、競合他社の動向）"
            style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
          />
        </div>

        {/* 収集期間 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>収集期間：</span>
          <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="期間を指定しない場合は最新情報" />
        </div>
        {/* プリセット */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 14 }}>
          {PRESETS.map(p => (
            <button key={p} onClick={() => setTopic(p)}
              style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>
              {p}
            </button>
          ))}
        </div>

        {/* 頻度選択 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {FREQUENCIES.map(f => (
            <button key={f.id} onClick={() => setFrequency(f.id)} style={{
              flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
              border: frequency === f.id ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: frequency === f.id ? 'var(--accent-soft)' : 'var(--bg-primary)',
              color: frequency === f.id ? 'var(--text-secondary)' : 'var(--text-muted)', textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: 'var(--text-muted)' }}>{f.desc}</div>
            </button>
          ))}
        </div>

        <button onClick={addAlert} disabled={!topic.trim()} style={{
          width: '100%', padding: '11px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
          opacity: !topic.trim() ? 0.5 : 1,
        }}>
          🔔 アラートを登録
        </button>
      </div>

      {/* アラート一覧 */}
      {/* 一斉収集ボタン */}
      {alerts.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              🔔 登録中のアラート：{alerts.length}件
            </p>
            {runningAll && (
              <p style={{ fontSize: 12, color: 'var(--accent)', margin: '4px 0 0' }}>
                収集中... {allProgress.done}/{allProgress.total}件完了
              </p>
            )}
          </div>
          <button
            onClick={runAllAlerts}
            disabled={runningAll}
            style={{
              padding: '10px 24px',
              background: runningAll
                ? 'rgba(108,99,255,0.3)'
                : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: runningAll ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {runningAll ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                {allProgress.done}/{allProgress.total} 収集中...
              </>
            ) : (
              '⚡ 全アラートを一斉収集'
            )}
          </button>
        </div>
      )}

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
          <div>アラートが登録されていません</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>監視したいトピックを上から追加してください</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(alert => {
            const isExpanded = expandedResults.has(alert.id);
            const currentResult = results[alert.id];
            const history = savedResults[alert.id] || [];
            const latestSaved = history[0];

            return (
              <div key={alert.id} style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {/* ヘッダー */}
                <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: `${freqColors[alert.frequency]}20`,
                      color: freqColors[alert.frequency], fontWeight: 600,
                    }}>
                      {freqLabels[alert.frequency]}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {alert.topic}
                    </span>
                    {latestSaved && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        最終収集: {latestSaved.date}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(currentResult || latestSaved) && (
                      <button
                        onClick={() => {
                          setExpandedResults(prev => {
                            const next = new Set(prev);
                            if (next.has(alert.id)) next.delete(alert.id);
                            else next.add(alert.id);
                            return next;
                          });
                        }}
                        style={{
                          padding: '5px 10px', background: 'var(--accent-soft)',
                          border: '1px solid var(--border-accent)', borderRadius: 6,
                          color: 'var(--accent)', cursor: 'pointer', fontSize: 12,
                        }}
                      >
                        {isExpanded ? '▲ 閉じる' : '▼ 結果を見る'}
                      </button>
                    )}
                    <button
                      onClick={() => runAlert(alert.topic, alert.id)}
                      disabled={running === alert.id}
                      style={{
                        padding: '5px 14px',
                        background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                        color: '#fff', border: 'none', borderRadius: 6,
                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        opacity: running === alert.id ? 0.7 : 1,
                      }}
                    >
                      {running === alert.id ? '収集中...' : '▶ 今すぐ収集'}
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      style={{
                        padding: '5px 10px', background: 'rgba(255,107,107,0.1)',
                        border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b',
                        borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>

                {/* 収集結果（展開時のみ） */}
                {isExpanded && (currentResult || latestSaved) && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {/* 前回比較差分 */}
                    {diffs[alert.id] && (
                      <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>📊 前回からの変化</p>
                        {diffs[alert.id].newInfo && diffs[alert.id].newInfo!.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>🆕 新しい情報</p>
                            {diffs[alert.id].newInfo!.map((info, i) => (
                              <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 12 }}>・{info}</p>
                            ))}
                          </div>
                        )}
                        {diffs[alert.id].changedInfo && diffs[alert.id].changedInfo!.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>🔄 変化した情報</p>
                            {diffs[alert.id].changedInfo!.map((info, i) => (
                              <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 12 }}>・{info}</p>
                            ))}
                          </div>
                        )}
                        {diffs[alert.id].summary && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{diffs[alert.id].summary}</p>
                        )}
                      </div>
                    )}

                    <div style={{
                      padding: 16, background: 'var(--bg-primary)',
                      fontSize: 13, color: 'var(--text-secondary)',
                      lineHeight: 1.8, whiteSpace: 'pre-wrap',
                      maxHeight: '50vh', overflowY: 'auto',
                    }}>
                      {currentResult || latestSaved?.text}
                    </div>

                    {history.length > 1 && (
                      <div style={{ padding: '8px 16px 16px', borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                          📚 過去の収集履歴
                        </p>
                        {history.slice(1).map((h, i) => (
                          <details key={i} style={{ marginBottom: 6 }}>
                            <summary style={{
                              fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
                              padding: '4px 8px', background: 'var(--bg-card)',
                              borderRadius: 6, listStyle: 'none',
                            }}>
                              📅 {h.date}
                            </summary>
                            <div style={{
                              marginTop: 6, padding: 12,
                              background: 'var(--bg-primary)', borderRadius: 8,
                              fontSize: 12, color: 'var(--text-secondary)',
                              lineHeight: 1.8, whiteSpace: 'pre-wrap',
                              maxHeight: 300, overflowY: 'auto',
                            }}>
                              {h.text}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
