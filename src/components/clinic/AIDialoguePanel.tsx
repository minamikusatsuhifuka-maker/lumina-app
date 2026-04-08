'use client';
import { useState, useEffect, useRef } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; timestamp: string; }

interface Props {
  contextType: string;
  contextLabel: string;
  contextData?: Record<string, any>;
  onInsightsExtracted?: (insights: any) => void;
}

const QUICK_MENUS: Record<string, { label: string; prompt: string }[]> = {
  grade: [
    { label: '等級基準をもっと具体的にしたい', prompt: '現在の等級基準をより具体的・測定可能にする提案をしてください' },
    { label: '昇格要件の妥当性を確認したい', prompt: '現在の昇格要件は適切ですか？改善点を教えてください' },
    { label: 'スタッフへの関わり方を相談', prompt: 'スタッフを育成する際のリードマネジメントのポイントを教えてください' },
  ],
  evaluation: [
    { label: '評価基準をAIに改善してもらう', prompt: '現在の評価基準を院長の哲学に沿って改善してください' },
    { label: '評価面談の進め方を相談', prompt: 'RWDEPCサイクルを使った評価面談の具体的な進め方を教えてください' },
    { label: 'マインド評価の具体的な方法', prompt: 'マインドを「実」として評価するための具体的な方法を教えてください' },
  ],
  'red-zone': [
    { label: 'ゾーン判断に迷っている事例がある', prompt: '具体的な事例について、どのゾーンに該当するか判断を手伝ってください' },
    { label: 'イエローゾーンの面談をどう進めるか', prompt: 'イエローゾーンスタッフへの改善面談の進め方をリードマネジメントで教えてください' },
    { label: '就業規則との整合���を確認したい', prompt: '現在のゾーン基準と就業規則の整合性を確認してください' },
  ],
  staff: [
    { label: 'スタッフの育成計画を考えたい', prompt: 'スタッフの現状と目標を踏まえた育成計画を提案してください' },
    { label: '採用面接で確認すべきポイント', prompt: '院長の哲学（先払い・リードマネジメント・ティール）に合う人材を見極めるポイントを教えてください' },
    { label: 'モチベーション低下への対応', prompt: '5大欲求の観点から、モチベーション低下の原因分析と対応策を教えてください' },
  ],
  strategy: [
    { label: '経営課題を整理したい', prompt: '現在の経営課題を5つの柱（技術・営業・採用育���・財務・事業戦略）で整理してください' },
    { label: '優先順位を決めたい', prompt: '重要度と緊急度のマトリクスで、今やるべきことを整理してください' },
    { label: '3年後のビジョンを描きたい', prompt: '同心円成長の哲学に基づいた3年後のクリニックビジョンを一緒に考えてください' },
  ],
  handbook: [
    { label: 'この章を分かりやすく改善したい', prompt: '現在の章の内容を読みやすく・実践しやすく改善してください' },
    { label: '院長の哲学を反映させたい', prompt: 'ティール組織・先払い哲学・リードマネジメントの観点でこの章を見直してください' },
  ],
};

export function AIDialoguePanel({ contextType, contextLabel, contextData, onInsightsExtracted }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [insights, setInsights] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const startSession = async () => {
    setLoading(true); setInsights(null); setTurnCount(0);
    const model = localStorage.getItem('lumina_ai_model') || 'claude';
    const res = await fetch(`/api/clinic/dialogue?contextType=${contextType}&contextLabel=${encodeURIComponent(contextLabel)}&model=${model}`);
    const data = await res.json();
    setSessionId(data.session.id);
    setMessages(data.messages);
    setLoading(false);
  };

  useEffect(() => { startSession(); }, [contextType]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const msg = input.trim();
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);

    const model = localStorage.getItem('lumina_ai_model') || 'claude';
    const res = await fetch('/api/clinic/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, userMessage: msg, model }) });
    const data = await res.json();
    setMessages(data.messages);
    setTurnCount(data.turnCount);
    if (data.insights) { setInsights(data.insights); onInsightsExtracted?.(data.insights); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ヘッダー */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(59,130,246,0.05))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>🤖 AI対話ブラッシュアップ</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{contextLabel}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{turnCount}回</span>
            <button onClick={startSession} style={{ fontSize: 10, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>最初から</button>
          </div>
        </div>
        <div style={{ marginTop: 8, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(turnCount / 5 * 100, 100)}%`, background: '#6c63ff', transition: 'width 0.5s', borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {turnCount < 5 ? `あと${5 - turnCount}回で洞察を自動抽出` : '✅ 洞察を抽出しました'}
        </div>
      </div>

      {/* メッセージ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* AIの初回メッセージ後にクイック提案を表示 */}
        {messages.length === 1 && messages[0].role === 'assistant' && QUICK_MENUS[contextType] && (
          <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>💡 よくある相談：</div>
            {QUICK_MENUS[contextType].map((item, i) => (
              <button key={i} onClick={() => { setInput(item.prompt); }} style={{
                width: '100%', padding: '8px 12px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left',
              }}>{item.label}</button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {msg.role === 'assistant' && <span style={{ fontSize: 10, color: '#6c63ff', fontWeight: 600, display: 'block', marginBottom: 4 }}>🤖 AI</span>}
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>考え中...</div>
          </div>
        )}
        {insights && (
          <div style={{ padding: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>✨ 対話から抽出した洞察</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{insights.summary}</div>
            {insights.criteria?.map((c: any, i: number) => <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>• {c.criterion}</div>)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="送信ボタンで送信" rows={2} style={{ flex: 1, padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'none' }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-end' }}>送信</button>
      </div>
    </div>
  );
}
