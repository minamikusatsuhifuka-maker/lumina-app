'use client';
import { useState, useRef, useCallback } from 'react';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

const PURPOSES = [
  { key: 'patient',    label: '🏥 患者向け',      desc: '分かりやすく温かく' },
  { key: 'official',  label: '📋 公式文書',       desc: '正確・法的に明確に' },
  { key: 'manual',    label: '💼 スタッフマニュアル', desc: '手順的・具体的に' },
  { key: 'philosophy',label: '🌿 院長の哲学を反映', desc: '理念・ビジョンを込めて' },
  { key: 'simple',    label: '✨ シンプルに',      desc: '簡潔・要点明確に' },
  { key: 'warm',      label: '🤝 温かみのある表現', desc: '柔らかく人間味を' },
  { key: 'recruit',   label: '👥 採用・求人文書',   desc: '魅力・共感を伝える' },
  { key: 'teal',      label: '🩵 ティール文化',     desc: '自律・信頼・主役意識' },
];

export default function TextEditorPage() {
  const [text, setText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [purpose, setPurpose] = useState('patient');
  const [revised, setRevised] = useState('');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [applied, setApplied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSelect = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) {
      setSelectionStart(start);
      setSelectionEnd(end);
      setSelectedText(ta.value.slice(start, end));
      setRevised('');
      setApplied(false);
    }
  }, []);

  const selectAll = () => {
    if (!text.trim()) return;
    setSelectionStart(0);
    setSelectionEnd(text.length);
    setSelectedText(text);
    setRevised('');
    setApplied(false);
    if (textareaRef.current) {
      textareaRef.current.select();
    }
  };

  const generate = async () => {
    if (!selectedText.trim()) {
      setMessage('修正したいテキストを選択してください');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setGenerating(true);
    setRevised('');
    setApplied(false);
    try {
      const res = await fetch('/api/clinic/text-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText,
          purpose,
          fullContext: text,
        }),
      });
      const data = await res.json();
      if (data.revised) {
        setRevised(data.revised);
      } else {
        setMessage(data.error || '生成に失敗しました');
      }
    } catch {
      setMessage('エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  const applyRevision = () => {
    if (!revised) return;
    const newText = text.slice(0, selectionStart) + revised + text.slice(selectionEnd);
    setText(newText);
    setSelectedText('');
    setRevised('');
    setApplied(true);
    setMessage('✅ テキストを適用しました');
    setTimeout(() => setMessage(''), 3000);
  };

  const cardStyle: React.CSSProperties = {
    padding: 20,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    marginBottom: 16,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.8,
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        ✍️ AIテキストエディタ
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
        文章を読み込み→範囲を選択→目的を選んでAIが自動修正
      </p>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.includes('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.includes('✅') ? '#4ade80' : '#ef4444',
        }}>{message}</div>
      )}

      {/* テキスト入力エリア */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            📄 テキストを入力・貼り付け
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={selectAll}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >全文を選択</button>
            <button
              onClick={() => { setText(''); setSelectedText(''); setRevised(''); }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >クリア</button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onSelect={handleSelect}
          onMouseUp={handleSelect}
          onKeyUp={handleSelect}
          placeholder="ここにテキストを貼り付けるか入力してください。修正したい部分をドラッグで選択してください。"
          rows={12}
          style={inputStyle}
        />
        {selectedText && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.2)',
            borderRadius: 8, fontSize: 12, color: '#6c63ff',
          }}>
            ✅ 選択中：{selectedText.length}文字 「{selectedText.slice(0, 50)}{selectedText.length > 50 ? '...' : ''}」
          </div>
        )}
      </div>

      {/* 目的選択 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          🎯 修正の目的を選択
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PURPOSES.map(p => (
            <button
              key={p.key}
              onClick={() => setPurpose(p.key)}
              style={{
                padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '2px solid',
                background: purpose === p.key ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)',
                borderColor: purpose === p.key ? '#6c63ff' : 'var(--border)',
                color: purpose === p.key ? '#6c63ff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              <div>{p.label}</div>
              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 生成ボタン */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <button
          onClick={generate}
          disabled={generating || !selectedText.trim()}
          style={{
            padding: '12px 40px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: generating || !selectedText.trim()
              ? 'rgba(108,99,255,0.3)'
              : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontSize: 15, fontWeight: 700,
            boxShadow: !generating && selectedText ? '0 4px 16px rgba(108,99,255,0.3)' : 'none',
          }}
        >
          {generating ? '🤖 AIが修正中...' : '🤖 AIで修正する'}
        </button>
      </div>

      {/* 修正結果 */}
      {revised && (
        <div style={{
          ...cardStyle,
          border: '2px solid rgba(74,222,128,0.4)',
          background: 'rgba(74,222,128,0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>
              ✨ AIの修正案
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={generate}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >🔄 再生成</button>
              <button
                onClick={applyRevision}
                style={{
                  padding: '6px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: 'none', background: '#4ade80', color: '#fff', cursor: 'pointer',
                }}
              >✅ 適用する</button>
            </div>
          </div>

          {/* Before / After 比較 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>
                修正前
              </div>
              <div style={{
                padding: 12, background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)',
                lineHeight: 1.8, whiteSpace: 'pre-wrap',
              }}>
                {selectedText}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 6, fontWeight: 700 }}>
                修正後
              </div>
              <div style={{
                padding: 12, background: 'rgba(74,222,128,0.06)',
                border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
                lineHeight: 1.8, whiteSpace: 'pre-wrap',
              }}>
                {revised}
              </div>
            </div>
          </div>
        </div>
      )}

      <AIDialogueButton contextType="text-editor" contextLabel="AIテキストエディタ" />
    </div>
  );
}
