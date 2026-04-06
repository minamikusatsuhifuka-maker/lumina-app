'use client';
import { useState, useEffect, useRef } from 'react';

const POSITIONS = ['看護師', 'マルチタスク医療事務'];

const NEEDS_LABELS: Record<string, string> = {
  survival: '🏠 生存',
  love_belonging: '❤️ 愛所属',
  power: '💪 力',
  freedom: '🦋 自由',
  fun: '🎯 楽しみ',
};

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  jitsukou: { label: '実行', color: '#3b82f6' },
  jisseki: { label: '実績', color: '#f59e0b' },
  jitsuryoku: { label: '実力', color: '#4ade80' },
  seijitsu: { label: '誠実', color: '#8b5cf6' },
};

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [inputText, setInputText] = useState('');
  const [position, setPosition] = useState(POSITIONS[0]);
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/clinic/applicants')
      .then(r => r.json())
      .then(d => setApplicants(Array.isArray(d) ? d : []));
  }, []);

  const analyze = async () => {
    if (!inputText.trim() && !fileRef.current?.files?.length) {
      setMessage('テキストまたはファイルを入力してください');
      return;
    }
    setAnalyzing(true);
    setMessage('AIが分析中...');
    try {
      const formData = new FormData();
      formData.append('text', inputText);
      formData.append('position', position);
      if (fileRef.current?.files?.[0]) {
        formData.append('file', fileRef.current.files[0]);
      }

      const res = await fetch('/api/clinic/applicants/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        setMessage('エラー: ' + data.error);
        return;
      }

      setSelected(data);
      setTab('list');
      setMessage('✅ 分析完了！');

      const updated = await fetch('/api/clinic/applicants').then(r => r.json());
      setApplicants(Array.isArray(updated) ? updated : []);

      setInputText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setMessage('エラーが発生しました');
    } finally {
      setAnalyzing(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, background: 'var(--bg-secondary)',
    border: '1px solid var(--border)', borderRadius: 16, marginBottom: 16,
  };

  const recommendColor = (r: string) =>
    r === '採用推奨' ? '#4ade80' : r === '不採用' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 80 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>👥 採用AI分析</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        履歴書・スカウター結果をアップロード→AIが自動分析・採点
      </p>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.includes('✅') ? 'rgba(74,222,128,0.1)' : message.includes('エラー') ? 'rgba(239,68,68,0.1)' : 'rgba(108,99,255,0.1)',
          color: message.includes('✅') ? '#4ade80' : message.includes('エラー') ? '#ef4444' : '#6c63ff',
        }}>{message}</div>
      )}

      {/* タブ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'list', label: `📋 候補者一覧（${applicants.length}件）` },
          { key: 'new', label: '➕ 新規分析' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            background: tab === t.key ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            border: tab === t.key ? 'none' : '1px solid var(--border)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* 新規分析タブ */}
      {tab === 'new' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📄 応募者情報を入力</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>応募職種</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {POSITIONS.map(p => (
                <button key={p} onClick={() => setPosition(p)} style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: '2px solid',
                  background: position === p ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)',
                  borderColor: position === p ? '#6c63ff' : 'var(--border)',
                  color: position === p ? '#6c63ff' : 'var(--text-muted)',
                }}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              ファイルアップロード（PDF・画像・スカウター結果）
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '2px dashed var(--border)', background: 'var(--input-bg)',
                color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              またはテキストで直接入力（履歴書・志望動機・スカウター結果など）
            </div>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="例：氏名：山田花子、年齢：28歳、経験：看護師5年（皮膚科2年）、志望動機：..."
              rows={8}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--input-border)', background: 'var(--input-bg)',
                color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={analyze}
            disabled={analyzing}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: analyzing ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontSize: 15, fontWeight: 700,
            }}
          >
            {analyzing ? '🤖 AIが分析中...' : '🤖 AIで分析・採点する'}
          </button>
        </div>
      )}

      {/* 候補者一覧 */}
      {tab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: 16 }}>
          <div>
            {applicants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                まだ候補者がいません。「新規分析」から追加してください。
              </div>
            ) : (
              applicants.map(a => (
                <div
                  key={a.id}
                  onClick={() => {
                    fetch(`/api/clinic/applicants/${a.id}`).then(r => r.json()).then(setSelected);
                  }}
                  style={{
                    ...cardStyle,
                    cursor: 'pointer',
                    border: selected?.id === a.id ? '2px solid #6c63ff' : '1px solid var(--border)',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {a.name || '名前未取得'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {a.position} • {new Date(a.created_at).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: 20, fontWeight: 800,
                        color: a.total_score >= 80 ? '#4ade80' : a.total_score >= 60 ? '#f59e0b' : '#ef4444',
                      }}>
                        {a.total_score}点
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 700, marginTop: 2,
                        color: recommendColor(a.recommendation),
                      }}>
                        {a.recommendation}
                      </div>
                    </div>
                  </div>
                  {a.dominant_needs && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {(Array.isArray(a.dominant_needs) ? a.dominant_needs : JSON.parse(a.dominant_needs || '[]'))
                        .map((n: string) => (
                          <span key={n} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(108,99,255,0.1)', color: '#6c63ff',
                          }}>
                            {NEEDS_LABELS[n] || n}
                          </span>
                        ))
                      }
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 詳細パネル */}
          {selected && (
            <div style={{ position: 'sticky', top: 20 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name || selected.extracted_data?.name}</div>
                  <button onClick={() => setSelected(null)} style={{
                    fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  }}>✕</button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                    📌 4つの「実」採点
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {Object.entries(SCORE_LABELS).map(([key, { label, color }]) => {
                      const s = selected.scores?.[key] || {};
                      return (
                        <div key={key} style={{
                          padding: 10, background: `${color}10`,
                          border: `1px solid ${color}30`, borderRadius: 10, textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color }}>{s.score ?? '-'}</div>
                          <div style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>/25点</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <span style={{
                      fontSize: 24, fontWeight: 800,
                      color: (selected.total_score || 0) >= 80 ? '#4ade80' : (selected.total_score || 0) >= 60 ? '#f59e0b' : '#ef4444',
                    }}>
                      総合 {selected.total_score || 0}点
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}> / 100点</span>
                  </div>
                </div>

                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                  background: `${recommendColor(selected.recommendation)}15`,
                  border: `1px solid ${recommendColor(selected.recommendation)}40`,
                  textAlign: 'center', fontSize: 15, fontWeight: 700,
                  color: recommendColor(selected.recommendation),
                }}>
                  {selected.recommendation}
                </div>

                {selected.ai_comment && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                      🤖 AI総合コメント
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      {selected.ai_comment}
                    </div>
                  </div>
                )}

                {selected.interview_points && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                      💬 面接で確認すべきポイント
                    </div>
                    {(Array.isArray(selected.interview_points)
                      ? selected.interview_points
                      : JSON.parse(selected.interview_points || '[]')
                    ).map((p: string, i: number) => (
                      <div key={i} style={{
                        padding: '6px 10px', marginBottom: 6,
                        background: 'rgba(108,99,255,0.06)',
                        border: '1px solid rgba(108,99,255,0.15)',
                        borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
                      }}>
                        {i + 1}. {p}
                      </div>
                    ))}
                  </div>
                )}

                {selected.personality_summary && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                      💡 性格・欲求バランス
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      {selected.personality_summary}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
