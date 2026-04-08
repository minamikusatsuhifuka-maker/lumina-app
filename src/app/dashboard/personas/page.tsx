'use client';
import { useState, useEffect } from 'react';

const INDUSTRY_PRESETS = [
  { industry: '医療・クリニック', role: '院長・経営者', icon: '🏥', desc: '皮膚科・美容医療・クリニック経営' },
  { industry: 'IT・テクノロジー', role: 'CTO・エンジニア', icon: '💻', desc: 'SaaS・AI・スタートアップ' },
  { industry: 'マーケティング', role: 'CMO・マーケター', icon: '📣', desc: 'デジタルマーケ・SNS・コンテンツ' },
  { industry: 'コンサルティング', role: 'コンサルタント', icon: '📊', desc: '経営・戦略・組織変革' },
  { industry: '教育・コーチング', role: 'コーチ・講師', icon: '🎓', desc: '人材育成・キャリア支援' },
  { industry: '飲食・小売', role: 'オーナー・店長', icon: '🍽️', desc: '店舗経営・接客・マーケ' },
  { industry: '不動産', role: '社長・営業', icon: '🏠', desc: '売買・賃貸・投資' },
  { industry: 'フリーランス', role: 'フリーランサー', icon: '🆓', desc: 'ライター・デザイナー・エンジニア' },
];

const GENERATE_PROMPT = (industry: string, role: string, name: string) => `
あなたは${industry}業界の${role}として20年以上の経験を持つ、${name}というAIアドバイザーです。

【専門知識】
- ${industry}業界の最新トレンドと課題を熟知している
- ${role}としての実務経験と経営視点を持つ
- データと事例をもとに具体的なアドバイスができる

【コミュニケーションスタイル】
- 専門用語は適切に使いつつ、わかりやすく説明する
- 抽象論より具体的なアクションプランを提示する
- 業界特有の課題に寄り添い、実践的な提案をする
- 必要に応じて最新の業界情報・事例を参照する

常に${industry}業界の${role}の視点で回答してください。
`;

export default function PersonasPage() {
  const [personas, setPersonas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', role: '', system_prompt: '' });
  const [chatPersona, setChatPersona] = useState<any>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch('/api/personas').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setPersonas(data);
    });
  }, []);

  const selectPreset = (preset: typeof INDUSTRY_PRESETS[0]) => {
    const name = `${preset.industry}特化AIアドバイザー`;
    setForm({
      name,
      industry: preset.industry,
      role: preset.role,
      system_prompt: GENERATE_PROMPT(preset.industry, preset.role, name).trim(),
    });
    setShowForm(true);
  };

  const createPersona = async () => {
    if (!form.name || !form.industry) return;
    const res = await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      setPersonas(prev => prev.map(p => ({ ...p, is_active: 0 })));
      setPersonas(prev => [{ id: data.id, ...form, is_active: 1 }, ...prev]);
      setShowForm(false);
      setForm({ name: '', industry: '', role: '', system_prompt: '' });
    }
  };

  const chat = async () => {
    if (!chatInput.trim() || !chatPersona) return;
    const newHistory = [...chatHistory, { role: 'user', content: chatInput }];
    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: chatInput,
          mode: 'free',
          style: 'formal',
          length: 'medium',
          audience: 'business',
          systemOverride: chatPersona.system_prompt,
        }),
      });

      if (!res.body) { setChatLoading(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.delta?.text) {
              text += json.delta.text;
              setChatHistory(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: text };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (e) {}
    setChatLoading(false);
  };

  const activePersona = personas.find(p => p.is_active);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🤖 カスタムAIペルソナ</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>業界・職種に特化したAIアドバイザーを設定してください</p>

      {/* アクティブなペルソナ */}
      {activePersona && (
        <div style={{ background: 'var(--accent-soft)', border: '2px solid #6c63ff', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>現在のアクティブペルソナ</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{activePersona.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activePersona.industry} / {activePersona.role}</div>
          </div>
          <button onClick={() => { setChatPersona(activePersona); setChatHistory([]); }}
            style={{ marginLeft: 'auto', padding: '8px 16px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            💬 チャット開始
          </button>
        </div>
      )}

      {/* チャットUI */}
      {chatPersona && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-soft)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>💬 {chatPersona.name} とチャット</span>
            <button onClick={() => setChatPersona(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div style={{ minHeight: 200, maxHeight: 400, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatHistory.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                {chatPersona.name}に何でも質問してください
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.7,
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 14px' }}>考え中...</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder={`${chatPersona.name}に質問する...`}
              style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--accent-soft)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
            <button onClick={chat} disabled={chatLoading || !chatInput.trim()} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>送信</button>
          </div>
        </div>
      )}

      {/* プリセット選択 */}
      {!showForm && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>業界プリセットから選ぶ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {INDUSTRY_PRESETS.map(p => (
              <button key={p.industry} onClick={() => selectPreset(p)} style={{
                padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{p.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{p.industry}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} style={{ marginTop: 10, width: '100%', padding: '10px', background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
            ＋ カスタムペルソナを作成
          </button>
        </div>
      )}

      {/* カスタム作成フォーム */}
      {showForm && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-soft)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>ペルソナを設定</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ペルソナ名</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例：医療経営AIアドバイザー"
                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>業界</div>
              <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                placeholder="例：医療・クリニック"
                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>役割・職種</div>
            <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="例：院長・経営者"
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>システムプロンプト（AIへの指示）</div>
            <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
              placeholder="このAIがどのように振る舞うか指示を入力..."
              style={{ width: '100%', minHeight: 120, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>キャンセル</button>
            <button onClick={createPersona} style={{ padding: '9px 24px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🤖 作成・有効化</button>
          </div>
        </div>
      )}

      {/* 既存ペルソナ一覧 */}
      {personas.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>作成済みペルソナ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {personas.map(p => (
              <div key={p.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${p.is_active ? '#6c63ff' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {p.is_active && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--text-secondary)', fontWeight: 600 }}>アクティブ</span>}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.industry} / {p.role}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setChatPersona(p); setChatHistory([]); }}
                    style={{ padding: '5px 12px', background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    💬 チャット
                  </button>
                  <button onClick={async () => {
                    await fetch('/api/personas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) });
                    setPersonas(prev => prev.filter(x => x.id !== p.id));
                  }} style={{ padding: '5px 10px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>削除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
