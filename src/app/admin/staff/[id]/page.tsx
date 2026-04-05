'use client';
import { useState, useEffect, use } from 'react';

type DetailTab = 'timeline' | 'documents' | 'notes' | 'grades';
type NoteType = 'interview' | 'training' | 'praise' | 'incident' | 'other';

const NOTE_ICONS: Record<string, string> = { interview: '💬', training: '📚', praise: '🌟', incident: '⚠️', other: '📝' };
const NOTE_LABELS: Record<string, string> = { interview: '面談', training: '研修', praise: '称賛', incident: 'インシデント', other: 'その他' };

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>('timeline');

  // メモ追加フォーム
  const [noteType, setNoteType] = useState<NoteType>('other');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 書類展開
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const fetchStaff = () => {
    fetch(`/api/clinic/staff/${id}`).then(r => r.json()).then(data => {
      if (data.id) setStaff(data);
      setLoading(false);
    });
  };

  useEffect(() => { fetchStaff(); }, [id]);

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/clinic/staff/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: noteType, title: noteTitle, content: noteContent, authorName: noteAuthor }),
      });
      if (res.ok) {
        setMessage('メモを保存しました');
        setNoteTitle(''); setNoteContent(''); setNoteAuthor('');
        fetchStaff();
      }
    } catch { setMessage('保存に失敗しました'); }
    finally { setNoteSaving(false); }
  };

  const calcYears = (d: string) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const y = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    const m = Math.floor((diff % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    return y > 0 ? `${y}年${m}ヶ月` : `${m}ヶ月`;
  };

  // タイムライン構築
  const buildTimeline = () => {
    if (!staff) return [];
    const events: { date: string; icon: string; label: string; detail: string }[] = [];
    if (staff.hired_at) events.push({ date: staff.hired_at, icon: '🏥', label: '入職', detail: `${staff.position || ''}として入職` });
    (staff.documents || []).forEach((d: any) => events.push({ date: d.uploaded_at, icon: '📎', label: `書類追加: ${d.title}`, detail: `タイプ: ${d.type}` }));
    (staff.notes || []).forEach((n: any) => events.push({ date: n.created_at, icon: NOTE_ICONS[n.type] || '📝', label: `${NOTE_LABELS[n.type] || 'メモ'}: ${n.title}`, detail: n.content?.slice(0, 100) }));
    (staff.gradeHistories || []).forEach((g: any) => events.push({ date: g.changed_at, icon: '🏅', label: `等級変��: ${g.from_grade || '—'} → ${g.to_grade}`, detail: g.reason || '' }));
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const cardStyle: React.CSSProperties = { padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!staff) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>スタッフが見つかりません</div>;

  const statusColor = staff.status === 'active' ? '#4ade80' : staff.status === 'retired' ? '#ef4444' : '#f5a623';
  const statusLabel = staff.status === 'active' ? '在職中' : staff.status === 'retired' ? '退職' : '休職中';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22, flexShrink: 0 }}>
          {staff.name?.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{staff.name}</span>
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>{statusLabel}</span>
          </div>
          {staff.name_kana && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{staff.name_kana}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {staff.position && <span>{staff.position}</span>}
            {staff.department && <span>/ {staff.department}</span>}
            {staff.hired_at && <span>/ 入職 {new Date(staff.hired_at).toLocaleDateString('ja-JP')}（{calcYears(staff.hired_at)}）</span>}
          </div>
        </div>
      </div>

      {message && (
        <div style={{ padding: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, fontSize: 13, color: '#4ade80', marginBottom: 12 }}>{message}</div>
      )}

      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([
          { key: 'timeline' as DetailTab, label: '📅 タイムライン' },
          { key: 'documents' as DetailTab, label: '📄 書類' },
          { key: 'notes' as DetailTab, label: '📝 メモ追加' },
          { key: 'grades' as DetailTab, label: '🏅 等級履歴' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === t.key ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-card)',
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${tab === t.key ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* タイムライン */}
      {tab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {buildTimeline().length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>イベントがありません</div>
          ) : buildTimeline().map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{ev.icon}</div>
                {i < buildTimeline().length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingTop: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(ev.date).toLocaleDateString('ja-JP')}</div>
                {ev.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{ev.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 書類 */}
      {tab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(staff.documents || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>書類がありません</div>
          ) : (staff.documents || []).map((doc: any) => (
            <div key={doc.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📄 {doc.title}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{doc.type}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(doc.uploaded_at).toLocaleDateString('ja-JP')}</span>
              </div>
              {expandedDocId === doc.id && doc.ai_analysis && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {typeof doc.ai_analysis === 'string' ? (() => { try { return JSON.stringify(JSON.parse(doc.ai_analysis), null, 2); } catch { return doc.ai_analysis; } })() : JSON.stringify(doc.ai_analysis, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ���モ追加 */}
      {tab === 'notes' && (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイプ</label>
            <select value={noteType} onChange={e => setNoteType(e.target.value as NoteType)} style={inputStyle}>
              <option value="interview">💬 面談</option><option value="training">📚 研修</option>
              <option value="praise">🌟 称賛</option><option value="incident">⚠️ インシデント</option>
              <option value="other">📝 その他</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル *</label>
            <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="メモのタイトル" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>内容 *</label>
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="メモの内容を��力" style={{ ...inputStyle, minHeight: 200, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>記録者</label>
            <input value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} placeholder="記録者名" style={inputStyle} />
          </div>
          <button onClick={saveNote} disabled={noteSaving || !noteTitle.trim() || !noteContent.trim()} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: noteSaving ? 'not-allowed' : 'pointer',
            background: noteSaving || !noteTitle.trim() || !noteContent.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 14, alignSelf: 'flex-start',
          }}>
            {noteSaving ? '保存中...' : '保存'}
          </button>

          {/* 既存メモ一覧 */}
          {(staff.notes || []).length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>記録済みメモ</div>
              {(staff.notes || []).map((n: any) => (
                <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{NOTE_ICONS[n.type] || '📝'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{new Date(n.created_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{n.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 等級履歴 */}
      {tab === 'grades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(staff.gradeHistories || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級変更履歴がありません</div>
          ) : (staff.gradeHistories || []).map((g: any) => (
            <div key={g.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🏅</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {g.from_grade || '—'} → {g.to_grade}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(g.changed_at).toLocaleDateString('ja-JP')}
                    {g.changed_by && ` / ${g.changed_by}`}
                  </div>
                </div>
              </div>
              {g.reason && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{g.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
