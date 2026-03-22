'use client';
import { useState, useEffect } from 'react';

const STRATEGY_TYPES = [
  { id: 'mvv', label: '🌟 MVV策定', desc: 'Mission・Vision・Values を策定', color: '#6c63ff' },
  { id: 'philosophy', label: '📜 企業理念', desc: '理念・哲学・クレドを設計', color: '#8b5cf6' },
  { id: 'market_strategy', label: '📊 マーケ戦略', desc: 'STP・4P・デジタル施策', color: '#00d4b8' },
  { id: 'brand', label: '✨ ブランド戦略', desc: 'ブランドアイデンティティ設計', color: '#f5a623' },
  { id: 'hiring', label: '🤝 採用戦略', desc: '採用・選考・オンボーディング', color: '#4ade80' },
  { id: 'talent', label: '🌱 人材育成', desc: '育成・評価・1on1設計', color: '#00d4b8' },
  { id: 'organization', label: '🏢 組織設計', desc: 'カルチャー・エンゲージメント', color: '#f87171' },
];

const TEMPLATES: Record<string, string> = {
  mvv: `【会社・事業の概要】
業種：
事業内容：
設立年：
従業員数：
現在の売上・規模：

【創業の想い・背景】
なぜこの事業を始めたのか：
解決したい社会課題：

【強み・独自性】
他社と違うポイント：
得意なこと：

【ターゲット顧客】
主な顧客層：
顧客の抱える課題：

【10年後の目指す姿】
どんな会社になりたいか：
社会にどんな影響を与えたいか：`,

  talent: `【組織・人材の現状】
従業員数・構成：
現在の育成課題：
離職率・定着率：

【目指す人材像】
求めるスキル：
求めるマインドセット：
キャリアパスのイメージ：

【現在の制度・施策】
評価制度：
研修・育成制度：
1on1の実施状況：

【最新手法で取り入れたいもの】
興味のある手法（OKR/心理的安全性/ティール組織等）：

【解決したい課題】
`,

  hiring: `【採用の現状】
採用したい職種：
採用人数・時期：
現在の採用課題：

【会社の魅力・強み】
働く環境・文化：
成長機会：
報酬・福利厚生：

【求める人材】
必須スキル・経験：
歓迎スキル：
重視するマインド：

【競合他社との差別化】
他社と比べた自社の特徴：

【採用予算・リソース】
`,
};

export default function StrategyPage() {
  const [strategyType, setStrategyType] = useState('mvv');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const ctx = localStorage.getItem('lumina_analysis_source');
    if (ctx) { setContent(ctx); localStorage.removeItem('lumina_analysis_source'); }
  }, []);

  const loadTemplate = () => {
    const t = TEMPLATES[strategyType];
    if (t) setContent(t);
  };

  const generate = async () => {
    if (!content.trim()) return;
    setLoading(true); setResult(''); setSaved(false);

    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, strategyType }),
      });

      if (!res.body) { setLoading(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') { accumulated += json.content; setResult(accumulated); }
          } catch {}
        }
      }
    } catch (e: any) { setResult(`エラー: ${e.message}`); }
    setLoading(false);
  };

  const saveDraft = async () => {
    if (!result) return;
    await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${STRATEGY_TYPES.find(t => t.id === strategyType)?.label} — ${new Date().toLocaleDateString('ja-JP')}`,
        content: result,
        mode: 'report',
      }),
    });
    setSaved(true);
  };

  const sendToWriter = () => {
    localStorage.setItem('lumina_research_context', result);
    window.location.href = '/dashboard/write';
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
    a.download = `lumina_strategy_${strategyType}_${Date.now()}.md`;
    a.click();
  };

  const selectedType = STRATEGY_TYPES.find(t => t.id === strategyType);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
        💼 経営インテリジェンス
      </h1>
      <p style={{ color: '#7878a0', marginBottom: 20 }}>
        MVV策定・組織設計・人材育成・マーケ・ブランド・採用戦略をAIが支援します
      </p>

      {/* 戦略タイプ選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {STRATEGY_TYPES.map(t => (
          <button key={t.id} onClick={() => { setStrategyType(t.id); setResult(''); }} style={{
            padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
            textAlign: 'left' as const, transition: 'all 0.15s',
            border: strategyType === t.id ? `2px solid ${t.color}` : '1px solid rgba(130,140,255,0.15)',
            background: strategyType === t.id ? `${t.color}15` : '#12142a',
            color: strategyType === t.id ? t.color : '#7878a0',
          }}>
            <div style={{ fontSize: 15, marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: '#5a5a7a', lineHeight: 1.4 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* 入力エリア */}
      <div style={{ background: '#12142a', border: `1px solid ${selectedType?.color}30`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#7878a0' }}>
            {selectedType?.label}に必要な情報を入力してください
          </div>
          {TEMPLATES[strategyType] && (
            <button onClick={loadTemplate} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${selectedType?.color}40`, background: `${selectedType?.color}10`, color: selectedType?.color, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              📋 テンプレートを使う
            </button>
          )}
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={`${selectedType?.label}の生成に必要な情報を入力してください。\n情報が少なくても一般的なベストプラクティスをもとに提案します。\n「テンプレートを使う」で入力フォームを表示できます。`}
          style={{ width: '100%', minHeight: 180, background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 13, padding: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' as const }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#5a5a7a' }}>{content.length.toLocaleString()}文字入力</div>
          <button onClick={generate} disabled={loading} style={{
            padding: '11px 32px',
            background: `linear-gradient(135deg, ${selectedType?.color}, ${selectedType?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? '⏳ 生成中...' : `${selectedType?.label.split(' ')[0]} 生成`}
          </button>
        </div>
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{ background: '#12142a', border: `1px solid ${selectedType?.color}30`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: selectedType?.color }}>
              {selectedType?.label} 結果
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <button onClick={() => setFontSize(f => Math.max(11, f-1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 11, color: '#7878a0', fontFamily: 'monospace' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>＋</button>
              <button onClick={saveDraft} style={{ padding: '5px 12px', background: saved ? 'rgba(74,222,128,0.15)' : '#1a1d36', border: `1px solid ${saved ? '#4ade80' : 'rgba(130,140,255,0.2)'}`, color: saved ? '#4ade80' : '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                {saved ? '✅ 保存済み' : '📚 保存'}
              </button>
              <button onClick={sendToWriter} style={{ padding: '5px 12px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✍️ 文章化</button>
              <button onClick={download} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>💾 MD保存</button>
              <button
                onClick={async () => {
                  const { exportToPdf } = await import('@/lib/exportPdf');
                  const t = `${selectedType?.label} — ${new Date().toLocaleDateString('ja-JP')}`;
                  await exportToPdf(t, result);
                }}
                style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                📄 PDF
              </button>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7878a0', padding: '8px 0' }}>
              <div style={{ width: 16, height: 16, border: `2px solid ${selectedType?.color}40`, borderTopColor: selectedType?.color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              生成中...
            </div>
          )}
          <div style={{ fontSize: fontSize, color: '#c0c0e0', lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
            {result}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
