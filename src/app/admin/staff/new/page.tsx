'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HiringScoreChart } from '@/components/clinic/HiringScoreChart';

type Tab = 'basic' | 'resume' | 'aptitude' | 'hiring';

export default function NewStaffPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('basic');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 基本情報
  const [name, setName] = useState('');
  const [nameKana, setNameKana] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [hiredAt, setHiredAt] = useState('');

  // 履歴書
  const [resumeAnalysis, setResumeAnalysis] = useState<any>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeLoading, setResumeLoading] = useState(false);
  const resumeRef = useRef<HTMLInputElement>(null);

  // 適性試験
  const [aptitudeAnalysis, setAptitudeAnalysis] = useState<any>(null);
  const [aptitudeText, setAptitudeText] = useState('');
  const [aptitudeLoading, setAptitudeLoading] = useState(false);
  const aptitudeRef = useRef<HTMLInputElement>(null);

  // 採用所見
  const [hiringComment, setHiringComment] = useState<any>(null);
  const [hiringLoading, setHiringLoading] = useState(false);

  // スコアリング
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  const handleResumeUpload = async (file: File) => {
    setResumeLoading(true);
    setMessage('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/clinic/resume-analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.analysis) {
        setResumeAnalysis(data.analysis);
        setResumeText(data.rawText);
      } else {
        setMessage(data.error || '解析に失敗しました');
      }
    } catch { setMessage('解析に失敗しました'); }
    finally { setResumeLoading(false); }
  };

  const handleAptitudeUpload = async (file: File) => {
    setAptitudeLoading(true);
    setMessage('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/clinic/aptitude-analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.analysis) {
        setAptitudeAnalysis(data.analysis);
        setAptitudeText(data.rawText);
      } else {
        setMessage(data.error || '解析に失敗しました');
      }
    } catch { setMessage('解析に失敗しました'); }
    finally { setAptitudeLoading(false); }
  };

  const autoFillFromResume = () => {
    if (!resumeAnalysis) return;
    if (resumeAnalysis.name && !name) setName(resumeAnalysis.name);
    if (resumeAnalysis.nameKana && !nameKana) setNameKana(resumeAnalysis.nameKana);
    setMessage('履歴書から自動入力しました');
  };

  const generateHiringComment = async () => {
    setHiringLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/hiring-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeAnalysis: resumeAnalysis ? JSON.stringify(resumeAnalysis) : '',
          aptitudeAnalysis: aptitudeAnalysis ? JSON.stringify(aptitudeAnalysis) : '',
        }),
      });
      const data = await res.json();
      if (data.recommendation) setHiringComment(data);
      else setMessage(data.error || '所見生成に失敗しました');
    } catch { setMessage('所見生成に失敗しました'); }
    finally { setHiringLoading(false); }
  };

  const generateScore = async () => {
    setScoreLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/clinic/hiring-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeAnalysis ? JSON.stringify(resumeAnalysis) : resumeText,
          aptitudeText: aptitudeAnalysis ? JSON.stringify(aptitudeAnalysis) : aptitudeText,
          memoText: '',
        }),
      });
      const data = await res.json();
      if (data.scores) setScoreResult(data);
      else setMessage(data.error || 'スコアリングに失敗しました');
    } catch { setMessage('スコアリングに失敗しました'); }
    finally { setScoreLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) { setMessage('名前は必須です'); return; }
    setSaving(true);
    setMessage('');
    try {
      const documents: any[] = [];
      if (resumeAnalysis) documents.push({ type: 'resume', title: '履歴書', extractedText: resumeText, aiAnalysis: resumeAnalysis });
      if (aptitudeAnalysis) documents.push({ type: 'aptitude_test', title: '適性試験結果', extractedText: aptitudeText, aiAnalysis: aptitudeAnalysis });

      const res = await fetch('/api/clinic/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nameKana, email, phone, position, department, hiredAt: hiredAt || null, documents }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/admin/staff/${data.id}`);
      } else {
        setMessage(data.error || '登録に失敗しました');
      }
    } catch { setMessage('登録に失敗しました'); }
    finally { setSaving(false); }
  };

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basic', label: '① 基本情報' },
    { key: 'resume', label: '② 履歴書' },
    { key: 'aptitude', label: '③ 適性試験' },
    { key: 'hiring', label: '④ AI採用所見' },
  ];

  const recBadgeColor = (rec: string) => {
    if (rec?.includes('推奨')) return { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', border: 'rgba(74,222,128,0.3)' };
    if (rec?.includes('条��')) return { bg: 'rgba(245,166,35,0.15)', color: '#f5a623', border: 'rgba(245,166,35,0.3)' };
    return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' };
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>＋ 新規スタッフ登録</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>基本情報の入力と、履歴書・適性試験のAI解析ができます</p>

      {message && (
        <div style={{ padding: 12, background: message.includes('失敗') || message.includes('必須') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', border: `1px solid ${message.includes('失敗') || message.includes('��須') ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`, borderRadius: 10, fontSize: 13, color: message.includes('失敗') || message.includes('必須') ? '#ef4444' : '#4ade80', marginBottom: 16 }}>
          {message}
        </div>
      )}

      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === t.key ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-card)',
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${tab === t.key ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* タブ①: 基本情報 */}
      {tab === 'basic' && (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label style={labelStyle}>名前 *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="山田 花子" style={inputStyle} /></div>
            <div><label style={labelStyle}>フリガナ</label><input value={nameKana} onChange={e => setNameKana(e.target.value)} placeholder="ヤマ�� ハナコ" style={inputStyle} /></div>
            <div><label style={labelStyle}>メール</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="hanako@example.com" style={inputStyle} /></div>
            <div><label style={labelStyle}>電話</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-1234-5678" style={inputStyle} /></div>
            <div><label style={labelStyle}>職種</label>
              <select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}>
                <option value="">選択してください</option>
                <option value="看護師">看護師</option><option value="受付">受付</option>
                <option value="歯科助手">歯科助手</option><option value="医療事務">医療事務</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div><label style={labelStyle}>部署</label><input value={department} onChange={e => setDepartment(e.target.value)} placeholder="外来" style={inputStyle} /></div>
            <div><label style={labelStyle}>入職日</label><input value={hiredAt} onChange={e => setHiredAt(e.target.value)} type="date" style={inputStyle} /></div>
          </div>
        </div>
      )}

      {/* タブ②: 履歴書 */}
      {tab === 'resume' && (
        <div style={{ ...cardStyle }}>
          <div onClick={() => resumeRef.current?.click()} style={{
            padding: 40, border: '2px dashed var(--border)', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{resumeLoading ? '解析中...' : 'クリックして履歴書PDF をアップロード'}</div>
          </div>
          <input ref={resumeRef} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); }} />

          {resumeAnalysis && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={autoFillFromResume} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  📋 基本情報に自動入力
                </button>
              </div>
              {resumeAnalysis.overallComment && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>💬 総合所見</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{resumeAnalysis.overallComment}</div>
                </div>
              )}
              {resumeAnalysis.strengths?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>💪 強み</div>
                  {resumeAnalysis.strengths.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</div>)}
                </div>
              )}
              {resumeAnalysis.concerns?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>⚠️ 確認ポイント</div>
                  {resumeAnalysis.concerns.map((c: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {c}</div>)}
                </div>
              )}
              {resumeAnalysis.workHistory?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📋 経歴サマリー</div>
                  {resumeAnalysis.workHistory.map((w: any, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {w.period} {w.company}（{w.role}）</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* タブ③: 適性試験 */}
      {tab === 'aptitude' && (
        <div style={{ ...cardStyle }}>
          <div onClick={() => aptitudeRef.current?.click()} style={{
            padding: 40, border: '2px dashed var(--border)', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{aptitudeLoading ? '解析中...' : 'クリックして適性試験PDFをアップロード'}</div>
          </div>
          <input ref={aptitudeRef} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleAptitudeUpload(f); }} />

          {aptitudeAnalysis && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {aptitudeAnalysis.scores?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>📊 スコア一覧{aptitudeAnalysis.testType ? `（${aptitudeAnalysis.testType}）` : ''}</div>
                  {aptitudeAnalysis.scores.map((s: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <span>{s.category}</span><span style={{ fontWeight: 600 }}>{s.score}</span>
                    </div>
                  ))}
                </div>
              )}
              {aptitudeAnalysis.strengths?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🌟 強みの領域</div>
                  {aptitudeAnalysis.strengths.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</div>)}
                </div>
              )}
              {aptitudeAnalysis.suitableRoles?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🎯 向いている役割</div>
                  {aptitudeAnalysis.suitableRoles.map((r: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {r}</div>)}
                </div>
              )}
              {aptitudeAnalysis.developmentPoints?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📈 育成ポイント</div>
                  {aptitudeAnalysis.developmentPoints.map((d: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {d}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* タブ④: AI採用所見 */}
      {tab === 'hiring' && (
        <div style={{ ...cardStyle }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={generateHiringComment} disabled={hiringLoading} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', cursor: hiringLoading ? 'not-allowed' : 'pointer',
              background: hiringLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
              {hiringLoading ? '生成中...' : '🤖 採用総合所見を生成'}
            </button>
            <button onClick={generateScore} disabled={scoreLoading} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', cursor: scoreLoading ? 'not-allowed' : 'pointer',
              background: scoreLoading ? 'rgba(236,72,153,0.3)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
              {scoreLoading ? 'AIが理念との適合度を分析中...' : '📊 AIスコアリングを実行'}
            </button>
          </div>
          {!resumeAnalysis && !aptitudeAnalysis && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>※ 履歴書・適性試験を先にアップロードすると、より精度の高い所見が生成されます</p>
          )}

          {/* スコアリング結果 */}
          {scoreResult && (
            <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📊 AIスコアリング結果</h3>
              <HiringScoreChart scores={scoreResult.scores} totalScore={scoreResult.totalScore} rank={scoreResult.rank} rankLabel={scoreResult.rankLabel} />
              {scoreResult.strengths?.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, marginBottom: 6 }}>💪 強み</div>
                  {scoreResult.strengths.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</div>)}
                </div>
              )}
              {scoreResult.risks?.length > 0 && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>⚠️ リスク</div>
                  {scoreResult.risks.map((r: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {r}</div>)}
                </div>
              )}
              {scoreResult.onboardingAdvice && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 6 }}>📈 育成方針</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{scoreResult.onboardingAdvice}</div>
                </div>
              )}
            </div>
          )}

          {hiringComment && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {hiringComment.recommendation && (() => {
                const c = recBadgeColor(hiringComment.recommendation);
                return (
                  <div style={{ padding: '10px 16px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, fontSize: 16, fontWeight: 700, color: c.color }}>
                    {hiringComment.recommendation}
                  </div>
                );
              })()}
              {hiringComment.overallComment && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>💬 総合採用所見</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{hiringComment.overallComment}</div>
                </div>
              )}
              {hiringComment.expectedRole && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🎯 期待される役割</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{hiringComment.expectedRole}</div>
                </div>
              )}
              {hiringComment.developmentPlan && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📈 育成方針</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{hiringComment.developmentPlan}</div>
                </div>
              )}
              {hiringComment.onboardingPoints?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>📌 入職時の重点ポイント</div>
                  {hiringComment.onboardingPoints.map((p: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {p}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 登録ボタン */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button onClick={handleRegister} disabled={saving || !name.trim()} style={{
          padding: '12px 32px', borderRadius: 10, border: 'none', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
          background: saving || !name.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 15,
        }}>
          {saving ? '登録中...' : '登録する'}
        </button>
        <button onClick={() => router.push('/admin/staff')} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
