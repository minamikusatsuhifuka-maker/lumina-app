'use client';
import { useState, useEffect } from 'react';

const parseJson = (v: any) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
const parseArr = (v: any) => { const r = parseJson(v); return Array.isArray(r) ? r : []; };

const CV_COLORS: Record<string, string> = {
  self_love: '#ec4899', self_management: '#f5a623', self_growth: '#4ade80',
  enrich_others: '#6c63ff', social_contribution: '#00d4b8', self_realization: '#8b5cf6', power_partner: '#f87171',
};

export default function GrowthPhilosophyPage() {
  const [philo, setPhilo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchPhilo = () => { fetch('/api/clinic/growth-philosophy').then(r => r.json()).then(d => { setPhilo(d); setLoading(false); }); };
  useEffect(() => { fetchPhilo(); }, []);

  const generate = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/growth-philosophy/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.coreValues) {
        await fetch('/api/clinic/growth-philosophy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'クリニック成長哲学', coreValues: JSON.stringify(data.coreValues), growthModel: JSON.stringify(data.growthModel), winWinVision: data.winWinVision, powerPartnerDefinition: data.powerPartnerDefinition }) });
        fetchPhilo();
        setMessage('成長哲学を生成・保存しました');
      } else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const coreValues = parseArr(philo?.core_values);
  const growthModel = parseJson(philo?.growth_model);
  const stages = growthModel?.stages || [];

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🌟 クリニック成長哲学</h1>
        <button onClick={generate} disabled={generating} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {generating ? '生成中...' : '🤖 AIで成長哲学を組織設計に落とし込む'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>院長の成長哲学をクリニック全体の制度に反映</p>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 16 }}>{message}</div>}

      {!philo ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🌟</div><div>成長哲学が未登録です</div><div style={{ fontSize: 13, marginTop: 8 }}>「AIで成長哲学を組織設計に落とし込む」から始めましょう</div></div>
      ) : (
        <>
          {/* 同心円モデル */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{ position: 'relative', width: 300, height: 300 }}>
              {/* 最外: 社会貢献 */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,212,184,0.08)', border: '2px solid rgba(0,212,184,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16 }}>
                <span style={{ fontSize: 12, color: '#00d4b8', fontWeight: 700 }}>🌍 社会貢献</span>
              </div>
              {/* 中間: 身近な人 */}
              <div style={{ position: 'absolute', top: 50, left: 50, right: 50, bottom: 50, borderRadius: '50%', background: 'rgba(108,99,255,0.08)', border: '2px solid rgba(108,99,255,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 20 }}>
                <span style={{ fontSize: 11, color: '#6c63ff', fontWeight: 700 }}>👨‍👩‍👧 身近な人を豊かに</span>
              </div>
              {/* 最内: 自己愛 */}
              <div style={{ position: 'absolute', top: 100, left: 100, right: 100, bottom: 100, borderRadius: '50%', background: 'rgba(236,72,153,0.1)', border: '2px solid rgba(236,72,153,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontSize: 20 }}>💎</span>
                <span style={{ fontSize: 10, color: '#ec4899', fontWeight: 700 }}>自己愛</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>まず自分の内側から → 身近な人へ → 社会全体へ</div>

          {/* 7つのコア価値 */}
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>7つのコア価値</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10, marginBottom: 32 }}>
            {coreValues.map((cv: any) => {
              const color = CV_COLORS[cv.id] || '#6c63ff';
              return (
                <div key={cv.id} style={{ padding: 16, background: 'var(--bg-secondary)', border: `1px solid ${color}30`, borderRadius: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color }}>{cv.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{cv.essence}</div>
                  {cv.clinicContext && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{cv.clinicContext}</div>}
                </div>
              );
            })}
          </div>

          {/* 等級別ステージ */}
          {stages.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>等級別成長ステージ</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 32 }}>
                {stages.map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{s.stage}</div>
                      {i < stages.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>{s.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Win-Win & パワーパートナー */}
          {philo.win_win_vision && (
            <div style={{ padding: 18, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>✨ Win-Winビジョン</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{philo.win_win_vision}</div>
            </div>
          )}
          {philo.power_partner_definition && (
            <div style={{ padding: 18, background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ec4899', marginBottom: 8 }}>🤝 パワーパートナー</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{philo.power_partner_definition}</div>
            </div>
          )}

          {/* ティール組織ビジョン */}
          <div style={{ marginTop: 32, padding: 24, borderRadius: 16, border: '2px solid rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.04)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#06b6d4', marginBottom: 16 }}>🩵 目指す組織像：ティール組織</h2>

            {/* 同心円：ティール拡張 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ position: 'relative', width: 340, height: 340 }}>
                {/* 最外: ティール */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(6,182,212,0.06)', border: '3px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 14 }}>
                  <span style={{ fontSize: 11, color: '#06b6d4', fontWeight: 700 }}>🌍 社会貢献・次世代リーダー</span>
                </div>
                {/* 中間: シナジー */}
                <div style={{ position: 'absolute', top: 55, left: 55, right: 55, bottom: 55, borderRadius: '50%', background: 'rgba(59,130,246,0.06)', border: '3px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16 }}>
                  <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700 }}>👥 シナジー・パワーパートナー</span>
                </div>
                {/* 最内: 自己実現 */}
                <div style={{ position: 'absolute', top: 110, left: 110, right: 110, bottom: 110, borderRadius: '50%', background: 'rgba(139,92,246,0.08)', border: '3px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <span style={{ fontSize: 18 }}>✨</span>
                  <span style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 700 }}>自己実現</span>
                  <span style={{ fontSize: 10, color: '#a78bfa' }}>全員が主役</span>
                </div>
              </div>
            </div>

            {/* 3つの特徴 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { icon: '🌟', title: '全員主役', desc: '強みを活かし、クリニックという自己実現の舞台でそれぞれが主役として輝く' },
                { icon: '🤝', title: '共創・シナジー', desc: '競争ではなく共創。お互いの強みを引き出し合い、1+1が10になる組織を作る' },
                { icon: '🌍', title: '社会への貢献', desc: '縁ある人を豊かで幸せにすることで、クリニックを超えた社会問題を解決する次世代リーダーの集団に' },
              ].map(f => (
                <div key={f.title} style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 6 }}>{f.icon} {f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              ))}
            </div>

            {/* 院長メッセージ */}
            <div style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.8 }}>
                「各々が主体的に協力し合ってクリニックという<span style={{ color: '#06b6d4', fontWeight: 700 }}>組織づくり・作品作り</span>を楽しみながら、自己成長と社会貢献を続けることで縁ある人を豊かで幸せにできる豊かな人間になり、<span style={{ color: '#8b5cf6', fontWeight: 700 }}>自分自身の人生も幸せで豊かなものに</span>してほしい」
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>— 院長より</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
