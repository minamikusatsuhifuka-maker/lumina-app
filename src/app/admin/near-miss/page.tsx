'use client';
import { useState, useEffect } from 'react';

const REPORT_TYPES = [
  {
    id: 'near_miss',
    label: 'ヒヤリハット',
    desc: '危険だった・ミスになりかけた・困ったことを共有する',
    icon: '⚠️',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fcd34d',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
  },
  {
    id: 'notice',
    label: '気づきシェア',
    desc: '改善のアイデア・工夫・良かった対応を共有する',
    icon: '💡',
    color: '#059669',
    bgColor: '#f0fdf4',
    borderColor: '#6ee7b7',
    badgeBg: '#dcfce7',
    badgeText: '#065f46',
  },
];

const DEPARTMENTS = [
  { id: 'all',        label: '全て',              color: '#374151', icon: '📋' },
  { id: 'reception',  label: '受付・クラーク',     color: '#3b82f6', icon: '🏥' },
  { id: 'counselor',  label: 'カウンセラー',       color: '#8b5cf6', icon: '💬' },
  { id: 'nurse',      label: '看護師',             color: '#10b981', icon: '💉' },
  { id: 'cosmetic',   label: '美容診療',           color: '#f59e0b', icon: '✨' },
  { id: 'insurance',  label: '保険診療',           color: '#ef4444', icon: '📋' },
  { id: 'multitask',  label: 'マルチタスク医療事務', color: '#6366f1', icon: '🗂' },
  { id: 'other',      label: 'その他',             color: '#9ca3af', icon: '📝' },
];

const emptyForm = {
  report_type: '' as string,
  reporter_name: '',
  department: 'reception',
  occurred_at: '',
  location: '',
  incident: '',
  direct_cause: '',
  background_cause: '',
  prevention_personal: '',
  prevention_team: '',
  reflection: '',
  comment: '',
};

export default function NearMissPage() {
  const [reports, setReports]                   = useState<any[]>([]);
  const [selectedDept, setSelectedDept]         = useState('all');
  const [selectedType, setSelectedType]         = useState('all');
  const [showForm, setShowForm]                 = useState(false);
  const [expandedId, setExpandedId]             = useState<number | null>(null);
  const [adminCommentId, setAdminCommentId]     = useState<number | null>(null);
  const [adminCommentText, setAdminCommentText] = useState('');
  const [generatingCommentId, setGeneratingCommentId] = useState<number | null>(null);
  const [form, setForm]                         = useState({ ...emptyForm });
  const [submitting, setSubmitting]             = useState(false);
  const [submitted, setSubmitted]               = useState(false);

  // サブタイトル編集
  const [subtitle, setSubtitle]                     = useState('小さな気づきを分かち合うことが、チームみんなの安心につながります。');
  const [isEditingSubtitle, setIsEditingSubtitle]   = useState(false);
  const [subtitleDraft, setSubtitleDraft]           = useState('');
  const [subtitleSaved, setSubtitleSaved]           = useState(false);

  useEffect(() => {
    fetchReports();
  }, [selectedDept, selectedType]);

  useEffect(() => {
    fetch('/api/clinic/settings')
      .then(r => r.json())
      .then(data => {
        if (data.near_miss_subtitle) setSubtitle(data.near_miss_subtitle);
      })
      .catch(() => {});
  }, []);

  const fetchReports = async () => {
    const params = new URLSearchParams();
    if (selectedDept !== 'all') params.set('department', selectedDept);
    if (selectedType !== 'all') params.set('type', selectedType);
    const res = await fetch(`/api/clinic/near-miss?${params.toString()}`);
    const data = await res.json();
    setReports(data.reports ?? []);
  };

  const handleSubmit = async () => {
    if (!form.reporter_name || !form.incident || !form.occurred_at || !form.report_type) {
      alert('種類・報告者名・発生日時・出来事は必須です');
      return;
    }
    setSubmitting(true);
    await fetch('/api/clinic/near-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    setSubmitted(true);
    setShowForm(false);
    setForm({ ...emptyForm });
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

  const handleGenerateComment = async (report: any) => {
    setGeneratingCommentId(report.id);
    setAdminCommentId(report.id);

    const res = await fetch('/api/clinic/near-miss/generate-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report }),
    });
    const data = await res.json();

    setAdminCommentText(data.comment ?? '');
    setGeneratingCommentId(null);
  };

  const handleSaveSubtitle = async () => {
    await fetch('/api/clinic/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'near_miss_subtitle', value: subtitleDraft }),
    });
    setSubtitle(subtitleDraft);
    setIsEditingSubtitle(false);
    setSubtitleSaved(true);
    setTimeout(() => setSubtitleSaved(false), 2500);
  };

  const unreadReports = reports.filter(r => !r.is_read);
  const deptInfo  = (id: string) => DEPARTMENTS.find(d => d.id === id) ?? DEPARTMENTS[DEPARTMENTS.length - 1];
  const typeInfo  = (id: string) => REPORT_TYPES.find(t => t.id === id) ?? REPORT_TYPES[0];
  const currentType = REPORT_TYPES.find(t => t.id === form.report_type);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold' }}>⚠️💡 ヒヤリハット・気づきシェア</h1>

          {/* サブタイトル編集 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '6px' }}>
            {isEditingSubtitle ? (
              <div style={{ flex: 1 }}>
                <textarea
                  value={subtitleDraft}
                  onChange={e => setSubtitleDraft(e.target.value)}
                  rows={2}
                  autoFocus
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button onClick={handleSaveSubtitle} style={{ padding: '5px 14px', background: '#d97706', color: '#fff', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                    💾 保存
                  </button>
                  <button onClick={() => setIsEditingSubtitle(false)} style={{ padding: '5px 12px', background: '#f3f4f6', color: '#374151', borderRadius: '8px', border: 'none', fontSize: '12px', cursor: 'pointer' }}>
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', flex: 1 }}>{subtitle}</p>
                <button onClick={() => { setSubtitleDraft(subtitle); setIsEditingSubtitle(true); }} title="テキストを編集" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#d1d5db', padding: '2px 4px', borderRadius: '4px', flexShrink: 0 }}>✏️</button>
              </>
            )}
          </div>
          {subtitleSaved && <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>✓ 保存しました</p>}
        </div>

        <button
          onClick={() => { setShowForm(!showForm); setForm({ ...emptyForm }); }}
          style={{ padding: '10px 20px', background: '#d97706', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginLeft: '16px', whiteSpace: 'nowrap' }}
        >
          ＋ シェアする
        </button>
      </div>

      {/* 送信完了 */}
      {submitted && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', borderRadius: '10px', color: '#16a34a', fontWeight: 'bold', marginBottom: '16px' }}>
          💛 シェアしてくれてありがとうございます。あなたの気づきがチームを守ります。
        </div>
      )}

      {/* 未読アラート */}
      {unreadReports.length > 0 && (
        <div style={{ padding: '14px 16px', background: '#fef3c7', border: '2px solid #fcd34d', borderRadius: '12px', marginBottom: '20px' }}>
          <p style={{ fontWeight: 'bold', color: '#d97706', fontSize: '14px', marginBottom: '8px' }}>
            💛 新しい気づきシェア {unreadReports.length}件
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {unreadReports.slice(0, 3).map(r => {
              const ti = typeInfo(r.report_type);
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderRadius: '8px', fontSize: '13px' }}>
                  <span>
                    <strong>{ti.icon} {r.reporter_name}</strong>　{r.incident.slice(0, 40)}...
                  </span>
                  <button onClick={() => { setExpandedId(r.id); handleMarkRead(r.id); }} style={{ fontSize: '12px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                    確認する →
                  </button>
                </div>
              );
            })}
            {unreadReports.length > 3 && <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'right' }}>他{unreadReports.length - 3}件</p>}
          </div>
        </div>
      )}

      {/* 新規フォーム */}
      {showForm && (
        <div style={{ background: '#fff', border: `2px solid ${currentType ? currentType.borderColor : '#e5e7eb'}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#374151' }}>📝 フォーム</h2>

          {/* タイプ選択 */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '10px' }}>まず種類を選んでください：</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {REPORT_TYPES.map(t => (
                <button key={t.id} onClick={() => setForm({ ...form, report_type: t.id })}
                  style={{ padding: '14px 16px', borderRadius: '12px', border: `2px solid ${form.report_type === t.id ? t.color : '#e5e7eb'}`, background: form.report_type === t.id ? t.bgColor : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px', color: form.report_type === t.id ? t.color : '#374151' }}>{t.icon} {t.label}</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* フォーム本体（タイプ選択後に表示） */}
          {form.report_type && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>報告者名 *</label>
                  <input value={form.reporter_name} onChange={e => setForm({ ...form, reporter_name: e.target.value })} placeholder="例：山田 花子" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>所属部署 *</label>
                  <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}>
                    {DEPARTMENTS.filter(d => d.id !== 'all').map(d => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>発生日時 *</label>
                  <input type="datetime-local" value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>発生場所</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例：受付、施術室3、診察室" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>

              {[
                { key: 'incident',            label: form.report_type === 'near_miss' ? '出来事 *' : '気づき・内容 *', placeholder: form.report_type === 'near_miss' ? '何が起きたか、事実を客観的・具体的に' : '気づいたこと・改善アイデア・良かった対応を具体的に' },
                { key: 'direct_cause',        label: '直接要因',             placeholder: 'きっかけとなった具体的な行動や状況' },
                { key: 'background_cause',    label: '背景要因',             placeholder: '直接要因が発生した根本的な理由・環境' },
                { key: 'prevention_personal', label: '再発防止策【個人】',   placeholder: '自分自身が学んだこと、今後意識したい行動・工夫' },
                { key: 'prevention_team',     label: '再発防止策【チーム】', placeholder: 'チーム単位での共有・連携・工夫の改善案' },
                { key: 'reflection',          label: '振り返りと気づき',     placeholder: '今回の出来事を通して感じたこと・学び' },
                { key: 'comment',             label: 'コメント・補足',       placeholder: 'その他、補足があれば' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>{f.label}</label>
                  <textarea value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', marginTop: '4px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }} />
                </div>
              ))}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: '#f3f4f6', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px' }}>キャンセル</button>
                <button onClick={handleSubmit} disabled={submitting}
                  style={{ padding: '10px 24px', background: currentType?.color ?? '#d97706', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
                  {submitting ? '⏳ 送信中...' : `${currentType?.icon ?? '💛'} シェアする`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* タイプフィルター */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        {[
          { id: 'all',       label: 'すべて',        icon: '📋', color: '#374151' },
          { id: 'near_miss', label: 'ヒヤリハット',  icon: '⚠️', color: '#d97706' },
          { id: 'notice',    label: '気づきシェア',  icon: '💡', color: '#059669' },
        ].map(t => (
          <button key={t.id} onClick={() => setSelectedType(t.id)}
            style={{ padding: '6px 16px', borderRadius: '9999px', fontSize: '13px', fontWeight: 'bold', border: `2px solid ${selectedType === t.id ? t.color : '#e5e7eb'}`, background: selectedType === t.id ? t.color : '#fff', color: selectedType === t.id ? '#fff' : '#374151', cursor: 'pointer' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 部署フィルター */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {DEPARTMENTS.map(d => (
          <button key={d.id} onClick={() => setSelectedDept(d.id)}
            style={{ padding: '6px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: 'bold', border: `2px solid ${selectedDept === d.id ? d.color : '#e5e7eb'}`, background: selectedDept === d.id ? d.color : '#fff', color: selectedDept === d.id ? '#fff' : '#374151', cursor: 'pointer' }}>
            {d.icon} {d.label}
            {d.id !== 'all' && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.8 }}>({reports.filter(r => r.department === d.id).length})</span>}
          </button>
        ))}
      </div>

      {/* 報告一覧 */}
      {reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: '14px' }}>まだシェアはありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(r => {
            const dept = deptInfo(r.department);
            const ti   = typeInfo(r.report_type);
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} style={{ borderRadius: '14px', border: `1px solid ${r.is_read ? ti.borderColor + '80' : ti.borderColor}`, background: r.is_read ? '#fff' : ti.bgColor, overflow: 'hidden' }}>

                <div onClick={() => { setExpandedId(isExpanded ? null : r.id); if (!r.is_read) handleMarkRead(r.id); }}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>

                  {/* タイプバッジ */}
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: ti.badgeText, background: ti.badgeBg, padding: '3px 10px', borderRadius: '9999px', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {ti.icon} {ti.label}
                  </span>

                  {/* 部署バッジ */}
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', background: dept.color, padding: '3px 10px', borderRadius: '9999px', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {dept.icon} {dept.label}
                  </span>

                  <div style={{ flex: 1 }}>
                    {!r.is_read && <span style={{ fontSize: '10px', background: ti.color, color: '#fff', padding: '1px 6px', borderRadius: '9999px', marginRight: '6px', fontWeight: 'bold' }}>NEW</span>}
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#111827' }}>
                      {r.incident.slice(0, 60)}{r.incident.length > 60 ? '...' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                      <span>👤 {r.reporter_name}</span>
                      {r.location && <span>📍 {r.location}</span>}
                      <span>🕐 {new Date(r.occurred_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
                    {[
                      { label: '📌 出来事・内容',       value: r.incident },
                      { label: '⚡ 直接要因',           value: r.direct_cause },
                      { label: '🌱 背景要因',           value: r.background_cause },
                      { label: '👤 再発防止【個人】',   value: r.prevention_personal },
                      { label: '👥 再発防止【チーム】', value: r.prevention_team },
                      { label: '💡 振り返りと気づき',   value: r.reflection },
                      { label: '💬 コメント',           value: r.comment },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>{f.label}</p>
                        <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.7', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>{f.value}</p>
                      </div>
                    ))}

                    {/* 管理者コメント表示（編集中は非表示） */}
                    {r.admin_comment && adminCommentId !== r.id && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', marginBottom: '4px' }}>✅ 管理者コメント</p>
                        <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{r.admin_comment}</p>
                      </div>
                    )}

                    {/* 管理者コメント入力・AI生成エリア */}
                    {adminCommentId === r.id ? (
                      <div style={{ marginTop: '12px' }}>

                        {/* AI生成ボタン */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
                          padding: '10px 12px', background: '#faf5ff',
                          borderRadius: '10px', border: '1px solid #e9d5ff',
                        }}>
                          <span style={{ fontSize: '13px', color: '#7c3aed' }}>🤖 AIがコメントを生成します</span>
                          <button
                            onClick={() => handleGenerateComment(r)}
                            disabled={generatingCommentId === r.id}
                            style={{
                              marginLeft: 'auto', padding: '6px 16px',
                              background: generatingCommentId === r.id ? '#e9d5ff' : '#7c3aed',
                              color: '#fff', borderRadius: '8px', border: 'none',
                              fontSize: '12px', fontWeight: 'bold',
                              cursor: generatingCommentId === r.id ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {generatingCommentId === r.id ? '⏳ 生成中...' : '✨ AIコメントを生成'}
                          </button>
                        </div>

                        <textarea
                          value={adminCommentText}
                          onChange={e => setAdminCommentText(e.target.value)}
                          placeholder={generatingCommentId === r.id ? '⏳ AIがコメントを生成中です...' : '管理者コメントを入力、またはAIで生成してください'}
                          rows={5}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.7' }}
                        />

                        <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right', marginTop: '2px' }}>
                          {adminCommentText.length}文字
                        </p>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setAdminCommentId(null); setAdminCommentText(''); }}
                            style={{ padding: '6px 14px', background: '#f3f4f6', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={() => handleSaveAdminComment(r.id)}
                            disabled={!adminCommentText.trim()}
                            style={{
                              padding: '6px 16px',
                              background: adminCommentText.trim() ? '#16a34a' : '#e5e7eb',
                              color: adminCommentText.trim() ? '#fff' : '#9ca3af',
                              borderRadius: '8px', border: 'none',
                              cursor: adminCommentText.trim() ? 'pointer' : 'not-allowed',
                              fontSize: '13px', fontWeight: 'bold',
                            }}
                          >
                            💾 保存する
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAdminCommentId(r.id); setAdminCommentText(r.admin_comment ?? ''); }}
                        style={{ marginTop: '10px', fontSize: '12px', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        {r.admin_comment ? '✏️ 管理者コメントを編集する' : '✨ AIコメントを生成・追加する'}
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
