'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { DateRangePicker, DateRange, getDateCondition } from '@/components/DateRangePicker';

const TEMPLATES = [
  { label: 'AI最新動向', topic: '2026年の生成AI・大規模言語モデルの最新動向と活用事例' },
  { label: 'ブログ収益化', topic: 'ブログ・noteで月10万円稼ぐための最新戦略と実践方法' },
  { label: '電子書籍出版', topic: 'Kindleダイレクト・パブリッシングで電子書籍を出版する方法と収益化' },
  { label: 'SEO対策', topic: '2026年最新のSEO対策・Google検索アルゴリズム変化への対応' },
  { label: '小説執筆', topic: 'プロ作家に学ぶ小説執筆テクニック・キャラクター作り・世界観構築' },
  { label: 'SNSマーケ', topic: 'X(Twitter)・Instagram・TikTokを活用したコンテンツマーケティング最新手法' },
];

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const waitMs = (i + 1) * 3000;
    console.log(`[retry] 429 received, waiting ${waitMs}ms... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  return fetch(url, options);
}

const processInline = (text: string): string => {
  // 太字
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');

  // 「出典: サイト名 https://URL」形式
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">$1 ↗</a>'
  );

  // 裸のURL（前後に余分なものがないもの）
  text = text.replace(
    /(?<![="'(])(https?:\/\/[^\s）\]。、！？\n"'<>]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;font-size:0.9em;">$1 ↗</a>'
  );

  return text;
};

const formatReport = (text: string): string => {
  if (!text) return '';

  const lines = text.split('\n');
  const html = lines.map(line => {
    const t = line.trim();

    // 見出し
    if (t.startsWith('# ')) return `<div style="font-size:1.25em;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2))}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.1em;font-weight:600;color:var(--text-secondary);margin:16px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3))}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1em;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${processInline(t.slice(4))}</div>`;

    // 番号付きリスト
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.7;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2])}</span></div>`;
    }

    // 箇条書き
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.7;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2))}</span></div>`;
    }

    // 出典行（「出典:」で始まる行）
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      return `<div style="font-size:0.85em;color:var(--text-muted);padding:4px 0 4px 12px;border-left:2px solid rgba(0,212,184,0.3);margin:4px 0;">${processInline(t)}</div>`;
    }

    // 区切り線
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';

    // 空行
    if (t === '') return '<div style="height:8px"></div>';

    // 通常のテキスト
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
  });

  return html.join('');
};

export default function DeepResearchPage() {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState('standard');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [elapsed, setElapsed] = useState(0);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  // AI背景情報コンテキスト最適化
  const [contextText, setContextText] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [savedContextId, setSavedContextId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState('');

  const optimizeContext = async () => {
    if (!report.trim()) return;
    setOptimizing(true);
    setContextText('');
    setSavedContextId(null);
    try {
      const res = await fetch('/api/deepresearch/optimize-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, researchText: report }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`最適化エラー: ${data.error || '不明なエラー'}`);
      } else {
        setContextText(data.contextText || '');
      }
    } catch (e: any) {
      alert(`通信エラー: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  const saveContext = async () => {
    if (!contextText.trim()) return;
    setSaveStatus('保存中...');
    try {
      const res = await fetch('/api/context-saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, contextText, researchText: report }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus('');
        alert(`保存エラー: ${data.error || '不明なエラー'}`);
      } else {
        setSavedContextId(data.id);
        setSaveStatus('✅ 保存完了');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e: any) {
      setSaveStatus('');
      alert(`通信エラー: ${e.message}`);
    }
  };

  // コンテキストを sessionStorage に格納してから遷移
  const goToTool = async (tool: 'write' | 'sns-post' | 'lp' | 'materials') => {
    if (!contextText.trim()) return;
    // 未保存ならまず保存
    let id = savedContextId;
    if (!id) {
      try {
        const res = await fetch('/api/context-saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, contextText, researchText: report }),
        });
        const data = await res.json();
        if (res.ok) {
          id = data.id;
          setSavedContextId(id);
        }
      } catch {}
    }
    // sessionStorageにも保持（既存ツールが対応していなくても利用可能にする）
    try {
      sessionStorage.setItem('lumina_context_text', contextText);
      sessionStorage.setItem('lumina_context_topic', topic);
    } catch {}
    const toolPath: Record<typeof tool, string> = {
      'write': '/dashboard/write',
      'sns-post': '/dashboard/sns-post',
      'lp': '/dashboard/lp-generator',
      'materials': '/dashboard/materials',
    };
    const url = id ? `${toolPath[tool]}?contextId=${id}` : toolPath[tool];
    window.location.href = url;
  };

  const research = async (t?: string) => {
    const q = t || topic;
    if (!q.trim()) return;
    setLoading(true);
    startProgress();
    setReport('');
    setElapsed(0);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const res = await retryFetch('/api/deepresearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: q + getDateCondition(dateRange), depth }),
      });

      if (!res.ok || !res.body) {
        setReport('エラーが発生しました。');
        clearInterval(timer);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') {
              accumulated += json.content;
              setReport(accumulated);
            } else if (json.type === 'error') {
              setReport(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setReport(`通信エラー: ${error.message}`);
      resetProgress();
    } finally {
      clearInterval(timer);
      setLoading(false);
      completeProgress();
    }
  };

  const sendToWrite = () => {
    localStorage.setItem('lumina_research_context', report);
    window.location.href = '/dashboard/write';
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report], { type: 'text/plain' }));
    a.download = `lumina_research_${Date.now()}.md`;
    a.click();
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="🔭 ディープリサーチ実行中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔭 ディープリサーチ</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Claude AIが複数ソースを統合し、徹底的なリサーチレポートを生成します</p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>リサーチトピック</div>
          <div style={{ position: 'relative' }}>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={'調査したいテーマを詳しく入力してください\n例：AIを活用したブログ記事の自動生成と収益化の最新事例'}
              style={{ width: '100%', minHeight: 80, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: 12, paddingRight: 48, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }}
            />
            <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
              <VoiceInputButton size="sm" onResult={(text) => setTopic(prev => prev + text)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { value: 'quick', label: '⚡ クイック', desc: '約500字' },
            { value: 'standard', label: '📊 スタンダード', desc: '約1500字' },
            { value: 'deep', label: '🔭 ディープ', desc: '約5000字+' },
          ].map(d => (
            <button
              key={d.value}
              onClick={() => setDepth(d.value)}
              style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: depth === d.value ? '2px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', background: depth === d.value ? 'var(--accent-soft)' : 'var(--bg-primary)', color: depth === d.value ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, textAlign: 'center' as const }}
            >
              <div>{d.label}</div>
              <div style={{ fontSize: 11, marginTop: 2, fontWeight: 400 }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>調査期間：</span>
          <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="期間を指定（任意）" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => research()}
            disabled={loading}
            style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? `🔍 調査中... ${elapsed}秒` : '🔭 ディープリサーチ開始'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => { setTopic(t.topic); research(t.topic); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>複数のWebソースを調査・統合中...（混雑時は自動でリトライします）</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / ディープリサーチは30〜60秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>🔭 リサーチレポート</span>
              <SaveToLibraryButton
                title={`ディープリサーチ: ${topic}`}
                content={report}
                type="deepresearch"
                groupName="ディープリサーチ"
                tags="ディープリサーチ"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(11, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
              </div>
              <button onClick={sendToWrite} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✍️ 文章作成に使う
              </button>
              <button onClick={download} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                💾 MD保存
              </button>
              <button onClick={() => navigator.clipboard.writeText(report)} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
            </div>
          </div>
          <div
            style={{ fontSize: fontSize, color: 'var(--text-secondary)', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatReport(report) }}
          />

          {/* AI背景情報最適化セクション */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
            {!contextText && !optimizing && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={optimizeContext}
                  style={{
                    padding: '12px 28px',
                    background: 'linear-gradient(135deg, #00d4b8, #6c63ff)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(108,99,255,0.25)',
                  }}
                >
                  🧠 AI背景情報として最適化
                </button>
              </div>
            )}

            {optimizing && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ width: 32, height: 32, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>背景情報コンテキストを生成中...</div>
              </div>
            )}

            {contextText && !optimizing && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>🧠 AI背景情報コンテキスト</span>
                    {saveStatus && <span style={{ fontSize: 12, color: '#00d4b8', fontWeight: 600 }}>{saveStatus}</span>}
                  </div>
                  <button
                    onClick={optimizeContext}
                    style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    🔄 再生成
                  </button>
                </div>

                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-accent)', borderRadius: 10, padding: 16, marginBottom: 12, maxHeight: 400, overflowY: 'auto' as const }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, fontSize: 12, fontFamily: 'inherit', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {contextText}
                  </pre>
                </div>

                {/* 連携ボタン群 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <button
                    onClick={() => navigator.clipboard.writeText(contextText)}
                    style={{ padding: '8px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📋 コピー
                  </button>
                  <button
                    onClick={saveContext}
                    style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    💾 保存
                  </button>
                  <button
                    onClick={() => goToTool('write')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✍️ 文章作成へ
                  </button>
                  <button
                    onClick={() => goToTool('sns-post')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📱 SNS投稿へ
                  </button>
                  <button
                    onClick={() => goToTool('lp')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📄 LP作成へ
                  </button>
                  <button
                    onClick={() => goToTool('materials')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📊 資料作成へ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
