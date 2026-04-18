'use client';
import { useState, useEffect } from 'react';

const DEPARTMENTS = [
  { id: 'all',       label: '全て',              color: '#374151', icon: '📋' },
  { id: 'reception', label: '受付・クラーク',     color: '#3b82f6', icon: '🏥' },
  { id: 'counselor', label: 'カウンセラー',       color: '#8b5cf6', icon: '💬' },
  { id: 'nurse',     label: '看護師',             color: '#10b981', icon: '💉' },
  { id: 'cosmetic',  label: '美容診療',           color: '#f59e0b', icon: '✨' },
  { id: 'insurance', label: '保険診療',           color: '#ef4444', icon: '📋' },
  { id: 'multitask', label: 'マルチタスク医療事務', color: '#6366f1', icon: '🗂' },
  { id: 'other',     label: 'その他',             color: '#9ca3af', icon: '📝' },
];

export default function NearMissPage() {
  const [reports, setReports]               = useState<any[]>([]);
  const [selectedDept, setSelectedDept]     = useState('all');
  const [showForm, setShowForm]             = useState(false);
  const [expandedId, setExpandedId]         = useState<number | null>(null);
  const [adminCommentId, setAdminCommentId] = useState<number | null>(null);
  const [adminCommentText, setAdminCommentText] = useState('');

  // フォームstate
  const [form, setForm] = useState({
    reporter_name: '', department: 'reception', occurred_at: '', location: '',
    incident: '', direct_cause: '', background_cause: '',
    prevention_personal: '', prevention_team: '', reflection: '', comment: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  useEffect(() => { fetchReports(); }, [selectedDept]);

  const fetchReports = async () => {
    const res = await fetch(`/api/clinic/near-miss?department=${selectedDept}`);
    const data = await res.json();
    setReports(data.reports ?? []);
  };

  const handleSubmit = async () => {
    if (!form.reporter_name || !form.incident || !form.occurred_at) {
      alert('報告者・発生日時・出来事は必須です');
      return;
    }
    setSubmitting(true);
    await fetch('/api/clinic/near-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSubmitted(true);
    setSubmitting(false);
    setShowForm(false);
    setForm({
      reporter_name: '', department: 'reception', occurred_at: '', location: '',
      incident: '', direct_cause: '', background_cause: '',
      prevention_personal: '', prevention_team: '', reflection: '', comment: '',
    });
    fetchReports();
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleMarkRead = async (id: number) => {
    await fetch('/api/clinic/near-miss', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: true }),
    });
    fetchReports();
  };

  const handleSaveAdminComment = async (id: number) => {
    await fetch('/api/clinic/near-miss', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, admin_comment: adminCommentText }),
    });
    setAdminCommentId(null);
    setAdminCommentText('');
    fetchReports();
  };

  const unreadReports = reports.filter(r => !r.is_read);
  const deptInfo = (id: string) => DEPARTMENTS.find(d => d.id === id) ?? DEPARTMENTS[DEPARTMENTS.length - 1];

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold' }}>⚠️ ヒヤリハット報告</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            気づいたことを気軽に報告してください。報告がチームを守ります。
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '10px 20px', background: '#ef4444', color: '#fff',
            borderRadius: '12px', border: 'none', fontWeight: 'bold',
            fontSize: '14px', cursor: 'pointer',
          }}
        >
          ＋ 新規報告する
        </button>
      </div>

      {/* 提出完了メッセージ */}
      {submitted && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', borderRadius: '10px', color: '#16a34a', fontWeight: 'bold', marginBottom: '16px' }}>
          ✓ 報告を送信しました。ありがとうございます。
        </div>
      )}

      {/* 未読アラート */}
      {unreadReports.length > 0 && (
        <div style={{ padding: '14px 16px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '12px', marginBottom: '20px' }}>
          <p style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '14px', marginBottom: '8px' }}>
            🔴 未読のヒヤリハット報告 {unreadReports.length}件
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {unreadReports.slice(0, 3).map(r => (
              <div
                key={r.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderRadius: '8px', fontSize: '13px' }}
              >
                <span>
                  <strong>{deptInfo(r.department).icon} {r.reporter_name}</strong>
                  　{r.incident.slice(0, 40)}...
                </span>
                <button
                  onClick={() => { setExpandedId(r.id); handleMarkRead(r.id); }}
                  style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  確認する →
                </button>
              </div>
            ))}
            {unreadReports.length > 3 && (
              <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'right' }}>
                他{unreadReports.length - 3}件
              </p>
            )}
          </div>
        </div>
      )}

      {/* 新規報告フォーム */}
      {showForm && (
        <div style={{ background: '#fff', border: '2px solid #ef4444', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444', marginBottom: '16px' }}>
            ⚠️ ヒヤリハット報告フォーム
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>報告者名 *</label>
              <input
                value={form.reporter_name}
                onChange={e => setForm({ ...form, reporter_name: e.target.value })}
                placeholder="例：山田 花子"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>所属部署 *</label>
              <select
                value={form.department}
                onChange={e => setForm({ ...form, department: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}
              >
                {DEPARTMENTS.filter(d => d.id !== 'all').map(d => (
                  <option key={d.id} value={d.id}>{d.icon} {d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>発生日時 *</label>
              <input
                type="datetime-local"
                value={form.occurred_at}
                onChange={e => setForm({ ...form, occurred_at: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>発生場所</label>
              <input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="例：受付、施術室3、診察室"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {[
            { key: 'incident', label: '出来事 *', placeholder: '何が起きたか、事実を客観的・具体的に記載してください', required: true },
            { key: 'direct_cause', label: '直接要因', placeholder: 'きっかけとなった具体的な行動や状況' },
            { key: 'background_cause', label: '背景要因', placeholder: '直接要因が発生した根本的な理由・環境' },
            { key: 'prevention_personal', label: '再発防止策【個人】', placeholder: '自分自身が学んだこと、今後意識したい行動・工夫' },
            { key: 'prevention_team', label: '再発防止策【チーム】', placeholder: 'チーム単位での共有・連携・工夫の改善案' },
            { key: 'reflection', label: '振り返りと気づき', placeholder: '今回の出来事を通して感じたこと、学び、チームへの活かし方' },
            { key: 'comment', label: 'コメント・補足', placeholder: 'その他、補足があれば記入してください' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>{f.label}</label>
              <textarea
                value={(form as any)[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={3}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', marginTop: '4px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '10px 20px', background: '#f3f4f6', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '10px 24px', background: '#ef4444', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              {submitting ? '⏳ 送信中...' : '📤 報告を送信する'}
            </button>
          </div>
        </div>
      )}

      {/* 部署フィルター */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {DEPARTMENTS.map(d => (
          <button
            key={d.id}
            onClick={() => setSelectedDept(d.id)}
            style={{
              padding: '6px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: 'bold',
              border: `2px solid ${selectedDept === d.id ? d.color : '#e5e7eb'}`,
              background: selectedDept === d.id ? d.color : '#fff',
              color: selectedDept === d.id ? '#fff' : '#374151',
              cursor: 'pointer',
            }}
          >
            {d.icon} {d.label}
            {d.id !== 'all' && (
              <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.8 }}>
                ({reports.filter(r => r.department === d.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 報告一覧 */}
      {reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: '14px' }}>
          報告はまだありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(r => {
            const dept = deptInfo(r.department);
            const isExpanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                style={{
                  borderRadius: '14px',
                  border: `1px solid ${r.is_read ? '#e5e7eb' : '#fca5a5'}`,
                  background: r.is_read ? '#fff' : '#fff7f7',
                  overflow: 'hidden',
                }}
              >
                {/* カードヘッダー */}
                <div
                  onClick={() => { setExpandedId(isExpanded ? null : r.id); if (!r.is_read) handleMarkRead(r.id); }}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px' }}
                >
                  {/* 部署バッジ */}
                  <span style={{
                    fontSize: '11px', fontWeight: 'bold', color: '#fff',
                    background: dept.color, padding: '3px 10px', borderRadius: '9999px',
                    whiteSpace: 'nowrap', marginTop: '2px',
                  }}>
                    {dept.icon} {dept.label}
                  </span>

                  <div style={{ flex: 1 }}>
                    {/* 未読バッジ */}
                    {!r.is_read && (
                      <span style={{ fontSize: '10px', background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '9999px', marginRight: '6px', fontWeight: 'bold' }}>
                        NEW
                      </span>
                    )}
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#111827' }}>
                      {r.incident.slice(0, 60)}{r.incident.length > 60 ? '...' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                      <span>👤 {r.reporter_name}</span>
                      <span>📍 {r.location || '不明'}</span>
                      <span>🕐 {new Date(r.occurred_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>

                {/* 展開：詳細 */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
                    {[
                      { label: '📌 出来事',           value: r.incident },
                      { label: '⚡ 直接要因',         value: r.direct_cause },
                      { label: '🌱 背景要因',         value: r.background_cause },
                      { label: '👤 再発防止【個人】', value: r.prevention_personal },
                      { label: '👥 再発防止【チーム】', value: r.prevention_team },
                      { label: '💡 振り返りと気づき', value: r.reflection },
                      { label: '💬 コメント',         value: r.comment },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>{f.label}</p>
                        <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.7', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
                          {f.value}
                        </p>
                      </div>
                    ))}

                    {/* 管理者コメント */}
                    {r.admin_comment && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', marginBottom: '4px' }}>
                          ✅ 管理者コメント
                        </p>
                        <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                          {r.admin_comment}
                        </p>
                      </div>
                    )}

                    {/* 管理者コメント入力 */}
                    {adminCommentId === r.id ? (
                      <div style={{ marginTop: '12px' }}>
                        <textarea
                          value={adminCommentText}
                          onChange={e => setAdminCommentText(e.target.value)}
                          placeholder="管理者コメントを入力..."
                          rows={3}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setAdminCommentId(null)} style={{ padding: '6px 14px', background: '#f3f4f6', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
                            キャンセル
                          </button>
                          <button onClick={() => handleSaveAdminComment(r.id)} style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                            💾 保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAdminCommentId(r.id); setAdminCommentText(r.admin_comment ?? ''); }}
                        style={{ marginTop: '10px', fontSize: '12px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ✏️ 管理者コメントを{r.admin_comment ? '編集' : '追加'}する
                      </button>
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
