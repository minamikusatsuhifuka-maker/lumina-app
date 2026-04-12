'use client';
import { useState, useEffect } from 'react';

const PURPOSES = [
  { key: 'handbook',  icon: '📖', label: 'ハンドブック・マニュアル', color: '#6c63ff', scoreLabel: '理念一致度スコア', scoreDesc: 'インサイドアウト・先払い・リードマネジメントとの一致度' },
  { key: 'staff',     icon: '📢', label: 'スタッフへのお知らせ・連絡文', color: '#1D9E75', scoreLabel: '伝達効果スコア', scoreDesc: '読んで行動したくなるか・温かさ・明確さ' },
  { key: 'patient',   icon: '🏥', label: '患者向け説明文・案内文', color: '#f59e0b', scoreLabel: '安心・信頼スコア', scoreDesc: 'わかりやすさ・不安を取り除く表現・行動を促すか' },
  { key: 'recruit',   icon: '👥', label: '採用・求人文書', color: '#06b6d4', scoreLabel: '共感・応募意欲スコア', scoreDesc: 'クリニックの魅力・一緒に働きたいと思えるか' },
  { key: 'message',   icon: '💌', label: '院長メッセージ・ご挨拶文', color: '#ec4899', scoreLabel: '人間性・信頼スコア', scoreDesc: '理念の深さ・人間性・読んで会いたくなるか' },
];

const DIRECTIONS = [
  { key: 'philosophy', icon: '🌟', label: '理念・哲学型', desc: 'クリニックの理念・先払い哲学を体現した文章に' },
  { key: 'lead',       icon: '🤝', label: 'リードマネジメント型', desc: '内発的動機を引き出す・命令ではなく問いかけに' },
  { key: 'story',      icon: '📖', label: 'ストーリー型', desc: '物語形式で心に届く文章に' },
  { key: 'warm',       icon: '😊', label: '温かみ・共感型', desc: '感謝と共感を込めた、読んで安心できる文章に' },
  { key: 'concrete',   icon: '✅', label: '具体的行動型', desc: '「明日からこう動こう」と思える実践的な文章に' },
  { key: 'dialogue',   icon: '💭', label: '問いかけ・内省型', desc: '読んだあと自分で考えたくなる文章に' },
];

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++; }
      const dataLines = tableLines.filter(l => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
      if (dataLines.length > 0) {
        const rows = dataLines.map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">';
        rows.forEach((cells, idx) => {
          html += '<tr style="border-bottom:1px solid var(--border)">';
          cells.forEach(cell => {
            const tag = idx === 0 ? 'th' : 'td';
            const style = idx === 0 ? 'padding:5px 8px;text-align:left;font-weight:700;color:var(--text-primary);background:var(--bg-secondary)' : 'padding:5px 8px;color:var(--text-secondary)';
            html += `<${tag} style="${style}">${cell.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
        result.push(html);
      }
      continue;
    }
    if (/^## (.+)$/.test(line)) { result.push(`<h2 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border)">${line.replace(/^## /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h2>`); i++; continue; }
    if (/^### (.+)$/.test(line)) { result.push(`<h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:12px 0 4px">${line.replace(/^### /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h3>`); i++; continue; }
    if (/^# (.+)$/.test(line)) { result.push(`<h1 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 10px">${line.replace(/^# /, '')}</h1>`); i++; continue; }
    if (/^---$/.test(line.trim())) { result.push('<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">'); i++; continue; }
    if (/^> (.+)$/.test(line)) { result.push(`<div style="padding:7px 12px;border-left:3px solid #6c63ff;background:rgba(108,99,255,0.06);margin:5px 0;font-size:12px;color:var(--text-secondary)">${line.replace(/^> /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`); i++; continue; }
    if (/^[-*] (.+)$/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] (.+)$/.test(lines[i])) { items.push(`<li style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.6">${lines[i].replace(/^[-*] /, '').replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>')}</li>`); i++; }
      result.push(`<ul style="padding-left:16px;margin:6px 0">${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') { result.push('<div style="height:6px"></div>'); i++; continue; }
    result.push(`<p style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.8">${line.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>')}</p>`);
    i++;
  }
  return result.join('');
}

export default function TextImprovePage() {
  const [inputText, setInputText] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  const [evalResult, setEvalResult] = useState('');
  const [evalLoading, setEvalLoading] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);

  const [direction, setDirection] = useState('');
  const [freeInstruction, setFreeInstruction] = useState('');
  const [improvedText, setImprovedText] = useState('');
  const [improveLoading, setImproveLoading] = useState(false);

  const [finalText, setFinalText] = useState('');
  const [message, setMessage] = useState('');

  const [score, setScore] = useState<{ score: number; reason: string; points: string[] } | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  const [customPurpose, setCustomPurpose] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    const loading = evalLoading || improveLoading;
    if (!loading) return;
    setStepProgress(0);
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + (88 / (180)), 88);
      setStepProgress(Math.round(current));
      if (current >= 88) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [evalLoading, improveLoading]);

  const evaluate = async () => {
    if (!inputText.trim()) return;
    setEvalLoading(true);
    setEvalResult('');
    setScore(null);
    try {
      const [evalRes, scoreRes] = await Promise.all([
        fetch('/api/clinic/handbooks/enhance', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'evaluate',
            chapterContent: inputText,
            purposeContext: isCustom ? customPurpose : purpose.key,
          }),
        }),
        fetch('/api/clinic/text-improve/score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: inputText,
            purpose: isCustom ? 'custom' : purpose.key,
            purposeLabel: isCustom ? customPurpose : purpose.label,
            customPurpose: isCustom ? customPurpose : undefined,
          }),
        }),
      ]);
      const evalData = await evalRes.json();
      const scoreData = await scoreRes.json();
      if (evalData.result) setEvalResult(evalData.result);
      if (scoreData.score !== undefined) setScore(scoreData);
      setStepProgress(100);
    } catch {}
    finally { setEvalLoading(false); }
  };

  const improve = async (dir: string, free?: string) => {
    if (!inputText.trim()) return;
    setImproveLoading(true);
    setImprovedText('');
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: free ? 'rewrite' : 'template',
          template: dir,
          instruction: free || (isCustom ? `「${customPurpose}」として最適化してください` : undefined),
          chapterContent: inputText,
          purposeContext: isCustom ? customPurpose : purpose.key,
        }),
      });
      const data = await res.json();
      if (data.result) { setImprovedText(data.result); setStepProgress(100); }
    } catch {}
    finally { setImproveLoading(false); }
  };

  const adopt = () => {
    setFinalText(improvedText);
    setInputText(improvedText);
    setWizardStep(1);
    setEvalResult('');
    setImprovedText('');
    setScore(null);
    setStepProgress(0);
    setMessage('✅ 改善案を本文に採用しました。さらに改善できます！');
    setTimeout(() => setMessage(''), 3000);
  };

  const purposeColor = purpose.color;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      <style>{`@keyframes textImproveSlide { 0% { transform: translateX(0%); } 100% { transform: translateX(350%); } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>✍️ テキスト AI改善エディタ</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>文章を入力して目的を選び、AIと一緒にブラッシュアップしましょう</p>
      </div>

      {message && <div style={{ padding: '8px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, fontSize: 13, color: '#1D9E75', marginBottom: 16 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* 左：テキスト入力エリア */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>① 文章の目的を選択</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PURPOSES.map(p => (
                <button key={p.key} onClick={() => { setPurpose(p); setIsCustom(false); setCustomPurpose(''); setScore(null); setEvalResult(''); }}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '2px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: purpose.key === p.key ? `${p.color}18` : 'var(--bg-card)', borderColor: purpose.key === p.key ? p.color : 'var(--border)', color: purpose.key === p.key ? p.color : 'var(--text-muted)' }}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>

            {/* 自由入力欄 */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setIsCustom(!isCustom)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '2px solid',
                    background: isCustom ? 'rgba(148,163,184,0.15)' : 'var(--bg-card)',
                    borderColor: isCustom ? '#6c63ff' : 'var(--border)',
                    color: isCustom ? '#6c63ff' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✏️ その他・自由入力
                </button>
                {isCustom && (
                  <input
                    value={customPurpose}
                    onChange={e => setCustomPurpose(e.target.value)}
                    placeholder="例：患者様へのお礼状、スタッフ表彰メッセージ、SNS投稿文..."
                    style={{
                      flex: 1, padding: '6px 12px', borderRadius: 8,
                      background: 'var(--bg-card)', border: '2px solid #6c63ff',
                      color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    }}
                  />
                )}
              </div>
              {isCustom && customPurpose.trim() && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#6c63ff', padding: '4px 10px', background: 'rgba(108,99,255,0.08)', borderRadius: 6, display: 'inline-block' }}>
                  🤖 AIが「{customPurpose}」に最適な採点・評価・改善を自動判断します
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>② 文章を入力</div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inputText.length}文字</span>
            </div>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`${purpose.label}の文章をここに入力してください...\n\nどんな文章でも構いません。クリニックのお知らせ、患者向け案内、スタッフへのメッセージなど。`}
              style={{ width: '100%', minHeight: 300, padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.8, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {(improvedText || improveLoading) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📊 Before / After 比較</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Before（現在）</div>
                  <div style={{ padding: 12, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', height: 480, overflowY: 'auto' }}>
                    {inputText}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', marginBottom: 4 }}>After（AI改善案）</div>
                  <div style={{ padding: 12, background: 'rgba(29,158,117,0.04)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', height: 480, overflowY: 'auto' }}>
                    {improveLoading ? '生成中...' : improvedText}
                  </div>
                </div>
              </div>
              {improvedText && !improveLoading && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={adopt}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    ✅ この改善案を採用する
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(improvedText).then(() => setMessage('📋 コピーしました！'))}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    📋 コピー
                  </button>
                  <button onClick={() => { setWizardStep(2); setImprovedText(''); setStepProgress(0); }}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    別の方向を試す
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右：AI改善ウィザード */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={{ padding: 14, background: `${purposeColor}08`, border: `1px solid ${purposeColor}30`, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: score ? 10 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: purposeColor }}>
                📊 {isCustom ? (customPurpose ? `「${customPurpose}」スコア` : 'カスタムスコア') : purpose.scoreLabel}
              </div>
              <button onClick={async () => {
                if (!inputText.trim()) return;
                setScoreLoading(true); setScore(null);
                try {
                  const res = await fetch('/api/clinic/text-improve/score', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
            text: inputText,
            purpose: isCustom ? 'custom' : purpose.key,
            purposeLabel: isCustom ? customPurpose : purpose.label,
            customPurpose: isCustom ? customPurpose : undefined,
          }),
                  });
                  const data = await res.json();
                  if (data.score !== undefined) setScore(data);
                } catch {} finally { setScoreLoading(false); }
              }} disabled={scoreLoading || !inputText.trim()}
                style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: scoreLoading ? `${purposeColor}40` : purposeColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {scoreLoading ? '採点中...' : score ? '再採点' : '📊 採点する'}
              </button>
            </div>
            {score && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${score.score}%`, height: '100%', borderRadius: 5, background: score.score >= 80 ? '#1D9E75' : score.score >= 60 ? '#f59e0b' : '#ef4444', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: score.score >= 80 ? '#1D9E75' : score.score >= 60 ? '#f59e0b' : '#ef4444', minWidth: 44 }}>{score.score}点</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{score.reason}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {score.points.map((p, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', padding: '3px 8px', background: 'var(--bg-card)', borderRadius: 5, borderLeft: `3px solid ${purposeColor}60` }}>{p}</div>
                  ))}
                </div>
              </div>
            )}
            {!score && !scoreLoading && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {isCustom
                  ? customPurpose ? `「${customPurpose}」の目的に合わせてAIが採点します` : '目的を入力するとAIが自動で採点基準を判断します'
                  : purpose.scoreDesc}
              </div>
            )}
          </div>

          <div style={{ padding: 14, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>🤖 AI改善ウィザード</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3].map(s => (
                  <div key={s} style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: wizardStep === s ? '#6c63ff' : wizardStep > s ? '#1D9E75' : 'var(--bg-card)', color: wizardStep === s || wizardStep > s ? '#fff' : 'var(--text-muted)', border: `1px solid ${wizardStep === s ? '#6c63ff' : wizardStep > s ? '#1D9E75' : 'var(--border)'}` }}>
                    {wizardStep > s ? '✓' : s}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>{(evalLoading || improveLoading) ? '処理中...' : stepProgress === 100 ? '完了 ✓' : `Step ${wizardStep} / 3`}</span>
                <span style={{ color: stepProgress === 100 ? '#1D9E75' : 'var(--text-muted)' }}>{(evalLoading || improveLoading) ? '⏳' : `${stepProgress}%`}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(108,99,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: (evalLoading || improveLoading) ? '5%' : `${stepProgress}%`, background: stepProgress === 100 ? 'linear-gradient(90deg,#1D9E75,#4ade80)' : 'linear-gradient(90deg,#6c63ff,#8b5cf6)', borderRadius: 3, transition: 'width 0.5s ease' }} />
              </div>
              {(evalLoading || improveLoading) && (
                <div style={{ marginTop: 3, height: 4, background: 'rgba(108,99,255,0.1)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: '-40%', height: '100%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(108,99,255,0.8),transparent)', animation: 'textImproveSlide 1.2s ease-in-out infinite' }} />
                </div>
              )}
            </div>

            {wizardStep === 1 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Step 1 — まず現状を評価する</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>AIがこの文章を読んで「改善すべき点」を教えてくれます</div>
                <button onClick={evaluate} disabled={evalLoading || !inputText.trim()}
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: evalLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg,#6c63ff,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {evalLoading ? '評価中...' : '🔍 この文章を評価する'}
                </button>
                {evalResult && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 280, overflowY: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(evalResult) }} />
                    <button onClick={() => { setWizardStep(2); setStepProgress(0); }}
                      style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ✅ 評価を確認した → Step 2へ
                    </button>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Step 2 — 改善の方向を選ぶ</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>どんな方向に改善しますか？</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {DIRECTIONS.map(d => (
                    <button key={d.key} onClick={() => { setDirection(d.key); improve(d.key); setWizardStep(3); setStepProgress(0); }}
                      disabled={improveLoading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.icon} {d.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>または自由に指示：</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={freeInstruction} onChange={e => setFreeInstruction(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && freeInstruction.trim()) { improve('', freeInstruction); setWizardStep(3); setStepProgress(0); } }}
                    placeholder="例：もっと短く、要点だけ..."
                    style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                  <button onClick={() => { if (freeInstruction.trim()) { improve('', freeInstruction); setWizardStep(3); setStepProgress(0); } }}
                    disabled={!freeInstruction.trim() || improveLoading}
                    style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    改善
                  </button>
                </div>
                <button onClick={() => { setWizardStep(1); setStepProgress(stepProgress === 100 ? 100 : 0); }}
                  style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Step 1に戻る
                </button>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Step 3 — 改善案を確認・採用</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>左のBefore/Afterを比較して、良ければ採用してください</div>
                {improveLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>改善案を生成中...</div>
                ) : improvedText ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={adopt}
                      style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#1D9E75,#4ade80)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      ✅ この改善案を採用する
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(improvedText).then(() => setMessage('📋 コピーしました！'))}
                      style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                      📋 コピーだけする
                    </button>
                    <button onClick={() => { setWizardStep(2); setImprovedText(''); setStepProgress(0); }}
                      style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                      別の方向を試す
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {purpose.key === 'handbook' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={async () => {
                if (!inputText.trim()) return;
                const res = await fetch('/api/clinic/handbooks/enhance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'boss-to-lead', chapterContent: inputText }) });
                const data = await res.json();
                if (data.result) { setImprovedText(data.result); setWizardStep(3); setStepProgress(100); }
              }} style={{ padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🔄 ボスマネ→リードマネ変換
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
