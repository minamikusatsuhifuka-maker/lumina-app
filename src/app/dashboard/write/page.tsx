'use client';
import { useState, useEffect } from 'react';

const MODES = [
  { id: 'blog', label: '📝 ブログ' }, { id: 'note', label: '✏️ note' },
  { id: 'novel', label: '📖 小説' }, { id: 'guide', label: '📚 解説本' },
  { id: 'publish', label: '🗞️ 出版用' }, { id: 'social', label: '📱 SNS' },
  { id: 'report', label: '📊 レポート' },
  { id: 'homepage', label: '🌐 HP・LP' },
  { id: 'product', label: '🛍️ 商品説明' },
  { id: 'email', label: '📧 メール' },
  { id: 'press', label: '📰 プレスリリース' },
];

export default function WritePage() {
  const [mode, setMode] = useState('blog');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('casual');
  const [length, setLength] = useState('medium');
  const [audience, setAudience] = useState('general');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [targetLang, setTargetLang] = useState('en');

  useEffect(() => {
    const context = localStorage.getItem('lumina_research_context');
    if (context) {
      setPrompt(`【参考情報】\n${context}\n\n【指示】\n`);
      localStorage.removeItem('lumina_research_context');
    }
  }, []);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setOutput('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode, style, length, audience }),
      });

      console.log('[write] Response status:', res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: '不明なエラー' }));
        console.error('[write] API error:', errorData);
        alert(`エラー: ${errorData.error || res.statusText}`);
        setLoading(false);
        return;
      }

      if (!res.body) {
        console.error('[write] No response body');
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
              text += json.delta.text;
              setOutput(text);
            }
          } catch {}
        }
      }

      console.log('[write] Generation complete, length:', text.length);

      if (text) {
        try {
          await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: prompt.slice(0, 50),
              content: text,
              mode,
            }),
          });
        } catch (e) {
          console.error('[write] Failed to save draft:', e);
        }
      }

    } catch (error) {
      console.error('[write] Fetch error:', error);
      alert('通信エラーが発生しました。ネットワークを確認してください。');
    } finally {
      setLoading(false);
    }
  };

  const translate = async () => {
    if (!output) return;
    setTranslating(true); setTranslated('');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: output, targetLang }),
      });
      const data = await res.json();
      setTranslated(data.translated || '');
    } catch {
      setTranslated('翻訳エラーが発生しました。');
    }
    setTranslating(false);
  };

  const copy = () => navigator.clipboard.writeText(output).then(() => alert('コピーしました！'));
  const download = (ext: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([output], { type: 'text/plain' }));
    a.download = `lumina_${Date.now()}.${ext}`; a.click();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff' }}>✍️ AI文章作成</h1>
        <a href="/dashboard/library" style={{ padding: '6px 14px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
          📚 下書き一覧
        </a>
      </div>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>Claude Sonnet 4.6 — 高精度ストリーミング生成</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '6px 14px', borderRadius: 6, border: mode === m.id ? 'none' : '1px solid rgba(130,140,255,0.15)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: mode === m.id ? '#6c63ff' : '#12142a', color: mode === m.id ? '#fff' : '#7878a0' }}>
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.15)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={'テーマ・指示を入力\n例：AIが日常生活を変える5つの方法について初心者向けに2000文字で書いてください'} style={{ width: '100%', minHeight: 100, background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 14, padding: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
          {[
            { label: '文体', value: style, set: setStyle, options: [['casual','カジュアル'],['formal','フォーマル'],['literary','文学的'],['academic','学術的']] },
            { label: '文字数', value: length, set: setLength, options: [['short','500字'],['medium','1500字'],['long','3000字'],['xl','5000字+']] },
            { label: '対象読者', value: audience, set: setAudience, options: [['general','一般'],['beginner','初心者'],['expert','専門家'],['business','ビジネス']] },
          ].map(sel => (
            <div key={sel.label}>
              <div style={{ fontSize: 11, color: '#7878a0', marginBottom: 4 }}>{sel.label}</div>
              <select value={sel.value} onChange={e => sel.set(e.target.value)} style={{ width: '100%', padding: '8px 10px', background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 6, color: '#f0f0ff', fontSize: 13, outline: 'none' }}>
                {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={() => { setOutput(''); setPrompt(''); setTranslated(''); }} style={{ padding: '9px 16px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#7878a0', cursor: 'pointer', fontSize: 13 }}>🗑 クリア</button>
          <button onClick={generate} disabled={loading} style={{ padding: '9px 24px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ 生成中...' : '✨ 文章を生成'}
          </button>
        </div>
      </div>
      {(output || loading) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPreview(false)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: !preview ? '#6c63ff' : '#1a1d36', color: !preview ? '#fff' : '#7878a0' }}>✏️ 編集</button>
              <button onClick={() => setPreview(true)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: preview ? '#6c63ff' : '#1a1d36', color: preview ? '#fff' : '#7878a0' }}>👁 プレビュー</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#5a5a7a', fontFamily: 'monospace' }}>{output.length.toLocaleString()}字</span>
              <button onClick={copy} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
              <button onClick={() => download('md')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}>💾 MD</button>
              <button onClick={() => download('txt')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}>💾 TXT</button>
            </div>
          </div>
          <textarea value={output} onChange={e => setOutput(e.target.value)} readOnly={loading} style={{ display: preview ? 'none' : 'block', width: '100%', minHeight: 400, background: '#12142a', border: `1px solid ${loading ? '#6c63ff' : 'rgba(130,140,255,0.2)'}`, borderRadius: 12, color: '#c0c0e0', fontSize: 14, padding: 20, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.9, boxSizing: 'border-box' }} />
          {preview && <div style={{ minHeight: 400, background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 12, padding: '20px 28px', color: '#c0c0e0', fontSize: 15, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{output}</div>}
        </div>
      )}

      {/* 翻訳セクション */}
      {output && !loading && (
        <div style={{ marginTop: 16, background: '#12142a', border: '1px solid rgba(0,212,184,0.15)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#00d4b8' }}>🌍 翻訳</span>
            <select value={targetLang} onChange={e => setTargetLang(e.target.value)} style={{ padding: '5px 10px', background: '#07080f', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 6, color: '#f0f0ff', fontSize: 13, outline: 'none' }}>
              <option value="en">🇺🇸 英語</option>
              <option value="zh">🇨🇳 中国語</option>
              <option value="ko">🇰🇷 韓国語</option>
              <option value="fr">🇫🇷 フランス語</option>
              <option value="es">🇪🇸 スペイン語</option>
              <option value="de">🇩🇪 ドイツ語</option>
            </select>
            <button onClick={translate} disabled={translating} style={{ padding: '5px 16px', background: 'linear-gradient(135deg, #00d4b8, #00b4d8)', color: '#0a0e12', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {translating ? '翻訳中...' : '翻訳する'}
            </button>
            {translated && (
              <button onClick={() => navigator.clipboard.writeText(translated)} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(0,212,184,0.2)', color: '#00d4b8', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
            )}
          </div>
          {translated && (
            <div style={{ fontSize: 14, color: '#c0c0e0', lineHeight: 1.9, whiteSpace: 'pre-wrap', borderTop: '1px solid rgba(0,212,184,0.1)', paddingTop: 12 }}>{translated}</div>
          )}
        </div>
      )}
    </div>
  );
}
