'use client';
import { useState, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts';

const POSITIONS = ['看護師', 'マルチタスク医療事務'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  screening: { label: '📋 書類選考中', color: '#6c63ff' },
  interview: { label: '💬 面接調整中', color: '#f59e0b' },
  final:     { label: '🎯 最終選考',   color: '#06b6d4' },
  hired:     { label: '✅ 採用',        color: '#4ade80' },
  rejected:  { label: '❌ 不採用',      color: '#ef4444' },
};

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
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailTab, setDetailTab] = useState<'analysis' | 'interview'>('analysis');
  const [interviewNotes, setInterviewNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newInterviewer, setNewInterviewer] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [aiCommenting, setAiCommenting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clinic/applicants')
      .then(r => r.json())
      .then(d => setApplicants(Array.isArray(d) ? d : []));
  }, []);

  const fetchNotes = (applicantId: string) => {
    fetch(`/api/clinic/applicants/interview-notes?applicantId=${applicantId}`)
      .then(r => r.json())
      .then(d => setInterviewNotes(Array.isArray(d) ? d : []));
  };

  const saveNote = async () => {
    if (!newNote.trim() || !selected) return;
    setNoteSaving(true);
    await fetch('/api/clinic/applicants/interview-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId: selected.id, interviewDate: newDate, interviewer: newInterviewer, note: newNote }),
    });
    setNewNote(''); setNewDate(''); setNewInterviewer('');
    fetchNotes(selected.id);
    setNoteSaving(false);
  };

  const deleteNote = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch('/api/clinic/applicants/interview-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchNotes(selected.id);
  };

  const generateAiComment = async (note: any) => {
    setAiCommenting(note.id);
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `以下の面接メモを読んで、候補者への評価コメントを3〜5文で書いてください。\n\n面接メモ：${note.note}`,
          }],
        }),
      }).then(r => r.json());
      const comment = res?.content?.[0]?.text || '';
      await fetch('/api/clinic/applicants/interview-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, aiComment: comment }),
      });
      fetchNotes(selected.id);
    } catch { /* ignore */ }
    setAiCommenting(null);
  };

  const processFile = async (file: File) => {
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      setMessage('❌ PDF・JPG・PNG・WEBPのみ対応しています');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('❌ ファイルサイズは5MB以下にしてください');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setFileName(file.name);
    setExtracting(true);
    setMessage('📄 ファイルを読み取り中...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/clinic/applicants/extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.text) {
        setInputText(data.text);
        setMessage('✅ ファイルの読み取り完了！内容を確認して「AIで分析・採点する」を押してください。');
        setTimeout(() => setMessage(''), 5000);
      } else {
        setMessage('❌ ' + (data.error || 'ファイルの読み取りに失敗しました'));
      }
    } catch {
      setMessage('❌ エラーが発生しました');
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const analyze = async () => {
    if (!inputText.trim()) {
      setMessage('テキストまたはファイルを入力してください');
      return;
    }
    setAnalyzing(true);
    setMessage('AIが分析中...');
    try {
      const res = await fetch('/api/clinic/applicants/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, position }),
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
      setFileName('');
    } catch {
      setMessage('エラーが発生しました');
    } finally {
      setAnalyzing(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const STATUSES = [
    { key: 'all',       label: '全て',       color: '#6c63ff' },
    { key: 'screening', label: '📋 書類選考', color: '#6c63ff' },
    { key: 'interview', label: '💬 面接',     color: '#f59e0b' },
    { key: 'final',     label: '🎯 最終選考', color: '#06b6d4' },
    { key: 'hired',     label: '✅ 採用',     color: '#4ade80' },
    { key: 'rejected',  label: '❌ 不採用',   color: '#ef4444' },
  ];

  const filteredApplicants = statusFilter === 'all'
    ? applicants
    : applicants.filter(a => a.status === statusFilter);

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

          {/* ファイルアップロード */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              📄 ファイルをアップロード
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              PDF・JPG・PNG対応（5MB以下）• 履歴書・職務経歴書・スカウター結果
            </div>
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                padding: '28px 16px',
                border: `2px dashed ${
                  isDragging ? '#6c63ff' :
                  extracting ? '#6c63ff' :
                  fileName ? '#4ade80' :
                  'var(--border)'
                }`,
                borderRadius: 14, cursor: extracting ? 'wait' : 'pointer',
                background: isDragging ? 'rgba(108,99,255,0.08)' :
                            extracting ? 'rgba(108,99,255,0.04)' :
                            fileName ? 'rgba(74,222,128,0.04)' :
                            'var(--input-bg)',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                disabled={extracting}
                style={{ display: 'none' }}
              />
              {extracting ? (
                <>
                  <div style={{ fontSize: 32 }}>⏳</div>
                  <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 700 }}>読み取り中...</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AIがファイルを解析しています</div>
                </>
              ) : isDragging ? (
                <>
                  <div style={{ fontSize: 32 }}>📂</div>
                  <div style={{ fontSize: 14, color: '#6c63ff', fontWeight: 700 }}>ここにドロップ！</div>
                </>
              ) : fileName ? (
                <>
                  <div style={{ fontSize: 32 }}>✅</div>
                  <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 700 }}>{fileName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>クリックまたはドラッグ&ドロップで別のファイルを選択</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36 }}>📄</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>クリックまたはドラッグ&ドロップ</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PDF・JPG・PNG（5MB以下）</div>
                </>
              )}
            </label>
          </div>

          {/* 区切り線 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            color: 'var(--text-muted)', fontSize: 12,
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            または直接テキストを入力
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* テキスト入力 */}
          <div style={{ marginBottom: 16 }}>
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

      {/* ステータスフィルタータブ */}
      {tab === 'list' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {STATUSES.map(s => {
            const count = s.key === 'all' ? applicants.length : applicants.filter(a => a.status === s.key).length;
            return (
              <button key={s.key} onClick={() => setStatusFilter(s.key)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '2px solid',
                background: statusFilter === s.key ? `${s.color}15` : 'var(--bg-card)',
                borderColor: statusFilter === s.key ? s.color : 'var(--border)',
                color: statusFilter === s.key ? s.color : 'var(--text-muted)',
              }}>{s.label} ({count})</button>
            );
          })}
        </div>
      )}

      {/* 候補者一覧 */}
      {tab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: 16 }}>
          <div>
            {filteredApplicants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {applicants.length === 0 ? 'まだ候補者がいません。「新規分析」から追加してください。' : 'このステータスの候補者はいません。'}
              </div>
            ) : (
              filteredApplicants.map(a => (
                <div
                  key={a.id}
                  onClick={() => {
                    fetch(`/api/clinic/applicants/${a.id}`).then(r => r.json()).then(setSelected);
                  }}
                  style={{
                    ...cardStyle,
                    cursor: 'pointer',
                    border: selected?.id === a.id ? '2px solid #6c63ff'
                      : a.status === 'hired' ? '1px solid rgba(74,222,128,0.4)'
                      : a.status === 'rejected' ? '1px solid rgba(239,68,68,0.2)'
                      : '1px solid var(--border)',
                    opacity: a.status === 'rejected' ? 0.6 : 1,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {a.name || '名前未取得'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {a.position} • {new Date(a.created_at).toLocaleDateString('ja-JP')}
                        {a.status && STATUS_LABELS[a.status] && (
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10,
                            background: `${STATUS_LABELS[a.status].color}15`,
                            color: STATUS_LABELS[a.status].color,
                            border: `1px solid ${STATUS_LABELS[a.status].color}30`,
                            marginLeft: 4,
                          }}>
                            {STATUS_LABELS[a.status].label}
                          </span>
                        )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name || selected.extracted_data?.name}</div>
                  <button onClick={() => setSelected(null)} style={{
                    fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  }}>✕</button>
                </div>

                {/* 詳細タブ切替 */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[{ key: 'analysis', label: '📊 AI分析' }, { key: 'interview', label: '💬 面接メモ' }].map(t => (
                    <button key={t.key}
                      onClick={() => { setDetailTab(t.key as any); if (t.key === 'interview') fetchNotes(selected.id); }}
                      style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: detailTab === t.key ? 'rgba(108,99,255,0.15)' : 'transparent', color: detailTab === t.key ? '#6c63ff' : 'var(--text-muted)', borderColor: detailTab === t.key ? 'rgba(108,99,255,0.4)' : 'var(--border)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* 面接メモタブ */}
                {detailTab === 'interview' && (
                  <div>
                    <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>📝 面接メモを追加</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                        <input placeholder="面接者名" value={newInterviewer} onChange={e => setNewInterviewer(e.target.value)}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                      </div>
                      <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={4} placeholder="面接内容・印象・気になった点など..."
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                      <button onClick={saveNote} disabled={noteSaving || !newNote.trim()}
                        style={{ marginTop: 8, padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: noteSaving ? 0.7 : 1 }}>
                        {noteSaving ? '保存中...' : '💾 保存'}
                      </button>
                    </div>
                    {interviewNotes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>まだ面接メモがありません</div>
                    ) : interviewNotes.map(note => (
                      <div key={note.id} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {note.interview_date ? `📅 ${new Date(note.interview_date).toLocaleDateString('ja-JP')}` : '日付未設定'}
                            {note.interviewer && ` ／ 👤 ${note.interviewer}`}
                          </div>
                          <button onClick={() => deleteNote(note.id)} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, padding: '2px 6px', cursor: 'pointer' }}>🗑</button>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{note.note}</div>
                        {note.ai_comment ? (
                          <div style={{ padding: '8px 10px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 4 }}>🤖 AIコメント</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{note.ai_comment}</div>
                          </div>
                        ) : (
                          <button onClick={() => generateAiComment(note)} disabled={aiCommenting === note.id}
                            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.06)', color: '#6c63ff', cursor: 'pointer', opacity: aiCommenting === note.id ? 0.7 : 1 }}>
                            {aiCommenting === note.id ? '生成中...' : '🤖 AIコメントを生成'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* AI分析タブ */}
                {detailTab === 'analysis' && <div>

                {/* レーダーチャート + 横棒グラフ */}
                {selected?.scores && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                      📌 4つの「実」採点
                    </div>
                    <div style={{ width: '100%', minHeight: 220 }}>
                      <RadarChart width={340} height={220} data={[
                        { subject: '実行', score: selected.scores.jitsukou?.score || 0, fullMark: 25 },
                        { subject: '実績', score: selected.scores.jisseki?.score || 0, fullMark: 25 },
                        { subject: '実力', score: selected.scores.jitsuryoku?.score || 0, fullMark: 25 },
                        { subject: '誠実', score: selected.scores.seijitsu?.score || 0, fullMark: 25 },
                      ]}>
                        <PolarGrid stroke="rgba(108,99,255,0.2)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 700 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 25]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                        <Radar name="スコア" dataKey="score" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.25} strokeWidth={2} />
                        <Tooltip formatter={(value: any) => [`${value}点`, 'スコア']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      </RadarChart>
                    </div>
                    <div style={{ width: '100%', minHeight: 120, marginTop: 8 }}>
                      <BarChart width={340} height={120} data={[
                        { name: '実行', score: selected.scores.jitsukou?.score || 0 },
                        { name: '実績', score: selected.scores.jisseki?.score || 0 },
                        { name: '実力', score: selected.scores.jitsuryoku?.score || 0 },
                        { name: '誠実', score: selected.scores.seijitsu?.score || 0 },
                      ]} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,99,255,0.1)" />
                        <XAxis type="number" domain={[0, 25]} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} width={30} />
                        <Tooltip formatter={(v: any) => [`${v}点 / 25点`]} />
                        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                          {['#3b82f6', '#f59e0b', '#4ade80', '#8b5cf6'].map((color, i) => (
                            <Cell key={i} fill={color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {Object.entries(SCORE_LABELS).map(([key, { label, color }]) => {
                        const s = selected.scores?.[key];
                        if (!s?.reason) return null;
                        return (
                          <div key={key} style={{
                            padding: '6px 10px', marginBottom: 6,
                            background: `${color}08`, border: `1px solid ${color}20`,
                            borderLeft: `3px solid ${color}`, borderRadius: 6,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}（{s.score}点）</span>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.reason}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                      <span style={{
                        fontSize: 28, fontWeight: 800,
                        color: (selected.total_score || 0) >= 80 ? '#4ade80' : (selected.total_score || 0) >= 60 ? '#f59e0b' : '#ef4444',
                      }}>
                        総合 {selected.total_score || 0}点
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}> / 100点</span>
                    </div>
                  </div>
                )}

                {/* ステータス管理 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                    📋 選考ステータス
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(STATUS_LABELS).map(([key, s]) => (
                      <button
                        key={key}
                        onClick={async () => {
                          await fetch('/api/clinic/applicants', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: selected.id, status: key }),
                          });
                          setSelected((prev: any) => ({ ...prev, status: key }));
                          setApplicants(prev => prev.map(a =>
                            a.id === selected.id ? { ...a, status: key } : a
                          ));
                        }}
                        style={{
                          padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', border: '2px solid',
                          background: selected.status === key ? `${s.color}20` : 'var(--bg-card)',
                          borderColor: selected.status === key ? s.color : 'var(--border)',
                          color: selected.status === key ? s.color : 'var(--text-muted)',
                        }}
                      >{s.label}</button>
                    ))}
                  </div>
                </div>

                {/* AI判定 + 削除 */}
                <div style={{
                  padding: '8px 14px', borderRadius: 10, marginBottom: 16,
                  background: `${recommendColor(selected.recommendation)}15`,
                  border: `1px solid ${recommendColor(selected.recommendation)}40`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: recommendColor(selected.recommendation) }}>
                    🤖 AI判定：{selected.recommendation}
                  </span>
                  <button
                    onClick={async () => {
                      if (!confirm('この候補者を削除しますか？')) return;
                      await fetch(`/api/clinic/applicants?id=${selected.id}`, { method: 'DELETE' });
                      setSelected(null);
                      const updated = await fetch('/api/clinic/applicants').then(r => r.json());
                      setApplicants(Array.isArray(updated) ? updated : []);
                    }}
                    style={{
                      fontSize: 11, color: '#ef4444', background: 'none',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                    }}
                  >🗑 削除</button>
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
                </div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
