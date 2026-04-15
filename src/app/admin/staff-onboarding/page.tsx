'use client';
import { useState, useEffect, useRef } from 'react';

type Onboarding = {
  id: string; staff_name: string; email: string; phone: string;
  emergency_contact: string; chatwork_registered: boolean; chatwork_note: string;
  freee_registered: boolean; freee_note: string; qliolock_registered: boolean; qliolock_note: string;
  attendance_card_handed: boolean; attendance_card_note: string;
  security_card_handed: boolean; security_card_note: string;
  key_type: string; key_handed: boolean; key_note: string;
  tax_accountant_submitted: boolean; tax_accountant_note: string;
  labor_consultant_submitted: boolean; labor_consultant_note: string;
  todos: string[]; trainings: string[]; ai_summary: string; notes: string;
};

const CHECKLIST_GROUPS = [
  {
    label: '📱 基本情報', color: '#6c63ff',
    items: [
      { key: 'email', label: 'メールアドレス', type: 'text', noteKey: null },
      { key: 'phone', label: '電話番号', type: 'text', noteKey: null },
      { key: 'emergency_contact', label: '緊急連絡先', type: 'text', noteKey: null },
    ],
  },
  {
    label: '💬 ツール登録', color: '#06b6d4',
    items: [
      { key: 'chatwork_registered', label: 'Chatwork登録', type: 'bool', noteKey: 'chatwork_note' },
      { key: 'freee_registered', label: 'freee登録', type: 'bool', noteKey: 'freee_note' },
      { key: 'qliolock_registered', label: 'Qlio Lock登録', type: 'bool', noteKey: 'qliolock_note' },
    ],
  },
  {
    label: '🪪 物品手渡し', color: '#f59e0b',
    items: [
      { key: 'attendance_card_handed', label: '勤怠カード手渡し', type: 'bool', noteKey: 'attendance_card_note' },
      { key: 'security_card_handed', label: 'セキュリティカード手渡し', type: 'bool', noteKey: 'security_card_note' },
      { key: 'key_type', label: '鍵の種類', type: 'text', noteKey: null },
      { key: 'key_handed', label: '鍵の手渡し', type: 'bool', noteKey: 'key_note' },
    ],
  },
  {
    label: '📄 書類提出', color: '#1D9E75',
    items: [
      { key: 'tax_accountant_submitted', label: '税理士への提出', type: 'bool', noteKey: 'tax_accountant_note' },
      { key: 'labor_consultant_submitted', label: '社労士への提出', type: 'bool', noteKey: 'labor_consultant_note' },
    ],
  },
];

const calcProgress = (ob: Onboarding) => {
  const boolKeys = ['chatwork_registered','freee_registered','qliolock_registered','attendance_card_handed','security_card_handed','key_handed','tax_accountant_submitted','labor_consultant_submitted'];
  const textKeys = ['email','phone'];
  let done = 0, total = boolKeys.length + textKeys.length;
  boolKeys.forEach(k => { if ((ob as unknown as Record<string, unknown>)[k]) done++; });
  textKeys.forEach(k => { if ((ob as unknown as Record<string, unknown>)[k]) done++; });
  const todos: string[] = ob.todos || [];
  const trainings: string[] = ob.trainings || [];
  total += todos.length + trainings.length;
  done += todos.filter(t => t.startsWith('✅')).length;
  done += trainings.filter(t => t.startsWith('✅')).length;
  return { done, total };
};

export default function StaffOnboardingPage() {
  const [list, setList] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Onboarding>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'incomplete'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetch_ = () => fetch('/api/clinic/staff-onboarding').then(r => r.json()).then(d => { if (Array.isArray(d)) setList(d); setLoading(false); });
  useEffect(() => { fetch_(); }, []);

  const save = async () => {
    if (!editing.id) return;
    setSaving(true);
    await fetch('/api/clinic/staff-onboarding', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    await fetch_();
    setSaving(false);
    setMessage('✅ 保存しました');
    setTimeout(() => setMessage(''), 2000);
  };

  const addStaff = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    await fetch('/api/clinic/staff-onboarding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: newName }),
    });
    setNewName('');
    await fetch_();
    setAdding(false);
  };

  const deleteStaff = async (id: string) => {
    if (!confirm('このスタッフの管理情報を削除しますか？')) return;
    await fetch('/api/clinic/staff-onboarding', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    await fetch_();
  };

  const toggleTodo = (key: 'todos' | 'trainings', idx: number) => {
    const arr = [...((editing as Partial<Onboarding>)[key] || [])];
    arr[idx] = arr[idx].startsWith('✅') ? arr[idx].replace('✅ ', '') : '✅ ' + arr[idx].replace('✅ ', '');
    setEditing(prev => ({ ...prev, [key]: arr }));
  };

  const addTodo = (key: 'todos' | 'trainings', text: string) => {
    if (!text.trim()) return;
    const arr = [...((editing as Partial<Onboarding>)[key] || []), text];
    setEditing(prev => ({ ...prev, [key]: arr }));
  };

  const removeTodo = (key: 'todos' | 'trainings', idx: number) => {
    const arr = [...((editing as Partial<Onboarding>)[key] || [])];
    arr.splice(idx, 1);
    setEditing(prev => ({ ...prev, [key]: arr }));
  };

  const runAi = async (imageBase64?: string) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/clinic/staff-onboarding/ai-parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText, imageBase64 }),
      });
      const data = await res.json();
      if (data.error) { setMessage('❌ ' + data.error); return; }
      setEditing(prev => {
        const merged: Record<string, unknown> = { ...prev };
        Object.entries(data).forEach(([k, v]) => { if (v !== null && v !== undefined) merged[k] = v; });
        return merged as Partial<Onboarding>;
      });
      setMessage('✅ AIが情報を読み取りました。内容を確認して保存してください。');
      setAiText('');
    } catch { setMessage('❌ 解析に失敗しました'); }
    finally { setAiLoading(false); }
  };

  const handleImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      await runAi(base64);
    };
    reader.readAsDataURL(file);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' };

  const filtered = list.filter(ob => {
    if (filterStatus === 'incomplete') {
      const { done, total } = calcProgress(ob);
      return done < total;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>📋 スタッフ入社・登録管理</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>スタッフごとの登録状況・手続きを一元管理</p>

      {message && <div style={{ padding: '8px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, fontSize: 13, color: '#1D9E75', marginBottom: 12 }}>{message}</div>}

      {/* スタッフ追加 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} placeholder="スタッフ名を入力して追加..."
          style={{ flex: 1, ...inputStyle, fontSize: 13 }} />
        <button onClick={addStaff} disabled={adding || !newName.trim()}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ＋ 追加
        </button>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'incomplete')}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="all">全員表示</option>
          <option value="incomplete">未完了あり</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>スタッフを追加してください</div>
        </div>
      ) : filtered.map(ob => {
        const isOpen = expanded === ob.id;
        const { done, total } = calcProgress(ob);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const ed = isOpen ? editing : ob;
        const parseArr = (v: unknown): string[] => Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v || '[]') : []);

        return (
          <div key={ob.id} style={{ marginBottom: 10, border: `1.5px solid ${pct === 100 ? 'rgba(29,158,117,0.3)' : pct < 50 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            {/* ヘッダー */}
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              onClick={() => { setExpanded(isOpen ? null : ob.id); if (!isOpen) setEditing({ ...ob }); }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                {ob.staff_name?.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{ob.staff_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#1D9E75' : pct < 50 ? '#ef4444' : '#f59e0b', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: pct === 100 ? '#1D9E75' : pct < 50 ? '#ef4444' : '#f59e0b', whiteSpace: 'nowrap' }}>
                    {done}/{total} 完了 ({pct}%)
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* 詳細パネル */}
            {isOpen && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                {/* AIパネル */}
                <div style={{ margin: '12px 0', padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>🤖 AIで情報を読み取る</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <textarea value={aiText} onChange={e => setAiText(e.target.value)}
                      placeholder="テキストを貼り付け（メール・メモ・書類の内容など）&#10;AIが自動で各項目に振り分けます"
                      style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => runAi()} disabled={aiLoading || !aiText.trim()}
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : '#6c63ff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {aiLoading ? '解析中...' : '📄 テキストを解析'}
                    </button>
                    <button onClick={() => fileRef.current?.click()} disabled={aiLoading}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.3)', background: 'transparent', color: '#6c63ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      🖼️ 画像をアップロード
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }} />
                  </div>
                  {ed.ai_summary && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      💡 {ed.ai_summary}
                    </div>
                  )}
                </div>

                {/* 各グループ */}
                {CHECKLIST_GROUPS.map(group => (
                  <div key={group.label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: group.color, marginBottom: 6 }}>{group.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {group.items.map(item => {
                        const editingRec = editing as Record<string, unknown>;
                        const val = editingRec[item.key];
                        const noteKey = item.noteKey;
                        const noteVal = noteKey ? editingRec[noteKey] : '';
                        return (
                          <div key={item.key} style={{ padding: '7px 10px', background: 'var(--bg-card)', border: `1px solid var(--border)`, borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {item.type === 'bool' ? (
                              <>
                                <button onClick={() => setEditing(prev => ({ ...prev, [item.key]: !val }))}
                                  style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: val ? '#1D9E75' : 'var(--border)', color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {val ? '✓' : ''}
                                </button>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: val ? '#1D9E75' : 'var(--text-primary)', marginBottom: noteKey ? 4 : 0 }}>{item.label}</div>
                                  {noteKey && (
                                    <input value={(noteVal as string) || ''} onChange={e => setEditing(prev => ({ ...prev, [noteKey]: e.target.value }))}
                                      placeholder="メモ（日付・詳細など）"
                                      style={{ ...inputStyle, fontSize: 11 }} />
                                  )}
                                </div>
                              </>
                            ) : (
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{item.label}</div>
                                <input value={(val as string) || ''} onChange={e => setEditing(prev => ({ ...prev, [item.key]: e.target.value }))}
                                  placeholder={`${item.label}を入力`}
                                  style={{ ...inputStyle }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* 入社手続きTODO・研修 */}
                {(['todos', 'trainings'] as const).map(key => {
                  const label = key === 'todos' ? '📝 入社手続きTODO' : '🎓 研修受講状況';
                  const color = key === 'todos' ? '#ec4899' : '#8b5cf6';
                  const arr = parseArr((editing as Partial<Onboarding>)[key]);
                  return (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{label}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {arr.map((item: string, idx: number) => (
                          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <button onClick={() => toggleTodo(key, idx)}
                              style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', background: item.startsWith('✅') ? '#1D9E75' : 'var(--border)', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {item.startsWith('✅') ? '✓' : ''}
                            </button>
                            <span style={{ flex: 1, fontSize: 12, color: item.startsWith('✅') ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.startsWith('✅') ? 'line-through' : 'none' }}>
                              {item.replace('✅ ', '')}
                            </span>
                            <button onClick={() => removeTodo(key, idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input placeholder={key === 'todos' ? '例：マイナンバー収集' : '例：院内感染研修'}
                            style={{ ...inputStyle, flex: 1 }}
                            onKeyDown={e => { if (e.key === 'Enter') { addTodo(key, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                          />
                          <button
                            onClick={(e) => {
                              const input = (e.currentTarget.previousSibling as HTMLInputElement);
                              addTodo(key, input.value);
                              input.value = '';
                            }}
                            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            ＋
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 全体メモ */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📝 全体メモ</div>
                  <textarea value={(editing as Partial<Onboarding>).notes || ''} onChange={e => setEditing(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="その他メモ"
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
                </div>

                {/* 保存・削除 */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={save} disabled={saving}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(108,99,255,0.3)' : '#6c63ff', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? '保存中...' : '💾 保存'}
                  </button>
                  <button onClick={() => deleteStaff(ob.id)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}>
                    🗑️ 削除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
