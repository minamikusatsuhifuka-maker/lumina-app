'use client';
import { useState, useEffect } from 'react';

const CIRCLE_META = [
  { layer_id: 5, r: 143, color: '#534AB7', fill: '#EEEDFE' },
  { layer_id: 4, r: 114, color: '#185FA5', fill: '#E6F1FB' },
  { layer_id: 3, r: 88,  color: '#1D9E75', fill: '#E1F5EE' },
  { layer_id: 2, r: 64,  color: '#3B6D11', fill: '#EAF3DE' },
  { layer_id: 1, r: 42,  color: '#993556', fill: '#FBEAF0' },
  { layer_id: 0, r: 22,  color: '#6c63ff', fill: '#6c63ff' },
];

const TEXT_COLORS: Record<number, string> = {
  5: '#3C3489', 4: '#0C447C', 3: '#085041', 2: '#27500A', 1: '#72243E', 0: '#ffffff',
};

export default function StaffCirclePage() {
  const [layers, setLayers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clinic/concentric-circles')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setLayers(d); setLoading(false); });
  }, []);

  const selectLayer = (id: number) => {
    const layer = layers.find(l => l.layer_id === id);
    if (layer) setSelected(selected?.layer_id === id ? null : layer);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🔵 成長の地図</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.7 }}>
        インサイドアウト同心円モデル。自分の内側から外側へ、成長と貢献が広がっていく。
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* 同心円 */}
        <div style={{ flexShrink: 0 }}>
          <svg width="280" height="280" viewBox="0 0 280 280">
            {CIRCLE_META.map(({ layer_id, r, color, fill }) => (
              <circle key={layer_id} cx="140" cy="140" r={r}
                fill={selected?.layer_id === layer_id ? color + '50' : fill}
                stroke={color}
                strokeWidth={selected?.layer_id === layer_id ? 3 : 1.5}
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => selectLayer(layer_id)}
              />
            ))}
            {layers.map(l => {
              const meta = CIRCLE_META.find(m => m.layer_id === l.layer_id);
              if (!meta) return null;
              const labelY = 140 - meta.r + (meta.r === 22 ? 14 : meta.r === 42 ? 24 : meta.r === 64 ? 20 : meta.r === 88 ? 20 : meta.r === 114 ? 22 : 22);
              return (
                <text key={l.layer_id} x="140" y={labelY} textAnchor="middle"
                  fontSize={l.layer_id === 2 ? 8 : 9} fontWeight="500"
                  fill={TEXT_COLORS[l.layer_id]} fontFamily="system-ui"
                  style={{ pointerEvents: 'none' }}>
                  {l.label?.split(' — ')[0]}
                </text>
              );
            })}
            {layers.length === 0 && (
              <>
                {[{t:'社会・世界',y:8},{t:'クリニック・地域',y:36},{t:'チーム',y:62},{t:'仲間・同僚・患者さん',y:86},{t:'家族',y:108},{t:'自分',y:137}].map(({t,y}) => (
                  <text key={t} x="140" y={y} textAnchor="middle" fontSize={t.length > 6 ? 8 : 9} fontWeight="500" fill="#888" fontFamily="system-ui" style={{ pointerEvents: 'none' }}>{t}</text>
                ))}
              </>
            )}
          </svg>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            各層をタップして詳細を見る
          </div>
        </div>

        {/* 詳細パネル or 説明 */}
        <div style={{ flex: 1, minWidth: 240 }}>
          {!selected ? (
            <div style={{ padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                インサイドアウトとは？
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
                自分の内側が満ちることで、外側の人々に与えられるようになる。<br /><br />
                自己成長と貢献の2つの軸が重なるとき、人生は深く豊かになる。<br /><br />
                円をタップして、各層のミッションと問いかけを確認してみてください。
              </div>

              {/* 凡例 */}
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...layers].reverse().map(l => {
                  const meta = CIRCLE_META.find(m => m.layer_id === l.layer_id);
                  return (
                    <div key={l.layer_id} onClick={() => selectLayer(l.layer_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: meta?.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{l.label?.split(' — ')[0]}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{l.grade}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px', background: 'var(--bg-secondary)', border: `2px solid ${selected.color}40`, borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: selected.color }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.label?.split(' — ')[0]}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 10, background: selected.color + '20', color: selected.color, fontWeight: 600 }}>{selected.grade}</span>
              </div>

              {selected.description && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 14 }}>
                  {selected.description}
                </div>
              )}

              {selected.mission && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ミッション</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, padding: '10px 12px', background: selected.color + '10', borderRadius: 8, borderLeft: `3px solid ${selected.color}` }}>
                    {selected.mission}
                  </div>
                </div>
              )}

              {selected.question && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>今日の問いかけ</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', fontStyle: 'italic' }}>
                    「{selected.question}」
                  </div>
                </div>
              )}

              {selected.keywords && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(Array.isArray(selected.keywords) ? selected.keywords : JSON.parse(selected.keywords || '[]')).map((k: string) => (
                    <span key={k} style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, background: selected.color + '15', color: selected.color, border: `0.5px solid ${selected.color}40` }}>{k}</span>
                  ))}
                </div>
              )}

              <button onClick={() => setSelected(null)} style={{ marginTop: 14, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 下部：2軸メッセージ */}
      <div style={{ marginTop: 40, padding: '20px 24px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, textAlign: 'center' }}>
          人生を豊かにする2つの軸
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 4 }}>自己成長</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>知識・スキル・マインドを磨き続けること</div>
          </div>
          <div style={{ fontSize: 22, color: '#6c63ff', fontWeight: 300 }}>+</div>
          <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75', marginBottom: 4 }}>貢献・与える</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>誰かの役に立ち、外側へ影響を届けること</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          この2つが重なるとき、人生は深く豊かで幸せになる。
        </div>
      </div>
    </div>
  );
}
