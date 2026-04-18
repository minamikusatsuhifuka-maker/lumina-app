'use client';
import { useState, useEffect } from 'react';

const REPORT_TYPES = [
  { id: 'near_miss', label: 'ヒヤリハット', desc: '危険だった・ミスになりかけた・困ったことを共有する', icon: '⚠️', color: '#d97706', bgColor: '#fffbeb', borderColor: '#fcd34d', badgeBg: '#fef3c7', badgeText: '#92400e' },
  { id: 'notice',    label: '気づきシェア',  desc: '改善のアイデア・工夫・良かった対応を共有する',     icon: '💡', color: '#059669', bgColor: '#f0fdf4', borderColor: '#6ee7b7', badgeBg: '#dcfce7', badgeText: '#065f46' },
];

const NOTICE_CATEGORIES = [
  { id: 'improvement',   icon: '💡', label: '改善・工夫のアイデア',             desc: '「こうすればもっと良くなる」というアイデアや工夫を教えてください',     placeholder: '例：受付のこの流れをこう変えると患者さんが待たずに済む、など',       color: '#d97706', bg: '#fffbeb' },
  { id: 'patient_voice', icon: '🌸', label: '患者さんの声・うれしかったこと',   desc: '患者さんから嬉しいお言葉や反応があったら教えてください',             placeholder: '例：「いつもありがとう」と言っていただけた、笑顔で帰っていかれた、など', color: '#db2777', bg: '#fdf2f8' },
  { id: 'environment',   icon: '🌿', label: '環境改善・あると良いもの',         desc: 'みんなが働きやすくなるために、あると良いものや環境の改善案を教えてください', placeholder: '例：この場所にこれがあると便利、この動線を変えると動きやすい、など',   color: '#059669', bg: '#f0fdf4' },
  { id: 'happy_share',   icon: '☀️', label: '幸せのおすそわけ',                desc: '最近あった良いこと・うれしかったこと・ほっこりしたことを教えてください', placeholder: '例：〇〇さんが助けてくれてとても助かった、チームワークが良かった瞬間、など', color: '#ea580c', bg: '#fff7ed' },
  { id: 'team_praise',   icon: '👏', label: 'ありがとう・すごい！を伝えたい',   desc: 'スタッフへの感謝・称賛を言葉にしてシェアしましょう',                 placeholder: '例：〇〇さんがこんなことをしてくれた、〇〇さんのこの対応が素晴らしかった、など', color: '#7c3aed', bg: '#faf5ff' },
  { id: 'goal',          icon: '🎯', label: '目標達成・成長のお知らせ',         desc: '自分やチームの頑張り・成長・達成したことを報告してください',         placeholder: '例：〇〇の手技が上手くできるようになった、目標の件数を達成した、など',   color: '#2563eb', bg: '#eff6ff' },
  { id: 'learning',      icon: '📚', label: '学びのシェア',                     desc: '研修・勉強・気づきから学んだことをみんなにシェアしてください',       placeholder: '例：勉強会でこんなことを学んだ、この本のこの考え方が仕事に役立った、など', color: '#0891b2', bg: '#ecfeff' },
  { id: 'tips',          icon: '🔧', label: 'こんな使い方あります',             desc: 'ツール・システム・業務の便利な使い方・時短ワザを紹介する',           placeholder: '例：このシステムのこの機能をこう使うと便利、この手順をこうすると時短になる、など', color: '#0891b2', bg: '#ecfeff' },
  { id: 'other_notice',  icon: '💬', label: 'その他・自由なシェア',             desc: 'どのカテゴリにも当てはまらない気づきや想いを自由に書いてください',   placeholder: '自由に書いてください',                                                 color: '#6b7280', bg: '#f9fafb' },
];

const DEPARTMENTS = [
  { id: 'all',       label: '全て',         color: '#374151', icon: '📋' },
  { id: 'multitask', label: 'マルチタスク', color: '#6366f1', icon: '🗂' },
  { id: 'nurse',     label: '看護師',       color: '#10b981', icon: '💉' },
  { id: 'doctor',    label: '医師',         color: '#3b82f6', icon: '🩺' },
];

const emptyForm = {
  report_type: '' as string,
  reporter_name: '',
  department: 'multitask',
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

export default function StaffNearMissPage() {
  const [allReports, setAllReports]         = useState<any[]>([]);
  const [reports, setReports]               = useState<any[]>([]);
  const [selectedDept, setSelectedDept]     = useState('all');
  const [selectedType, setSelectedType]     = useState('all');
  const [showForm, setShowForm]             = useState(false);
  const [expandedId, setExpandedId]         = useState<number | null>(null);
  const [form, setForm]                     = useState({ ...emptyForm });
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [noticeCategory, setNoticeCategory] = useState('');

  const [privacyWarning, setPrivacyWarning]       = useState<{ detected_items: string[]; suggestion: string } | null>(null);
  const [isCheckingPrivacy, setIsCheckingPrivacy] = useState(false);
  const [privacyChecked, setPrivacyChecked]       = useState(false);

  const [reactions, setReactions] = useState<Record<number, any[]>>({});

  useEffect(() => { fetchAllReports(); }, []);

  useEffect(() => {
    let filtered = [...allReports];
    if (selectedDept !== 'all') filtered = filtered.filter(r => r.department === selectedDept);
    if (selectedType !== 'all') filtered = filtered.filter(r => r.report_type === selectedType);
    filtered.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return 0;
    });
    setReports(filtered);
  }, [allReports, selectedDept, selectedType]);

  const fetchAllReports = async () => {
    const res = await fetch('/api/clinic/near-miss');
    const data = await res.json();
    setAllReports(data.reports ?? []);
  };

  const fetchReactions = async (report_id: number) => {
    const res = await fetch(`/api/clinic/near-miss/reactions?report_id=${report_id}`);
    const data = await res.json();
    setReactions(prev => ({ ...prev, [report_id]: data.reactions ?? [] }));
  };

  const handleReact = async (report_id: number, emoji: string) => {
    await fetch('/api/clinic/near-miss/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id, emoji }),
    });
    fetchReactions(report_id);
  };

  const handleSameExperience = async (r: any) => {
    await fetch('/api/clinic/near-miss/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, increment_same_experience: true }),
    });
    setAllReports(prev => prev.map(item =>
      item.id === r.id ? { ...item, same_experience_count: (item.same_experience_count ?? 0) + 1 } : item
    ));
  };

  const checkPrivacy = async (): Promise<boolean> => {
    const textToCheck = [form.incident, form.direct_cause, form.background_cause, form.prevention_personal, form.prevention_team, form.reflection, form.comment]
      .filter(Boolean).join('\n');
    if (!textToCheck.trim()) return true;

    setIsCheckingPrivacy(true);
    setPrivacyWarning(null);
    const res = await fetch('/api/clinic/near-miss/check-privacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToCheck }),
    });
    const data = await res.json();
    setIsCheckingPrivacy(false);

    if (data.has_personal_info) {
      setPrivacyWarning({ detected_items: data.detected_items ?? [], suggestion: data.suggestion ?? '' });
      setPrivacyChecked(false);
      return false;
    }
    setPrivacyWarning(null);
    setPrivacyChecked(true);
    return true;
  };

  const handleSubmit = async () => {
    if (!form.report_type) { alert('種類を選んでください'); return; }
    if (form.report_type === 'notice' && !noticeCategory) { alert('カテゴリを選択してください'); return; }
    if (form.report_type === 'near_miss' && (!form.reporter_name || !form.incident || !form.occurred_at)) { alert('報告者名・発生日時・出来事は必須です'); return; }
    if (form.report_type === 'notice' && (!form.reporter_name || !form.incident)) { alert('名前と内容は必須です'); return; }

    const isClean = await checkPrivacy();
    if (!isClean) return;

    const submitForm = {
      ...form,
      notice_category: form.report_type === 'notice' ? noticeCategory : null,
      occurred_at: form.occurred_at || new Date().toISOString(),
    };
    setSubmitting(true);
    await fetch('/api/clinic/near-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitForm),
    });
    setSubmitting(false);
    setSubmitted(true);
    setShowForm(false);
    setNoticeCategory('');
    setPrivacyWarning(null);
    setPrivacyChecked(false);
    setForm({ ...emptyForm });
    await fetchAllReports();
    setTimeout(() => setSubmitted(false), 3000);
  };

  const deptInfo   = (id: string) => DEPARTMENTS.find(d => d.id === id) ?? DEPARTMENTS[DEPARTMENTS.length - 1];
  const typeInfo   = (id: string) => REPORT_TYPES.find(t => t.id === id) ?? REPORT_TYPES[0];
  const currentType = REPORT_TYPES.find(t => t.id === form.report_type);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold' }}>⚠️💡 ヒヤリハット・気づきシェア</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', lineHeight: '1.6' }}>
            小さな気づきを分かち合うことが、チームみんなの安心につながります。
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm({ ...emptyForm }); setNoticeCategory(''); }}
          style={{ padding: '10px 20px', background: '#d97706', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginLeft: '16px', whiteSpace: 'nowrap' }}
        >
          ＋ シェアする
        </button>
      </div>

      {submitted && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', borderRadius: '10px', color: '#16a34a', fontWeight: 'bold', marginBottom: '16px' }}>
          💛 シェアしてくれてありがとうございます。あなたの気づきがチームを守ります。
        </div>
      )}

      {/* 新規フォーム */}
      {showForm && (
        <div style={{ background: '#fff', border: `2px solid ${currentType ? currentType.borderColor : '#e5e7eb'}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#374151' }}>📝 フォーム</h2>

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

          {/* ヒヤリハットフォーム */}
          {form.report_type === 'near_miss' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>報告者名 *</label>
                  <input value={form.reporter_name} onChange={e => setForm({ ...form, reporter_name: e.target.value })} placeholder="例：山田 花子" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>役割 *</label>
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
                { key: 'incident',            label: '出来事 *',              placeholder: '何が起きたか、事実を客観的・具体的に' },
                { key: 'direct_cause',        label: '直接要因',             placeholder: 'きっかけとなった具体的な行動や状況' },
                { key: 'background_cause',    label: '背景要因',             placeholder: '直接要因が発生した根本的な理由・環境' },
                { key: 'prevention_personal', label: '再発防止策【個人】',   placeholder: '自分自身が学んだこと、今後意識したい行動・工夫' },
                { key: 'prevention_team',     label: '再発防止策【チーム】', placeholder: 'チーム単位での共有・連携・工夫の改善案' },
                { key: 'reflection',          label: '振り返りと気づき',     placeholder: '今回の出来事を通して感じたこと・学び' },
                { key: 'comment',             label: 'コメント・補足',       placeholder: 'その他、補足があれば' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>{f.label}</label>
                  <textarea value={(form as any)[f.key]} onChange={e => { setForm({ ...form, [f.key]: e.target.value }); setPrivacyWarning(null); setPrivacyChecked(false); }} placeholder={f.placeholder} rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', marginTop: '4px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }} />
                </div>
              ))}
            </>
          )}

          {/* 気づきシェアフォーム */}
          {form.report_type === 'notice' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '10px' }}>どんな気づきをシェアしますか？</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {NOTICE_CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setNoticeCategory(cat.id)}
                      style={{
                        padding: '12px 14px', borderRadius: '12px',
                        border: `2px solid ${noticeCategory === cat.id ? cat.color : '#e5e7eb'}`,
                        background: noticeCategory === cat.id ? cat.bg : '#fff',
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                      <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px', color: noticeCategory === cat.id ? cat.color : '#374151' }}>{cat.icon} {cat.label}</p>
                      <p style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.4' }}>{cat.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {noticeCategory && (() => {
                const cat = NOTICE_CATEGORIES.find(c => c.id === noticeCategory)!;
                return (
                  <div style={{ borderLeft: `3px solid ${cat.color}`, paddingLeft: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>名前 *</label>
                        <input value={form.reporter_name} onChange={e => setForm({ ...form, reporter_name: e.target.value })} placeholder="例：山田 花子" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>役割 *</label>
                        <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }}>
                          {DEPARTMENTS.filter(d => d.id !== 'all').map(d => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>日時（任意）</label>
                        <input type="datetime-local" value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 'bold', color: cat.color, marginBottom: '6px', display: 'block' }}>
                        {cat.icon} {cat.label}の内容 *
                      </label>
                      <textarea
                        value={form.incident}
                        onChange={e => { setForm({ ...form, incident: e.target.value }); setPrivacyWarning(null); setPrivacyChecked(false); }}
                        placeholder={cat.placeholder}
                        rows={5}
                        style={{ width: '100%', padding: '10px 14px', border: `1px solid ${cat.color}40`, borderRadius: '10px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.7', background: cat.bg }}
                      />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>一言コメント・補足（任意）</label>
                      <textarea
                        value={form.comment}
                        onChange={e => { setForm({ ...form, comment: e.target.value }); setPrivacyWarning(null); setPrivacyChecked(false); }}
                        placeholder="補足や想いがあれば気軽に書いてください"
                        rows={2}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', marginTop: '4px', resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 個人情報チェック・送信ボタン */}
          {form.report_type && (form.report_type === 'near_miss' || noticeCategory) && (
            <>
              {isCheckingPrivacy && (
                <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', marginBottom: '10px', fontSize: '13px', color: '#0369a1' }}>
                  ⏳ 個人情報が含まれていないか確認中...
                </div>
              )}

              {privacyWarning && (
                <div style={{ padding: '14px 16px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '12px', marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '14px', marginBottom: '4px' }}>⚠️ 個人を特定できる情報が含まれています</p>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>修正してから送信してください。ID番号は記載可能です。</p>
                  {privacyWarning.detected_items.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      {privacyWarning.detected_items.map((item, i) => (
                        <div key={i} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '2px 10px', background: '#fee2e2', borderRadius: '9999px', fontSize: '12px', color: '#dc2626', fontWeight: 'bold' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                  {privacyWarning.suggestion && (
                    <div style={{ padding: '10px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
                      <p style={{ fontWeight: 'bold', color: '#d97706', marginBottom: '4px' }}>💡 修正の提案</p>
                      <p>{privacyWarning.suggestion}</p>
                    </div>
                  )}
                  <button onClick={checkPrivacy}
                    style={{ marginTop: '10px', padding: '6px 16px', background: '#dc2626', color: '#fff', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                    🔍 修正後に再チェックする
                  </button>
                </div>
              )}

              {privacyChecked && !privacyWarning && (
                <div style={{ padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: '#16a34a' }}>
                  ✅ 個人情報のチェックが完了しました。送信できます。
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button onClick={() => { setShowForm(false); setPrivacyWarning(null); setPrivacyChecked(false); }} style={{ padding: '10px 20px', background: '#f3f4f6', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px' }}>キャンセル</button>
                <button onClick={handleSubmit} disabled={submitting || isCheckingPrivacy || !!privacyWarning}
                  style={{
                    padding: '10px 24px',
                    background: (submitting || isCheckingPrivacy || privacyWarning) ? '#e5e7eb' : (currentType?.color ?? '#d97706'),
                    color: (submitting || isCheckingPrivacy || privacyWarning) ? '#9ca3af' : '#fff',
                    borderRadius: '10px', border: 'none', fontWeight: 'bold', fontSize: '14px',
                    cursor: (submitting || isCheckingPrivacy || privacyWarning) ? 'not-allowed' : 'pointer',
                  }}>
                  {isCheckingPrivacy ? '⏳ 確認中...' : submitting ? '⏳ 送信中...' : privacyWarning ? '⚠️ 修正してから送信' : `${currentType?.icon ?? '💛'} シェアする`}
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

      {/* 役割フィルター */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {DEPARTMENTS.map(d => (
          <button key={d.id} onClick={() => setSelectedDept(d.id)}
            style={{ padding: '6px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: 'bold', border: `2px solid ${selectedDept === d.id ? d.color : '#e5e7eb'}`, background: selectedDept === d.id ? d.color : '#fff', color: selectedDept === d.id ? '#fff' : '#374151', cursor: 'pointer' }}>
            {d.icon} {d.label}
            {d.id !== 'all' && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.8 }}>({allReports.filter(r => r.department === d.id).length})</span>}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: '14px' }}>まだシェアはありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(r => {
            const dept = deptInfo(r.department);
            const ti   = typeInfo(r.report_type);
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} style={{ borderRadius: '14px', border: `1px solid ${ti.borderColor}80`, background: '#fff', overflow: 'hidden' }}>

                <div onClick={() => { const willOpen = !isExpanded; setExpandedId(willOpen ? r.id : null); if (willOpen && !reactions[r.id]) fetchReactions(r.id); }}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>

                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: ti.badgeText, background: ti.badgeBg, padding: '3px 10px', borderRadius: '9999px', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {ti.icon} {ti.label}
                  </span>

                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', background: dept.color, padding: '3px 10px', borderRadius: '9999px', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {dept.icon} {dept.label}
                  </span>

                  {r.report_type === 'notice' && r.notice_category && (() => {
                    const cat = NOTICE_CATEGORIES.find(c => c.id === r.notice_category);
                    if (!cat) return null;
                    return (
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: cat.color, background: cat.bg, padding: '3px 10px', borderRadius: '9999px', border: `1px solid ${cat.color}40`, whiteSpace: 'nowrap', marginTop: '2px' }}>
                        {cat.icon} {cat.label}
                      </span>
                    );
                  })()}

                  <div style={{ flex: 1 }}>
                    {r.is_pinned && <span style={{ fontSize: '10px', marginRight: '6px' }}>📌</span>}
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

                    {/* 管理者コメント閲覧（編集不可） */}
                    {r.admin_comment && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', marginBottom: '4px' }}>✅ 管理者コメント</p>
                        <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{r.admin_comment}</p>
                      </div>
                    )}

                    {/* ステータス閲覧（変更不可） */}
                    {r.status && r.status !== 'open' && (
                      <div style={{ marginTop: '10px' }}>
                        <span style={{
                          fontSize: '12px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '9999px',
                          background: r.status === 'done' ? '#dcfce7' : r.status === 'decided' ? '#dbeafe' : '#fef3c7',
                          color: r.status === 'done' ? '#16a34a' : r.status === 'decided' ? '#2563eb' : '#d97706',
                        }}>
                          {({ reviewing: '🔍 検討中', decided: '✅ 実施決定', done: '🎉 完了！' } as Record<string, string>)[r.status] ?? ''}
                          {r.status_note && ` — ${r.status_note}`}
                        </span>
                      </div>
                    )}

                    {/* リアクション */}
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {['💛', '🙏', '💡', '👏', '🔥', '😮'].map(emoji => {
                          const found = reactions[r.id]?.find((rx: any) => rx.emoji === emoji);
                          const count = found ? Number(found.count) : 0;
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReact(r.id, emoji)}
                              style={{
                                padding: '4px 10px', borderRadius: '9999px',
                                border: `1px solid ${count > 0 ? '#ddd6fe' : '#e5e7eb'}`,
                                background: count > 0 ? '#faf5ff' : '#fff',
                                cursor: 'pointer', fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '4px',
                              }}
                            >
                              {emoji}
                              {count > 0 && <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#7c3aed' }}>{count}</span>}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handleSameExperience(r)}
                        style={{
                          padding: '5px 14px', borderRadius: '9999px',
                          border: '1px solid #ddd6fe', background: '#faf5ff',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                          color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        🙋 私も同じ経験があります
                        {(r.same_experience_count ?? 0) > 0 && (
                          <span style={{ background: '#7c3aed', color: '#fff', borderRadius: '9999px', padding: '1px 7px', fontSize: '11px' }}>
                            {r.same_experience_count}人
                          </span>
                        )}
                      </button>
                    </div>
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
