'use client';

import { useState } from 'react';

type Step = 'input' | 'select' | 'explain' | 'done';

interface ExtractedTerm {
  term: string;
  reading?: string;
  industry: string;
  level: string;
  reason: string;
  checked: boolean;
}

interface Explanation {
  term: string;
  definition: string;
  example: string;
  related: string[];
  industry: string;
  level: string;
}

const INDUSTRY_LABELS: Record<string, string> = {
  IT: '💻 IT', 医療: '🏥 医療', 法律: '⚖️ 法律',
  金融: '💰 金融', マーケティング: '📣 マーケティング',
  経営: '💼 経営', 科学: '🔬 科学', 教育: '📚 教育', general: '🌐 一般',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: '🟢 初級', intermediate: '🟡 中級', advanced: '🔴 上級',
};

export function GlossaryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [inputText, setInputText] = useState('');
  const [terms, setTerms] = useState<ExtractedTerm[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/glossary/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await res.json();
      setTerms((data.terms ?? []).map((t: any) => ({ ...t, checked: true })));
      setStep('select');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplain = async () => {
    const selected = terms.filter(t => t.checked);
    if (selected.length === 0) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/glossary/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: selected, sourceText: inputText }),
      });
      const data = await res.json();
      const exps = (data.explanations ?? []).map((e: any) => {
        const term = selected.find(t => t.term === e.term);
        return { ...e, industry: term?.industry ?? 'general', level: term?.level ?? 'beginner' };
      });
      setExplanations(exps);
      setStep('explain');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/glossary-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          explanations.map(e => ({
            term: e.term,
            definition: e.definition,
            industry: e.industry,
            level: e.level,
            sourceText: inputText,
          }))
        ),
      });
      const data = await res.json();
      setSavedCount(data.count);
      setStep('done');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = (format: 'txt' | 'html' | 'table') => {
    let content = '';
    if (format === 'txt') {
      content = explanations.map(e =>
        `【${e.term}】\n${e.definition}\n例：${e.example}\n`
      ).join('\n---\n\n');
    } else if (format === 'html') {
      content = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>用語解説</title></head><body><h1>用語解説</h1>${
        explanations.map(e =>
          `<section><h2>${e.term}</h2><p>${e.definition}</p><p><em>例：${e.example}</em></p></section>`
        ).join('')
      }</body></html>`;
    } else {
      content = '用語,解説,業界,難易度\n' +
        explanations.map(e =>
          `"${e.term}","${e.definition}","${e.industry}","${e.level}"`
        ).join('\n');
    }
    const ext = format === 'html' ? 'html' : format === 'table' ? 'csv' : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `glossary.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('input'); setInputText(''); setTerms([]);
    setExplanations([]); setSavedCount(0);
  };

  return (
    <>
      {/* FABボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 152, zIndex: 9998,
          width: 48, height: 48, borderRadius: '50%',
          background: isOpen ? '#1D9E75' : '#1a1a2e',
          border: isOpen ? '2px solid #1D9E75' : '1px solid rgba(29,158,117,0.3)',
          color: '#fff', cursor: 'pointer', fontSize: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'all 0.2s',
        }}
        title="用語解説パネル"
      >
        📖
      </button>

      {/* パネル本体 */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 80, right: 110, zIndex: 9997,
          width: 420, maxHeight: '80vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 16, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        }}>
          {/* ヘッダー */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              📖 用語解説
              {step === 'select' && ` — 用語を選択 (${terms.filter(t=>t.checked).length}/${terms.length})`}
              {step === 'explain' && ' — 解説生成完了'}
              {step === 'done' && ' — 保存完了'}
            </span>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* コンテンツ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Step 1: テキスト入力 */}
            {step === 'input' && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>専門用語を含むテキストを貼り付けてください。AIが用語を自動抽出します。</p>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="テキストをここに貼り付け..."
                  rows={8}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
                <button
                  onClick={handleExtract}
                  disabled={!inputText.trim() || isLoading}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!inputText.trim() || isLoading) ? 0.5 : 1 }}
                >
                  {isLoading ? '抽出中...' : '🔍 用語を抽出する'}
                </button>
              </>
            )}

            {/* Step 2: 用語選択 */}
            {step === 'select' && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>解説する用語にチェックを入れてください。</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {terms.map((t, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: t.checked ? 'rgba(29,158,117,0.08)' : 'var(--bg-primary)' }}>
                      <input type="checkbox" checked={t.checked} onChange={e => {
                        const next = [...terms]; next[i].checked = e.target.checked; setTerms(next);
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.term}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
                          <span>{INDUSTRY_LABELS[t.industry] ?? t.industry}</span>
                          <span>{LEVEL_LABELS[t.level] ?? t.level}</span>
                          <span>{t.reason}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={reset} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
                    ← 戻る
                  </button>
                  <button
                    onClick={handleExplain}
                    disabled={terms.filter(t=>t.checked).length === 0 || isLoading}
                    style={{ flex: 2, padding: 8, borderRadius: 8, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (terms.filter(t=>t.checked).length === 0 || isLoading) ? 0.5 : 1 }}
                  >
                    {isLoading ? '解説生成中...' : `✅ ${terms.filter(t=>t.checked).length}件の解説を生成`}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: 解説表示 */}
            {step === 'explain' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {explanations.map((e, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{e.term}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(29,158,117,0.12)', color: '#1D9E75' }}>{INDUSTRY_LABELS[e.industry] ?? e.industry}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,166,35,0.12)', color: '#f5a623' }}>{LEVEL_LABELS[e.level] ?? e.level}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 4px' }}>{e.definition}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>例：{e.example}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => handleExport('txt')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>TXT</button>
                  <button onClick={() => handleExport('table')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>CSV表</button>
                  <button onClick={() => handleExport('html')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>HTML</button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 6, background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: isSaving ? 0.5 : 1 }}
                  >
                    {isSaving ? '保存中...' : '💾 用語集に保存'}
                  </button>
                </div>
              </>
            )}

            {/* Step 4: 完了 */}
            {step === 'done' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{savedCount}件を用語集に保存しました</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  <a href="/dashboard/glossary" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, background: '#1D9E75', color: '#fff', textDecoration: 'none' }}>📖 用語集を見る</a>
                  <button onClick={reset} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>続けて解説する</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
