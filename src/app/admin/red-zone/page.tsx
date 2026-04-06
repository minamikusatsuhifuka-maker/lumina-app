'use client';
import { useState, useEffect } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';
import { AITextReviser } from '@/components/clinic/AITextReviser';

const ZONES = [
  { key: 'red', label: 'レッド', icon: '🔴', desc: '即退職レベル', color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
  { key: 'yellow', label: 'イエロー', icon: '🟡', desc: '退職勧告レベル', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  { key: 'green', label: 'グリーン', icon: '🟢', desc: '一人前の基準', color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)' },
  { key: 'teal', label: 'ティール', icon: '🩵', desc: 'リーダーの基準', color: '#06b6d4', bg: 'rgba(6,182,212,0.06)', border: 'rgba(6,182,212,0.2)' },
] as const;

type ZoneType = typeof ZONES[number]['key'];

const CATEGORIES: Record<string, string> = {
  harassment: 'ハラスメント', attitude: '態度の問題', legal: '法的問題',
  moral: 'モラル', work: '職務上', mindset: 'マインド', teamwork: 'チームワーク',
  communication: 'コミュニケーション', selfcontrol: 'セルフコントロール',
  timemanagement: 'タイムマネジメント', leadership: 'リーダーシップ',
  development: '人材育成', vision: 'ビジョン', contribution: '社会貢献',
  management: 'マネジメント',
};

type Rule = {
  id: string; category: string; title: string; description: string;
  severity: string; consequence: string; zone_type: string;
  improvement_period: string; legal_basis: string; official_statement: string;
};

export default function ZoneManagementPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [activeZone, setActiveZone] = useState<ZoneType>('red');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<any>(null); // { zones: [...] }
  const [suggestTab, setSuggestTab] = useState<ZoneType>('red');
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // 手動追加
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    zone_type: 'red' as string, category: 'attitude', title: '', description: '',
    severity: 'critical', consequence: '', improvement_period: '', legal_basis: '', official_statement: '',
    behavioral_indicators: '', related_achievement_principle: '',
  });

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', consequence: '', official_statement: '', legal_basis: '', improvement_period: '' });

  useEffect(() => {
    fetch('/api/clinic/red-zone').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setRules(d);
      setLoading(false);
    });
  }, []);

  const generateAllZones = async () => {
    if (!confirm('既存の行動基準をすべて削除して、新しく4ゾーン×5件を生成し直します。よろしいですか？')) return;

    setGenerating(true);
    setMessage('既存データをクリア中...');

    // 既存データを一括削除（重複防止）
    try {
      await fetch('/api/clinic/red-zone', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      });
      setRules([]);
    } catch (e) {
      console.error('一括削除失敗:', e);
    }

    const zones = ['red', 'yellow', 'green', 'teal'];
    let totalSaved = 0;

    for (const zone of zones) {
      try {
        setMessage(`${zone}ゾーンを生成中...`);

        const res = await fetch('/api/clinic/red-zone/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone }),
        });

        if (!res.ok) {
          console.error(`${zone} generate failed:`, res.status);
          continue;
        }

        const data = await res.json();
        const rules = data.rules || [];

        // 各ルールを順番に保存（空titleはスキップ）
        for (const rule of rules) {
          const title = (rule.title || '').trim();
          if (!title) continue;
          try {
            const res = await fetch('/api/clinic/red-zone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                zone_type: zone,
                category: 'attitude',
                title,
                description: (rule.description || title).trim(),
                consequence: (rule.consequence || rule.example || '').trim(),
                severity: zone === 'red' ? 'critical' : zone === 'yellow' ? 'serious' : 'standard',
              }),
            });
            if (res.ok) totalSaved++;
            else console.error('保存400:', zone, title, await res.text());
          } catch (e) {
            console.error('保存失敗:', title, e);
          }
        }
      } catch (e) {
        console.error(`${zone} error:`, e);
      }
    }

    // 全ゾーン完了後に再取得
    const updated = await fetch('/api/clinic/red-zone').then(r => r.json());
    setRules(Array.isArray(updated) ? updated : []);
    setMessage(`✅ ${totalSaved}件の行動基準を生成・保存しました`);
    setTimeout(() => setMessage(''), 5000);
    setGenerating(false);
  };

  const adoptItem = async (zoneType: string, item: any, idx: number) => {
    const key = `${zoneType}-${idx}`;
    setSavingId(key);
    try {
      const res = await fetch('/api/clinic/red-zone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          zone_type: zoneType,
          severity: zoneType === 'red' ? 'critical' : zoneType === 'yellow' ? 'serious' : 'standard',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => [...prev, { ...item, id: data.id, zone_type: zoneType, severity: zoneType === 'red' ? 'critical' : 'serious' }]);
        // 提案から除去
        setSuggestions((prev: any) => {
          if (!prev?.zones) return prev;
          return {
            zones: prev.zones.map((z: any) =>
              z.zone_type === zoneType ? { ...z, items: z.items.filter((_: any, i: number) => i !== idx) } : z
            ),
          };
        });
        setMessage(`「${item.title}」を採用しました`);
      }
    } finally { setSavingId(null); }
  };

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setEditForm({ title: rule.title, description: rule.description, consequence: rule.consequence || '', official_statement: rule.official_statement || '', legal_basis: rule.legal_basis || '', improvement_period: rule.improvement_period || '' });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingId('edit');
    try {
      const res = await fetch('/api/clinic/red-zone', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...editForm }) });
      if ((await res.json()).success) {
        setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...editForm } : r));
        setEditingId(null);
        setMessage('更新しました');
      }
    } finally { setSavingId(null); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('この項目を削除しますか？')) return;
    await fetch('/api/clinic/red-zone', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleAddSubmit = async () => {
    if (!addForm.title || !addForm.description) return;
    setSavingId('add');
    try {
      const res = await fetch('/api/clinic/red-zone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm) });
      const data = await res.json();
      if (data.success) {
        setRules(prev => [...prev, { ...addForm, id: data.id } as any]);
        setAddForm({ zone_type: 'red', category: 'attitude', title: '', description: '', severity: 'critical', consequence: '', improvement_period: '', legal_basis: '', official_statement: '', behavioral_indicators: '', related_achievement_principle: '' });
        setShowAdd(false);
        setMessage('追加しました');
      }
    } finally { setSavingId(null); }
  };

  const zoneRules = (zt: string) => rules.filter(r => (r.zone_type || 'red') === zt);
  const z = ZONES.find(z => z.key === activeZone)!;

  const cardStyle: React.CSSProperties = { padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🎯 行動基準・ゾーン管理</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>当クリニックの行動基準を4段階で定義します</p>

      {/* ビジョンバナー */}
      <div style={{ marginBottom: 20, padding: 16, borderRadius: 14, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>🩵 私たちが目指す姿</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          全員が次世代のリーダー・エキスパートとして、お互いの強みを活かしシナジーを生み出すティール組織。この行動基準は「罰則」ではなく、<span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>全員が主役として輝くための道標</span>です。
        </div>
      </div>

      {message && <div style={{ padding: 10, background: message.includes('失敗') ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 8, fontSize: 13, color: message.includes('失敗') ? '#ef4444' : '#4ade80', marginBottom: 12 }}>{message}</div>}

      {/* 4ゾーン概要カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {ZONES.map(zone => {
          const count = zoneRules(zone.key).length;
          return (
            <div key={zone.key} onClick={() => setActiveZone(zone.key)} style={{
              padding: 14, borderRadius: 14, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              background: activeZone === zone.key ? zone.bg : 'var(--bg-secondary)',
              border: `2px solid ${activeZone === zone.key ? zone.color : 'var(--border)'}`,
            }}>
              <div style={{ fontSize: 24 }}>{zone.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: zone.color, marginTop: 4 }}>{zone.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{zone.desc}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>{count}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>件</span></div>
            </div>
          );
        })}
      </div>

      {/* ボタン */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={generateAllZones} disabled={generating} style={{
          padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          {generating ? message || '生成中...' : '🤖 AIに4ゾーンを提案してもらう'}
        </button>
        <button onClick={() => { setShowAdd(!showAdd); setAddForm(prev => ({ ...prev, zone_type: activeZone })); }} style={{
          padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
        }}>
          ➕ 手動で追加
        </button>
      </div>

      {/* 手動追加フォーム */}
      {showAdd && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>行動基準を追加</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ゾーン</label>
              <select value={addForm.zone_type} onChange={e => setAddForm(p => ({ ...p, zone_type: e.target.value }))} style={inputStyle}>
                {ZONES.map(z => <option key={z.key} value={z.key}>{z.icon} {z.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>カテゴリ</label>
              <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>重大度</label>
              <select value={addForm.severity} onChange={e => setAddForm(p => ({ ...p, severity: e.target.value }))} style={inputStyle}>
                <option value="critical">即時解雇</option>
                <option value="serious">警告→退職</option>
                <option value="standard">基準</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>タイトル</label>
            <input value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>説明</label>
            <textarea value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>公式ステートメント</label>
            <input value={addForm.official_statement} onChange={e => setAddForm(p => ({ ...p, official_statement: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAddSubmit} disabled={savingId === 'add' || !addForm.title || !addForm.description} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {savingId === 'add' ? '保存中...' : '💾 保存'}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* AI提案 */}
      {suggestions?.zones && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🤖 AI提案</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {ZONES.map(zone => {
              const items = suggestions.zones.find((z: any) => z.zone_type === zone.key)?.items || [];
              return (
                <button key={zone.key} onClick={() => setSuggestTab(zone.key)} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: suggestTab === zone.key ? zone.bg : 'var(--bg-card)',
                  color: suggestTab === zone.key ? zone.color : 'var(--text-muted)',
                  border: `1px solid ${suggestTab === zone.key ? zone.color : 'var(--border)'}`,
                }}>{zone.icon} {zone.label} ({items.length})</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
            {(suggestions.zones.find((z: any) => z.zone_type === suggestTab)?.items || []).map((item: any, i: number) => {
              const sz = ZONES.find(z => z.key === suggestTab)!;
              const key = `${suggestTab}-${i}`;
              return (
                <div key={key} style={{ padding: 12, background: sz.bg, border: `1px solid ${sz.border}`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${sz.color}20`, color: sz.color, fontWeight: 700 }}>{CATEGORIES[item.category] || item.category}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.description}</div>
                    {item.official_statement && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>📋 {item.official_statement}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => adoptItem(suggestTab, item, i)} disabled={savingId === key} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {savingId === key ? '...' : '✅ 採用'}
                    </button>
                    <button onClick={() => setSuggestions((prev: any) => ({
                      zones: prev.zones.map((z: any) => z.zone_type === suggestTab ? { ...z, items: z.items.filter((_: any, j: number) => j !== i) } : z),
                    }))} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                      ✕ 却下
                    </button>
                  </div>
                </div>
              );
            })}
            {(suggestions.zones.find((z: any) => z.zone_type === suggestTab)?.items || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>全て処理済みです</div>
            )}
          </div>
        </div>
      )}

      {/* 登録済みゾーンタブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {ZONES.map(zone => (
          <button key={zone.key} onClick={() => setActiveZone(zone.key)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: activeZone === zone.key ? zone.bg : 'var(--bg-card)',
            color: activeZone === zone.key ? zone.color : 'var(--text-muted)',
            border: `1px solid ${activeZone === zone.key ? zone.color : 'var(--border)'}`,
          }}>{zone.icon} {zone.label} ({zoneRules(zone.key).length})</button>
        ))}
      </div>

      {/* レッド・イエロー 対応フロー */}
      {(activeZone === 'red' || activeZone === 'yellow') && (
        <div style={{
          padding: 20, marginBottom: 16,
          background: activeZone === 'red' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${activeZone === 'red' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: activeZone === 'red' ? '#ef4444' : '#f59e0b', marginBottom: 10 }}>
            {activeZone === 'red' ? '🔴 レッドゾーン 対応フロー' : '🟡 イエローゾーン 対応フロー'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(activeZone === 'red'
              ? ['①発生・即報告', '②事実確認（当日）', '③就業規則適用', '④退職勧告・懲戒', '⑤記録・保存']
              : ['①発生・記録', '②1週間以内に面談', '③改善計画書作成', '④1ヶ月フォロー', '⑤改善確認 or レッドへ']
            ).map((step, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 20,
                background: activeZone === 'red' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                color: activeZone === 'red' ? '#ef4444' : '#f59e0b',
                fontSize: 12, fontWeight: 600,
              }}>{step}</div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {activeZone === 'red'
              ? '即日対応が原則です。発覚次第、院長へ即報告し、事実確認→就業規則の懲戒条項適用→記録保存の流れで対応します。'
              : '改善の機会を提供します。リーダーが記録→1週間以内に面談→本人と共同で改善計画を作成→1ヶ月後にフォローアップを行います。'}
          </div>
        </div>
      )}

      {/* 登録済み一覧 */}
      {zoneRules(activeZone).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {zoneRules(activeZone).map(rule => (
            <div key={rule.id} style={{ padding: 14, background: z.bg, border: `1px solid ${z.border}`, borderRadius: 14 }}>
              {editingId === rule.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="タイトル" style={inputStyle} />
                  <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="説明" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
                  <AITextReviser
                    text={editForm.description}
                    onRevised={(revised) => setEditForm(p => ({ ...p, description: revised }))}
                    defaultPurpose="official"
                    purposes={['official', 'simple', 'warm']}
                    compact={true}
                  />
                  <input value={editForm.official_statement} onChange={e => setEditForm(p => ({ ...p, official_statement: e.target.value }))} placeholder="公式ステートメント" style={inputStyle} />
                  <input value={editForm.legal_basis} onChange={e => setEditForm(p => ({ ...p, legal_basis: e.target.value }))} placeholder="法的根拠" style={inputStyle} />
                  <input value={editForm.improvement_period} onChange={e => setEditForm(p => ({ ...p, improvement_period: e.target.value }))} placeholder="改善期間" style={inputStyle} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={saveEdit} disabled={savingId === 'edit'} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      {savingId === 'edit' ? '保存中...' : '💾 保存'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
                  </div>
                </div>
              ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${z.color}20`, color: z.color, fontWeight: 700 }}>
                      {z.icon} {z.label}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {CATEGORIES[rule.category] || rule.category}
                    </span>
                    {rule.improvement_period && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                        改善期間：{rule.improvement_period}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{rule.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>{rule.description}</div>
                  {rule.official_statement && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 6, fontStyle: 'italic', borderLeft: `3px solid ${z.color}` }}>
                      📋 {rule.official_statement}
                    </div>
                  )}
                  {rule.legal_basis && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>⚖️ {rule.legal_basis}</div>}
                  {(rule as any).behavioral_indicators && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>🎯 行動指標：{(rule as any).behavioral_indicators}</div>}
                  {(rule as any).related_achievement_principle && <div style={{ fontSize: 11, color: z.color, marginTop: 4 }}>⭐ {(rule as any).related_achievement_principle}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => startEdit(rule)} style={{ fontSize: 12, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>✏️</button>
                  <button onClick={() => deleteRule(rule.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>🗑</button>
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          {z.icon} {z.label}ゾーンの項目がまだありません。AIに提案してもらいましょう。
        </div>
      )}

      <AIDialogueButton contextType="evaluation" contextLabel="行動基準・4ゾーン" />
    </div>
  );
}
