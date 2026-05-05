'use client';

import { useState, useEffect } from 'react';

// SNS投稿生成（コンテキストライブラリ連携対応・最小実装）
export default function SnsPostPage() {
  const [contextText, setContextText] = useState('');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('twitter');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const contextId = params.get('contextId');
      if (contextId) {
        fetch(`/api/context-saves?id=${contextId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data && data.context_text) {
              setContextText(data.context_text);
              setTopic(data.topic || '');
            }
          })
          .catch(() => {});
      } else {
        const ctx = sessionStorage.getItem('lumina_context_text');
        const tpc = sessionStorage.getItem('lumina_context_topic') || '';
        if (ctx) {
          setContextText(ctx);
          setTopic(tpc);
          sessionStorage.removeItem('lumina_context_text');
          sessionStorage.removeItem('lumina_context_topic');
        }
      }
    } catch {}
  }, []);

  const generate = async () => {
    if (!contextText.trim() && !topic.trim()) return;
    setLoading(true);
    setOutput('');
    try {
      const platformLabels: Record<string, string> = {
        twitter: 'X（旧Twitter / 140字以内）',
        instagram: 'Instagram（絵文字・ハッシュタグ豊富・キャプション）',
        threads: 'Threads（カジュアル・会話調）',
        facebook: 'Facebook（やや長文・実体験ベース）',
      };
      const prompt = `以下の背景情報をもとに、${platformLabels[platform]}向けのSNS投稿を3案生成してください。\n\n# トピック\n${topic}\n\n# 背景情報\n${contextText}\n\n各案を「---」で区切って出力してください。`;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: 'sns_twitter' }),
      });
      if (!res.ok || !res.body) {
        setOutput('生成に失敗しました。');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value);
        setOutput(acc);
      }
    } catch (e: any) {
      setOutput(`通信エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📱 SNS投稿生成</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>背景情報をもとに、各SNSに最適化された投稿文を生成します。</p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>トピック</div>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例: 2026年の生成AIトレンド"
            style={{ width: '100%', padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>背景情報（コンテキスト）</div>
          <textarea
            value={contextText}
            onChange={e => setContextText(e.target.value)}
            placeholder="背景情報を貼り付けてください（コンテキストライブラリから自動セットされます）"
            style={{ width: '100%', minHeight: 140, padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.7 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>プラットフォーム</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {[
              { v: 'twitter', l: '𝕏 X' },
              { v: 'instagram', l: '📸 Instagram' },
              { v: 'threads', l: '🧵 Threads' },
              { v: 'facebook', l: '👥 Facebook' },
            ].map(p => (
              <button
                key={p.v}
                onClick={() => setPlatform(p.v)}
                style={{
                  padding: '8px 14px',
                  background: platform === p.v ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  border: platform === p.v ? '2px solid var(--accent)' : '1px solid var(--border)',
                  color: platform === p.v ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '生成中...' : '📱 SNS投稿を生成'}
          </button>
        </div>
      </div>

      {output && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📱 生成結果</span>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              style={{ padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              📋 コピー
            </button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, fontSize: 13, fontFamily: 'inherit', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
