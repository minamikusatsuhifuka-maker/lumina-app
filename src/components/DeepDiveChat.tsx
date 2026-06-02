'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface DeepDiveChatProps {
  // 'write' | 'copy' | 'hp_content' | 'step_mail' | 'lp' | 'deepresearch' など
  featureType: string;
  // 「文章」「コピー」「HP内容」「ステップメール」「LP」「リサーチ」など
  featureLabel: string;
  featureIcon: string;
  accentColor: string;
  // 生成完了時に親へ内容を返す
  onGenerated: (content: string) => void;
}

// 機能別クイック返答
const QUICK_REPLIES: Record<string, string[]> = {
  hp_content: [
    'トップページ',
    '診療内容ページ',
    '医師紹介',
    'もっと詳しく教えて',
    'これで進めて',
  ],
  copy: ['もっと感情的に', '簡潔にして', '専門性を強調', 'これで進めて'],
  write: [
    'ブログ記事',
    'SNS投稿',
    'メール文章',
    'もっと詳しく',
    'これで進めて',
  ],
  step_mail: ['7通シリーズ', '21通シリーズ', '新規登録者向け', 'これで進めて'],
  lp: ['高単価サービス', 'クリニック向け', 'もっと深掘り', 'これで進めて'],
  deepresearch: ['市場調査', '競合分析', 'トレンド把握', 'これで進めて'],
};

// 「生成して」「OK」等のトリガー検出
const GENERATE_TRIGGERS = [
  '生成して',
  '生成する',
  'これで行く',
  'これでOK',
  'これでok',
  'これでいい',
  'OK',
  'ok',
  '作って',
  '出力して',
  'これで進めて',
];

export default function DeepDiveChat({
  featureType,
  featureLabel,
  featureIcon,
  accentColor,
  onGenerated,
}: DeepDiveChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [genStreamingText, setGenStreamingText] = useState('');
  const [isReadyToGenerate, setIsReadyToGenerate] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialFetchedRef = useRef(false);

  const fetchAIResponse = useCallback(
    async (userInput: string, currentMessages: Message[]) => {
      setIsLoading(true);
      setStreamingText('');
      setErrorMessage('');
      try {
        const res = await fetch('/api/deepdive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            featureType,
            messages: currentMessages,
            userInput: userInput || undefined,
          }),
        });
        if (!res.ok || !res.body) {
          setErrorMessage('AI応答の取得に失敗しました');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setStreamingText(fullText);
              } else if (event.type === 'done') {
                const aiMsg: Message = { role: 'assistant', content: fullText };
                setMessages((prev) => [...prev, aiMsg]);
                setStreamingText('');
                // 生成準備完了のキーワードを検出
                if (
                  fullText.includes('生成できます') ||
                  fullText.includes('準備完了') ||
                  fullText.includes('生成しましょう') ||
                  fullText.includes('情報は揃いました')
                ) {
                  setIsReadyToGenerate(true);
                }
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? 'エラー');
              }
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '通信エラー');
      } finally {
        setIsLoading(false);
      }
    },
    [featureType],
  );

  // 初回：AIから最初の質問を取得
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    void fetchAIResponse('', []);
  }, [fetchAIResponse]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleGenerate = useCallback(
    async (currentMessages?: Message[]) => {
      const msgs = currentMessages ?? messages;
      setIsGenerating(true);
      setGeneratedContent('');
      setGenStreamingText('');
      setErrorMessage('');
      try {
        const res = await fetch('/api/deepdive/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureType, messages: msgs }),
        });
        if (!res.ok || !res.body) {
          setErrorMessage('生成リクエストに失敗しました');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setGenStreamingText(fullText);
              } else if (event.type === 'done') {
                setGeneratedContent(fullText);
                setGenStreamingText('');
                onGenerated(fullText);
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? 'エラー');
              }
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '通信エラー');
      } finally {
        setIsGenerating(false);
      }
    },
    [featureType, messages, onGenerated],
  );

  const handleSend = async (content?: string) => {
    const text = content ?? input.trim();
    if (!text || isLoading || isGenerating) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);

    // 生成トリガー
    if (GENERATE_TRIGGERS.some((t) => text.includes(t))) {
      await handleGenerate(updated);
      return;
    }

    await fetchAIResponse(text, updated);
  };

  const displayGenText = genStreamingText || generatedContent;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 520,
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: '12px 16px',
          background: `${accentColor}12`,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 20 }}>{featureIcon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>
            💬 AI対話で深掘り → {featureLabel}生成
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            AIの質問に答えながら情報を整理。準備ができたら「生成して」と伝えてください
          </div>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '8px 14px',
            background: 'rgba(220,38,38,0.08)',
            color: '#dc2626',
            fontSize: 12,
            borderBottom: '1px solid rgba(220,38,38,0.25)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* チャット履歴 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 240,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                background:
                  msg.role === 'user' ? accentColor : 'var(--bg-secondary)',
                color:
                  msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                border:
                  msg.role === 'assistant'
                    ? '1px solid var(--border)'
                    : 'none',
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* ストリーミング中 */}
        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {streamingText}
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 12,
                  background: accentColor,
                  marginLeft: 2,
                  animation: 'deepdive-pulse 0.8s infinite',
                }}
              />
            </div>
          </div>
        )}

        {isLoading && !streamingText && (
          <div style={{ display: 'flex', gap: 4, padding: '10px 14px' }}>
            {[0, 150, 300].map((d) => (
              <div
                key={d}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#9ca3af',
                  animation: `deepdive-bounce 1s ${d}ms infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* 生成準備完了の案内 */}
        {isReadyToGenerate &&
          !generatedContent &&
          !isGenerating &&
          !isLoading && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: `${accentColor}10`,
                border: `1px solid ${accentColor}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: accentColor,
                  fontWeight: 500,
                }}
              >
                ✨ 情報が揃いました！いつでも生成できます
              </span>
              <button
                onClick={() => handleGenerate()}
                style={{
                  padding: '8px 16px',
                  background: accentColor,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                🚀 生成する
              </button>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* 生成中・生成結果 */}
      {(isGenerating || displayGenText) && (
        <div
          style={{
            borderTop: '2px solid var(--border)',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              background: `${accentColor}08`,
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: accentColor,
              }}
            >
              {isGenerating
                ? `⏳ ${featureLabel}を生成中...`
                : `✅ ${featureLabel}が完成しました`}
            </span>
            {generatedContent && !isGenerating && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() =>
                    copyToClipboard(generatedContent)
                  }
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  📋 コピー
                </button>
                <button
                  onClick={() => {
                    setGeneratedContent('');
                    setGenStreamingText('');
                    setIsReadyToGenerate(false);
                  }}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                  }}
                >
                  🔄 やり直す
                </button>
              </div>
            )}
          </div>
          <div
            style={{
              padding: 16,
              fontSize: 13,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-primary)',
            }}
          >
            {displayGenText}
            {isGenerating && (
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 12,
                  background: accentColor,
                  marginLeft: 2,
                  animation: 'deepdive-pulse 0.8s infinite',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* 入力エリア */}
      {!generatedContent && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px',
            background: 'var(--bg-primary)',
          }}
        >
          {/* クイック返答 */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            {(QUICK_REPLIES[featureType] ?? []).map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                disabled={isLoading || isGenerating}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  background: `${accentColor}10`,
                  color: accentColor,
                  border: `1px solid ${accentColor}30`,
                  borderRadius: 14,
                  cursor:
                    isLoading || isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.4 : 1,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* テキスト入力 */}
          <div style={{ position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="回答を入力... (送信ボタンで送信)"
              rows={2}
              disabled={isLoading || isGenerating}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '8px 70px 8px 12px',
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                opacity: isLoading || isGenerating ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || isGenerating || !input.trim()}
              style={{
                position: 'absolute',
                top: 6,
                right: 8,
                padding: '5px 12px',
                background: accentColor,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                opacity: !input.trim() ? 0.4 : 1,
              }}
            >
              送信
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes deepdive-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes deepdive-bounce { 0%,80%,100% { transform: scale(0.7) } 40% { transform: scale(1) } }
      `}</style>
    </div>
  );
}
