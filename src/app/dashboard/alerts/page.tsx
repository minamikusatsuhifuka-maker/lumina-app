'use client';
import { useState, useEffect } from 'react';

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
  const [alerts, setAlerts] = useState<any[]>([]);
  const [topic, setTopic] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [results, setResults] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string>('');

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
    const res = await fetch('/api/alerts/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: alertTopic }),
    });
    const data = await res.json();
    setResults(prev => ({ ...prev, [id]: data.result }));
    setRunning('');
  };

  const freqColors: Record<string, string> = { daily: '#f5a623', weekly: '#6c63ff', manual: '#7878a0' };
  const freqLabels: Record<string, string> = { daily: '毎日', weekly: '週1', manual: '手動' };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>🔔 定期リサーチアラート</h1>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>登録したトピックの最新情報を自動収集します</p>

      {/* 新規追加 */}
      <div style={{ background: '#12142a', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#a89fff', marginBottom: 14 }}>＋ 新しいアラートを追加</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="監視したいトピック（例：AI最新動向、競合他社の動向）"
            style={{ flex: 1, padding: '10px 14px', background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 14, outline: 'none' }}
            onKeyDown={e => e.key === 'Enter' && addAlert()}
          />
        </div>

        {/* プリセット */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 14 }}>
          {PRESETS.map(p => (
            <button key={p} onClick={() => setTopic(p)}
              style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(108,99,255,0.2)', background: 'rgba(108,99,255,0.05)', color: '#a89fff', cursor: 'pointer', fontSize: 11 }}>
              {p}
            </button>
          ))}
        </div>

        {/* 頻度選択 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {FREQUENCIES.map(f => (
            <button key={f.id} onClick={() => setFrequency(f.id)} style={{
              flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
              border: frequency === f.id ? '2px solid #6c63ff' : '1px solid rgba(130,140,255,0.15)',
              background: frequency === f.id ? 'rgba(108,99,255,0.15)' : '#07080f',
              color: frequency === f.id ? '#a89fff' : '#7878a0', textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: '#5a5a7a' }}>{f.desc}</div>
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
      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5a5a7a' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
          <div>アラートが登録されていません</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>監視したいトピックを上から追加してください</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(alert => (
            <div key={alert.id} style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: results[alert.id] ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${freqColors[alert.frequency]}20`, color: freqColors[alert.frequency], fontWeight: 600 }}>
                    {freqLabels[alert.frequency]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f0ff' }}>{alert.topic}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => runAlert(alert.topic, alert.id)}
                    disabled={running === alert.id}
                    style={{ padding: '5px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: running === alert.id ? 0.7 : 1 }}
                  >
                    {running === alert.id ? '収集中...' : '▶ 今すぐ収集'}
                  </button>
                  <button onClick={() => deleteAlert(alert.id)} style={{ padding: '5px 10px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>削除</button>
                </div>
              </div>
              {results[alert.id] && (
                <div style={{ marginTop: 12, padding: 14, background: '#07080f', borderRadius: 8, fontSize: 13, color: '#c0c0e0', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {results[alert.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
