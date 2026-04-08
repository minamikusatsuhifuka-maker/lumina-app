'use client';
import { useState } from 'react';
import { VoiceInputButton } from '@/components/VoiceInputButton';

type WorkflowStep = {
  stepNumber: number;
  functionKey: string;
  functionName: string;
  icon: string;
  purpose: string;
  inputPrompt: string;
  outputDescription: string;
};

type WorkflowPlan = {
  title: string;
  description: string;
  estimatedMinutes: number;
  steps: WorkflowStep[];
};

const PRESETS = [
  '競合調査レポート作成',
  '新規事業アイデア検討',
  '市場トレンド把握',
  '採用戦略立案',
  'SNSコンテンツ作成',
  '業界動向まとめ',
  '学術文献調査',
  '経営戦略策定',
];

export default function WorkflowPage() {
  const [goal, setGoal] = useState('');
  const [workflow, setWorkflow] = useState<WorkflowPlan | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [executionMode, setExecutionMode] = useState<'auto' | 'step' | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [error, setError] = useState('');

  // ワークフロー提案
  const suggestWorkflow = async () => {
    if (!goal.trim()) return;
    setIsSuggesting(true);
    setError('');
    setWorkflow(null);
    setStepResults([]);
    setExecutionMode(null);
    setIsCompleted(false);
    try {
      const res = await fetch('/api/workflow/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'ワークフロー提案に失敗しました');
        return;
      }
      setWorkflow(data);
    } catch { setError('通信エラーが発生しました'); }
    finally { setIsSuggesting(false); }
  };

  // 1ステップ実行
  const executeStep = async (stepIndex: number) => {
    if (!workflow) return;
    const step = workflow.steps[stepIndex];
    setIsExecuting(true);
    setCurrentStep(stepIndex);
    try {
      const res = await fetch('/api/workflow/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionKey: step.functionKey,
          inputPrompt: step.inputPrompt,
          previousResults: stepResults,
        }),
      });
      const data = await res.json();
      const result = data.result || data.error || '結果なし';
      setStepResults(prev => {
        const next = [...prev];
        next[stepIndex] = result;
        return next;
      });
    } catch {
      setStepResults(prev => {
        const next = [...prev];
        next[stepIndex] = '（エラー: このステップはスキップされました）';
        return next;
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 全自動実行
  const executeAllAuto = async () => {
    if (!workflow) return;
    setExecutionMode('auto');
    setStepResults([]);
    setIsCompleted(false);

    const results: string[] = [];
    for (let i = 0; i < workflow.steps.length; i++) {
      setCurrentStep(i);
      setIsExecuting(true);
      try {
        const res = await fetch('/api/workflow/execute-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            functionKey: workflow.steps[i].functionKey,
            inputPrompt: workflow.steps[i].inputPrompt,
            previousResults: results,
          }),
        });
        const data = await res.json();
        results.push(data.result || '結果なし');
      } catch {
        results.push('（エラー: スキップ）');
      }
      setStepResults([...results]);
      setIsExecuting(false);
    }
    setIsCompleted(true);
  };

  // ステップ承認モード開始
  const startStepMode = () => {
    setExecutionMode('step');
    setStepResults([]);
    setCurrentStep(0);
    setIsCompleted(false);
  };

  // 次のステップへ
  const nextStep = () => {
    if (!workflow) return;
    if (currentStep + 1 >= workflow.steps.length) {
      setIsCompleted(true);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  // スキップ
  const skipStep = () => {
    setStepResults(prev => {
      const next = [...prev];
      next[currentStep] = '（スキップ）';
      return next;
    });
    nextStep();
  };

  // ライブラリに全結果保存
  const saveAllToLibrary = async () => {
    if (!workflow) return;
    const content = workflow.steps.map((s, i) =>
      `## Step ${s.stepNumber}: ${s.functionName}\n${s.purpose}\n\n${stepResults[i] || '（未実行）'}`
    ).join('\n\n---\n\n');

    await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'workflow',
        title: `ワークフロー: ${workflow.title}`,
        content,
        tags: 'ワークフロー',
        group_name: 'ワークフロー',
      }),
    });
    alert('ライブラリに保存しました！');
  };

  // リセット
  const reset = () => {
    setGoal('');
    setWorkflow(null);
    setStepResults([]);
    setExecutionMode(null);
    setIsCompleted(false);
    setCurrentStep(0);
    setError('');
  };

  const progress = workflow ? Math.round((stepResults.filter(Boolean).length / workflow.steps.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>⚡ AIワークフロー</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
        目的を入力するだけで、AIが最適な機能の使用順序を提案し自動実行します
      </p>

      {/* ① 目的入力エリア */}
      {!executionMode && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>🎯 何を達成したいですか？</div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="例：競合他社を調査してレポートを作りたい"
              rows={3}
              style={{ width: '100%', padding: '12px 48px 12px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
              <VoiceInputButton size="sm" onResult={(text) => setGoal(prev => prev + text)} />
            </div>
          </div>

          {/* プリセット */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setGoal(p)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: goal === p ? 'rgba(108,99,255,0.1)' : 'var(--bg-primary)', color: goal === p ? '#6c63ff' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: goal === p ? 600 : 400 }}>
                {p}
              </button>
            ))}
          </div>

          <button onClick={suggestWorkflow} disabled={isSuggesting || !goal.trim()}
            style={{ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: isSuggesting || !goal.trim() ? 'not-allowed' : 'pointer', background: isSuggesting || !goal.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, opacity: !goal.trim() ? 0.5 : 1 }}>
            {isSuggesting ? '✨ AIが考え中...' : '✨ ワークフローを提案してもらう'}
          </button>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#ef4444' }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      )}

      {/* ② ワークフロー提案表示 */}
      {workflow && !executionMode && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>✨ {workflow.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{workflow.description}</div>
            </div>
            <span style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(108,99,255,0.1)', color: '#6c63ff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
              約{workflow.estimatedMinutes}分
            </span>
          </div>

          {/* ステップカード */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {workflow.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {step.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Step {step.stepNumber}: {step.functionName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{step.purpose}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>→ {step.outputDescription}</span>
              </div>
            ))}
          </div>

          {/* モード選択 */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={executeAllAuto}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              ⚡ 全自動で実行
            </button>
            <button onClick={startStepMode}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              👆 ステップ確認しながら実行
            </button>
          </div>
        </div>
      )}

      {/* ③ 実行中UI — 全自動モード */}
      {executionMode === 'auto' && workflow && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>⚡ {workflow.title} — 全自動実行中</div>
            <span style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600 }}>{progress}%</span>
          </div>
          {/* プログレスバー */}
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, marginBottom: 20 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>

          {workflow.steps.map((step, i) => {
            const done = !!stepResults[i];
            const active = currentStep === i && isExecuting;
            return (
              <div key={i} style={{ marginBottom: 12, opacity: done || active ? 1 : 0.4 }}>
                <div onClick={() => done && setExpandedStep(expandedStep === i ? null : i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: active ? 'rgba(108,99,255,0.06)' : 'var(--bg-secondary)', border: `1px solid ${active ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`, borderRadius: 10, cursor: done ? 'pointer' : 'default' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: done ? '#22c55e' : active ? '#6c63ff' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {done ? '✓' : step.stepNumber}
                  </span>
                  <span style={{ fontSize: 14 }}>{step.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{step.functionName}</span>
                  {active && <span style={{ fontSize: 11, color: '#6c63ff', animation: 'voicePulse 1.5s infinite' }}>実行中...</span>}
                  {done && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expandedStep === i ? '▲' : '▼'}</span>}
                </div>
                {expandedStep === i && stepResults[i] && (
                  <div style={{ padding: '12px 16px', margin: '-1px 0 0', border: '1px solid var(--border)', borderTopColor: 'transparent', borderRadius: '0 0 10px 10px', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                    {stepResults[i]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ③ 実行中UI — ステップ承認モード */}
      {executionMode === 'step' && workflow && !isCompleted && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            ステップ {currentStep + 1} / {workflow.steps.length}
          </div>
          {/* プログレスバー */}
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 20 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #6c63ff, #00d4b8)', borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>

          {/* 現在のステップ */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {workflow.steps[currentStep].icon}
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Step {workflow.steps[currentStep].stepNumber}: {workflow.steps[currentStep].functionName}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{workflow.steps[currentStep].purpose}</div>
              </div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>入力プロンプト：</div>
              {workflow.steps[currentStep].inputPrompt}
            </div>

            {/* 結果表示 */}
            {stepResults[currentStep] && (
              <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
                {stepResults[currentStep]}
              </div>
            )}

            {/* ボタン */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!stepResults[currentStep] ? (
                <>
                  <button onClick={() => executeStep(currentStep)} disabled={isExecuting}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: isExecuting ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: isExecuting ? 'not-allowed' : 'pointer' }}>
                    {isExecuting ? '⏳ 実行中...' : '▶️ このステップを実行'}
                  </button>
                  <button onClick={skipStep}
                    style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    スキップ →
                  </button>
                </>
              ) : (
                <button onClick={nextStep}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {currentStep + 1 >= workflow.steps.length ? '✅ 完了' : '次のステップへ →'}
                </button>
              )}
            </div>
          </div>

          {/* 完了済みステップ一覧 */}
          {stepResults.filter(Boolean).length > 0 && currentStep > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>完了済みステップ：</div>
          )}
          {workflow.steps.slice(0, currentStep).map((step, i) => (
            stepResults[i] && (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <span style={{ color: '#22c55e' }}>✓</span>
                {step.icon} {step.functionName}
              </div>
            )
          ))}
        </div>
      )}

      {/* ④ 完了サマリー */}
      {isCompleted && workflow && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, padding: 24, marginTop: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>ワークフロー完了！</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{workflow.title} — {workflow.steps.length}ステップ完了</div>
          </div>

          {/* 結果一覧 */}
          {workflow.steps.map((step, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ color: stepResults[i] && !stepResults[i].startsWith('（') ? '#22c55e' : 'var(--text-muted)' }}>
                  {stepResults[i] && !stepResults[i].startsWith('（') ? '✓' : '○'}
                </span>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{step.functionName}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expandedStep === i ? '▲' : '▼'}</span>
              </div>
              {expandedStep === i && stepResults[i] && (
                <div style={{ padding: '12px 16px', margin: '-1px 0 0', border: '1px solid var(--border)', borderTopColor: 'transparent', borderRadius: '0 0 8px 8px', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>
                  {stepResults[i]}
                </div>
              )}
            </div>
          ))}

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={saveAllToLibrary}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📚 全結果をライブラリに保存
            </button>
            <button onClick={reset}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              🔄 新しいワークフローを開始
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
