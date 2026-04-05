'use client';
import { useState } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';

type Step = {
  id: string;
  label: string;
  api: string;
  payload: (input: string, prev: string) => object;
  resultKey: string;
};

type Workflow = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  inputLabel: string;
  inputPlaceholder: string;
  steps: Step[];
  color: string;
};

const WORKFLOWS: Workflow[] = [
  {
    id: 'competitor',
    title: '競合分析レポート',
    desc: 'Web収集→AI分析→差別化戦略を自動生成',
    icon: '🏆',
    color: '#6c63ff',
    inputLabel: '競合他社名または業界',
    inputPlaceholder: '例：〇〇株式会社、SaaS業界',
    steps: [
      { id: 'search', label: 'Web情報収集', api: '/api/websearch', payload: (input) => ({ query: `${input} 競合分析 サービス 特徴 2026年`, maxTokens: 2000 }), resultKey: 'result' },
      { id: 'analyze', label: 'AI競合分析', api: '/api/analyze', payload: (_input, prev) => ({ analysisType: 'competitor', content: prev }), resultKey: 'result' },
      { id: 'strategy', label: '差別化戦略生成', api: '/api/strategy', payload: (input, prev) => ({ strategyType: 'brand', content: `競合：${input}\n\n分析結果：${prev}` }), resultKey: 'result' },
    ],
  },
  {
    id: 'market',
    title: '市場調査レポート',
    desc: 'Web収集→トレンド分析→機会発見を自動化',
    icon: '📈',
    color: '#1d9e75',
    inputLabel: '調査する市場・業界',
    inputPlaceholder: '例：医療AI市場、フードデリバリー',
    steps: [
      { id: 'search', label: 'Web情報収集', api: '/api/websearch', payload: (input) => ({ query: `${input} 市場規模 トレンド 2026年`, maxTokens: 2000 }), resultKey: 'result' },
      { id: 'analyze', label: 'トレンド分析', api: '/api/analyze', payload: (_input, prev) => ({ analysisType: 'trends', content: prev }), resultKey: 'result' },
      { id: 'action', label: 'アクションプラン', api: '/api/analyze', payload: (_input, prev) => ({ analysisType: 'action', content: prev }), resultKey: 'result' },
    ],
  },
  {
    id: 'content',
    title: 'コンテンツ制作',
    desc: 'トレンド収集→note記事→SNS投稿を自動生成',
    icon: '✍️',
    color: '#f5a623',
    inputLabel: 'コンテンツのテーマ',
    inputPlaceholder: '例：AI活用術、副業で月10万円',
    steps: [
      { id: 'note', label: 'note記事収集', api: '/api/note', payload: (input) => ({ query: input, maxResults: 5 }), resultKey: 'result' },
      { id: 'write', label: 'ブログ記事生成', api: '/api/generate', payload: (input, prev) => ({ mode: 'blog', prompt: `テーマ：${input}\n参考情報：${prev.slice(0, 1000)}`, style: 'casual', length: 'medium', audience: 'general' }), resultKey: 'result' },
      { id: 'sns', label: 'SNS投稿生成', api: '/api/generate', payload: (_input, prev) => ({ mode: 'sns_twitter', prompt: `以下の記事をX投稿に要約：${prev.slice(0, 500)}`, style: 'casual', length: 'short', audience: 'general' }), resultKey: 'result' },
    ],
  },
  {
    id: 'recruit',
    title: '採用強化パック',
    desc: '採用戦略→求人票→面接質問を自動生成',
    icon: '👥',
    color: '#ec4899',
    inputLabel: '採用するポジション',
    inputPlaceholder: '例：フロントエンドエンジニア、営業マネージャー',
    steps: [
      { id: 'strategy', label: '採用戦略立案', api: '/api/strategy', payload: (input) => ({ strategyType: 'hiring', content: `ポジション：${input}` }), resultKey: 'result' },
      { id: 'job', label: '求人票生成', api: '/api/generate', payload: (input, prev) => ({ mode: 'blog', prompt: `以下の採用戦略を元に求人票を作成：\nポジション：${input}\n戦略：${prev.slice(0, 500)}`, style: 'formal', length: 'medium', audience: 'business' }), resultKey: 'result' },
      { id: 'interview', label: '面接質問生成', api: '/api/analyze', payload: (input) => ({ analysisType: 'action', content: `${input}の面接質問リストを10個作成してください` }), resultKey: 'result' },
    ],
  },
];

export default function WorkflowPage() {
  const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stepResults, setStepResults] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [usedModel, setUsedModel] = useState<'claude' | 'gemini' | null>(null);

  const runWorkflow = async () => {
    if (!selectedWf || !input.trim()) return;
    setUsedModel(getSavedModel());
    setRunning(true);
    setStepResults([]);
    setCurrentStep(0);
    setProgress(0);

    let prevResult = '';
    const results: string[] = [];

    for (let i = 0; i < selectedWf.steps.length; i++) {
      const step = selectedWf.steps[i];
      setCurrentStep(i);
      setProgress(Math.round((i / selectedWf.steps.length) * 100));

      try {
        const payload = step.payload(input, prevResult);
        const res = await fetch(step.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // ストリーミング対応
        if (res.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let accumulated = '';
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const json = JSON.parse(raw);
                // カスタムSSE形式（analyze/websearch/strategy/note）
                if (json.type === 'text') accumulated += json.content;
                // 生Anthropic SSE形式（generate API経由）
                if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') accumulated += json.delta.text;
              } catch {}
            }
          }
          prevResult = accumulated;
          results.push(accumulated);
        } else {
          const data = await res.json();
          prevResult = data[step.resultKey] || '';
          results.push(prevResult);
        }
      } catch {
        results.push('（このステップはスキップされました）');
      }

      setStepResults([...results]);
    }

    setProgress(100);
    setCurrentStep(-1);
    setRunning(false);

    // ライブラリに自動保存
    await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'web',
        title: `ワークフロー: ${selectedWf.title} - ${input}`,
        content: results.join('\n\n---\n\n'),
        tags: 'ワークフロー',
        group_name: 'ワークフロー',
      }),
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>⚡ ワンクリック自動ワークフロー</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>テンプレートを選ぶだけで、複数の機能を自動的に連続実行します</p>
      </div>

      {/* ワークフロー選択 */}
      {!selectedWf && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {WORKFLOWS.map(wf => (
            <div key={wf.id} onClick={() => setSelectedWf(wf)} style={{ padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = wf.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{wf.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{wf.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>{wf.desc}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {wf.steps.map((s, i) => (
                  <div key={s.id} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: `${wf.color}30`, color: wf.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{i + 1}</span>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 実行画面 */}
      {selectedWf && (
        <div>
          <button onClick={() => { setSelectedWf(null); setStepResults([]); setInput(''); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', marginBottom: 20 }}>← 戻る</button>

          <div style={{ padding: 20, background: `${selectedWf.color}10`, border: `1px solid ${selectedWf.color}40`, borderRadius: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>{selectedWf.icon}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedWf.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedWf.desc}</div>
              </div>
            </div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>{selectedWf.inputLabel}</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder={selectedWf.inputPlaceholder} style={{ flex: 1, padding: '11px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
              <button onClick={runWorkflow} disabled={running || !input.trim()} style={{ padding: '11px 24px', borderRadius: 8, border: 'none', cursor: running || !input.trim() ? 'not-allowed' : 'pointer', background: running || !input.trim() ? 'rgba(108,99,255,0.3)' : `linear-gradient(135deg, ${selectedWf.color}, ${selectedWf.color}cc)`, color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
                {running ? `実行中... ${progress}%` : '⚡ 実行開始'}
              </button>
            </div>
          </div>

          {/* ステップ進捗 */}
          {(running || stepResults.length > 0) && (
            <div style={{ marginBottom: 20 }}>
              {running && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>{selectedWf.steps[currentStep]?.label || '完了'}...</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${selectedWf.color}, ${selectedWf.color}cc)`, borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              {selectedWf.steps.map((step, i) => (
                <div key={step.id} style={{ marginBottom: 16, opacity: stepResults[i] ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: stepResults[i] ? selectedWf.color : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                      {stepResults[i] ? '✓' : i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{step.label}</span>
                    {currentStep === i && running && <span style={{ fontSize: 11, color: selectedWf.color }}>実行中...</span>}
                    {stepResults[i] && usedModel && <ModelBadge model={usedModel} />}
                  </div>
                  {stepResults[i] && (
                    <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                      {stepResults[i].slice(0, 500)}{stepResults[i].length > 500 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
