'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CATS = [
  { key: '', label: '全て' }, { key: 'marketing', label: '📣 マーケティング' }, { key: 'branding', label: '🎨 ブランディング' },
  { key: 'hiring', label: '👥 採用・育成' }, { key: 'operations', label: '⚙️ 業務改善' },
  { key: 'finance', label: '💰 財務' }, { key: 'patient', label: '🏥 患者満足' }, { key: 'other', label: 'その他' },
];
const PRI_BADGE: Record<string, { color: string; label: string }> = { high: { color: '#ef4444', label: '🔴 高' }, medium: { color: '#f5a623', label: '🟡 中' }, low: { color: '#4ade80', label: '🟢 低' } };

export default function StrategyBoardPage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [chatting, setChatting] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [genCat, setGenCat] = useState('marketing');
  const [genChallenge, setGenChallenge] = useState('');
  const [genGoal, setGenGoal] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = () => { fetch('/api/clinic/strategies').then(r => r.json()).then(d => { if (Array.isArray(d)) setStrategies(d); setLoading(false); }); };
  useEffect(() => { fetchData(); }, []);

  const filtered = filterCat ? strategies.filter(s => s.category === filterCat) : strategies;
  const byStatus = (status: string) => filtered.filter(s => s.status === status);

  const runChat = async () => {
    if (!chatMsg.trim()) return;
    setChatting(true); setChatResult('');
    try {
      const res = await fetch('/api/clinic/strategies/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: chatMsg }) });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '', buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const l of lines) { if (!l.startsWith('data: ')) continue; try { const j = JSON.parse(l.slice(6)); if (j.type === 'text') { acc += j.content; setChatResult(acc); } } catch {} }
      }
    } catch {} finally { setChatting(false); }
  };

  const generateStrategy = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/clinic/strategies/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: genCat, challenge: genChallenge, goal: genGoal }) });
      const data = await res.json();
      if (data.title) setGenPreview(data);
    } catch {} finally { setGenerating(false); }
  };

  const saveStrategy = async () => {
    if (!genPreview) return;
    setSaving(true);
    const res = await fetch('/api/clinic/strategies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: genPreview.title, category: genCat, description: genPreview.description, goal: genPreview.goal, background: genPreview.background, priority: 'medium' }) });
    const { id } = await res.json();
    if (genPreview.firstActions) {
      for (const a of genPreview.firstActions) {
        await fetch(`/api/clinic/strategies/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: a.title, description: a.description, assigneeName: a.assignee, priority: 'high', dueInDays: a.dueInDays }) });
      }
    }
    setShowGen(false); setGenPreview(null); fetchData(); setSaving(false);
    router.push(`/admin/strategy/${id}`);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  const renderColumn = (status: string, label: string, items: any[]) => (
    <div style={{ flex: 1, minWidth: 250 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>{label}（{items.length}）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(s => (
          <Link key={s.id} href={`/admin/strategy/${s.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{s.title}</span>
                <span style={{ fontSize: 10, color: PRI_BADGE[s.priority]?.color }}>{PRI_BADGE[s.priority]?.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{CATS.find(c => c.key === s.category)?.label || s.category}</div>
              {s.target_date && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>期限: {new Date(s.target_date).toLocaleDateString('ja-JP')}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🗺 経営戦略ボード</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowGen(true)} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>＋ 新規戦略</button>
            <button onClick={() => setShowChat(!showChat)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: showChat ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: showChat ? '#6c63ff' : 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>🤖 AIと相談</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button key={c.key} onClick={() => setFilterCat(c.key)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filterCat === c.key ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: filterCat === c.key ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${filterCat === c.key ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>{c.label}</button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div> : (
          <div style={{ display: 'flex', gap: 16 }}>
            {renderColumn('draft', '📝 ドラフト', byStatus('draft'))}
            {renderColumn('active', '▶️ 実行中', byStatus('active'))}
            {renderColumn('completed', '✅ 完了', byStatus('completed'))}
          </div>
        )}
      </div>

      {/* AIチャットサイドパネル */}
      {showChat && (
        <div style={{ width: 320, flexShrink: 0, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', position: 'sticky', top: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>🤖 戦略AIコンサルタント</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {['新患獲得を増やしたい', 'スタッフ定着率を上げたい', 'ブランド改善', '業務効率化'].map(q => (
              <button key={q} onClick={() => setChatMsg(q)} style={{ padding: '3px 8px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>{q}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
            {chatResult && <div style={{ padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{chatResult}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runChat(); } }} placeholder="質問を入力..." style={{ flex: 1, padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
            <button onClick={runChat} disabled={chatting} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: chatting ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{chatting ? '...' : '送信'}</button>
          </div>
        </div>
      )}

      {/* 戦略生成モーダル */}
      {showGen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 AI戦略立案</h2>
              <button onClick={() => { setShowGen(false); setGenPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {!genPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>カテゴリ</label>
                  <select value={genCat} onChange={e => setGenCat(e.target.value)} style={inputStyle}>{CATS.filter(c => c.key).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>現状の課題</label><textarea value={genChallenge} onChange={e => setGenChallenge(e.target.value)} placeholder="例：新患数が月30名から伸び悩んでいる" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>目標</label><input value={genGoal} onChange={e => setGenGoal(e.target.value)} placeholder="例：半年で月50名に増やす" style={inputStyle} /></div>
                <button onClick={generateStrategy} disabled={generating || !genChallenge.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{generating ? '生成中...' : '🤖 戦略を立案する'}</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{genPreview.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>{genPreview.description}</div>
                {genPreview.phases?.map((p: any, i: number) => (
                  <div key={i} style={{ padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                    <strong>Phase {p.phase}:</strong> {p.name}（{p.duration}）
                  </div>
                ))}
                {genPreview.firstActions?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>初期タスク {genPreview.firstActions.length}件が自動作成されます</div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={saveStrategy} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : 'この戦略を作成する'}</button>
                  <button onClick={() => setGenPreview(null)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
