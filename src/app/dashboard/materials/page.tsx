'use client';

import { useState, useEffect } from 'react';
import { parseSSEStream } from '@/lib/streamUtils';

// 資料作成（コンテキストライブラリ連携対応・最小実装）
export default function MaterialsPage() {
  const [contextText, setContextText] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('slide');
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
      const typeLabels: Record<string, string> = {
        slide: 'スライド資料（10枚程度・各スライドの見出しと要点を箇条書き）',
        report: 'レポート資料（A4数ページ・章立てと本文）',
        proposal: '提案書（背景・課題・解決策・期待効果・スケジュール）',
        manual: 'マニュアル（手順を順番に・図解の指示も含めて）',
      };
      const prompt = `以下の背景情報をもとに、${typeLabels[type]}を作成してください。\n\n# トピック\n${topic}\n\n# 背景情報\n${contextText}\n\nMarkdown形式で見出しを付けて出力してください。`;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: 'report' }),
      });
      if (!res.ok || !res.body) {
        setOutput('生成に失敗しました。');
        return;
      }
      await parseSSEStream(res, (text) => setOutput(text));
    } catch (e: any) {
      setOutput(`通信エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📊 資料作成</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>背景情報をもとに、スライド・レポート・提案書などの資料原稿を生成します。</p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>トピック</div>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例: 2026年の生成AIトレンドレポート"
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>資料タイプ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {[
              { v: 'slide', l: '🎬 スライド' },
              { v: 'report', l: '📄 レポート' },
              { v: 'proposal', l: '📑 提案書' },
              { v: 'manual', l: '📕 マニュアル' },
            ].map(p => (
              <button
                key={p.v}
                onClick={() => setType(p.v)}
                style={{
                  padding: '8px 14px',
                  background: type === p.v ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  border: type === p.v ? '2px solid var(--accent)' : '1px solid var(--border)',
                  color: type === p.v ? 'var(--text-primary)' : 'var(--text-muted)',
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
            {loading ? '生成中...' : '📊 資料を生成'}
          </button>
        </div>
      </div>

      {output && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📊 生成結果</span>
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
