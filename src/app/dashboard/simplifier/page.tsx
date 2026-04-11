'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

interface KeyTerm {
  original: string;
  simplified: string;
}

interface SimplifierResult {
  converted_text: string;
  key_terms: KeyTerm[];
  reading_time: string;
  level_check: string;
  examples_added: string[];
}

const LEVELS = [
  { value: 'elementary', label: '小学生', icon: '\uD83D\uDC76' },
  { value: 'junior', label: '中学生', icon: '\uD83D\uDCDA' },
  { value: 'general', label: '一般向け', icon: '\uD83D\uDC65' },
  { value: 'expert', label: '専門家', icon: '\uD83D\uDD2C' },
];

const SAMPLE_TEXT = `量子コンピュータは、量子力学の原理を利用して計算を行う次世代のコンピューティングデバイスである。従来のコンピュータがビット（0または1）を基本単位とするのに対し、量子コンピュータは量子ビット（キュービット）を使用する。キュービットは重ね合わせ（スーパーポジション）の原理により、0と1の両方の状態を同時に保持できる。さらに、量子もつれ（エンタングルメント）により、離れたキュービット同士が相関を持つことで、並列計算の効率が飛躍的に向上する。現在、超伝導方式やイオントラップ方式など複数のアプローチが研究されており、2025年時点で1000キュービット超のプロセッサが実現している。`;

export default function SimplifierPage() {
  const [text, setText] = useState('');
  const [level, setLevel] = useState('general');
  const [addExamples, setAddExamples] = useState(false);
  const [result, setResult] = useState<SimplifierResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setText(SAMPLE_TEXT);
  };

  const generate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/simplifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, level, addExamples }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      setResult(data);
      setRawText(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.converted_text);
  };

  const sendToWriter = () => {
    if (!result) return;
    sessionStorage.setItem('simplifier_text', result.converted_text);
    window.location.href = '/dashboard/write';
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="難易度を変換中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        難易度変換
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        文章の難易度を対象読者に合わせて自動変換します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/write', icon: '\u270D\uFE0F', label: '文章作成' },
          { href: '/dashboard/copy-generator', icon: '\uD83D\uDCAC', label: 'コピー生成' },
          { href: '/dashboard/glossary', icon: '\uD83D\uDCD8', label: '用語解説' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>変換レベルを選択</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        {/* レベルボタン */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {LEVELS.map(l => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              style={{
                padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                border: level === l.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: level === l.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                color: level === l.value ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: level === l.value ? 700 : 500,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 24 }}>{l.icon}</span>
              {l.label}
            </button>
          ))}
        </div>

        {/* テキスト入力 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>変換したいテキスト *</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="難易度を変換したいテキストを入力してください..."
            rows={8}
            style={{
              width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.6,
            }}
          />
        </div>

        {/* 具体例チェックボックス */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={addExamples}
              onChange={e => setAddExamples(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#6c63ff' }}
            />
            具体例を追加する
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {text.length}文字 / レベル: {LEVELS.find(l => l.value === level)?.label}
          </div>
          <button onClick={generate} disabled={loading || !text.trim()} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !text.trim()) ? 0.5 : 1,
          }}>
            {loading ? '変換中...' : '難易度を変換'}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          テキストの難易度を変換しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`難易度変換: ${LEVELS.find(l => l.value === level)?.label}`}
              content={rawText}
              type="simplifier"
              groupName="難易度変換"
              tags="難易度変換,テキスト"
            />
            <button onClick={copyToClipboard} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              コピー
            </button>
            <button onClick={sendToWriter} style={{
              padding: '6px 14px', background: 'rgba(108,99,255,0.1)',
              border: '1px solid rgba(108,99,255,0.3)', color: '#6c63ff',
              borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              {'\u270D\uFE0F'} 文章作成に送る
            </button>
          </div>

          {/* 読了時間バッジ */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {result.reading_time && (
              <span style={{
                fontSize: 12, padding: '4px 14px', borderRadius: 20,
                background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)',
                color: '#6c63ff', fontWeight: 600,
              }}>
                {result.reading_time}
              </span>
            )}
            {result.level_check && (
              <span style={{
                fontSize: 12, padding: '4px 14px', borderRadius: 20,
                background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)',
                color: '#4ade80', fontWeight: 600,
              }}>
                {result.level_check}
              </span>
            )}
          </div>

          {/* 変換後テキスト */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              変換後テキスト
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {result.converted_text}
            </div>
          </div>

          {/* 用語変換テーブル */}
          {result.key_terms && result.key_terms.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                用語変換一覧
              </div>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>元の用語</th>
                      <th style={{ textAlign: 'center', padding: '8px 4px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', width: 40 }}>{'\u2192'}</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>変換後</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.key_terms.map((term, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{term.original}</td>
                        <td style={{ padding: '8px 4px', fontSize: 13, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>{'\u2192'}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: '#6c63ff', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{term.simplified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 追加された具体例 */}
          {result.examples_added && result.examples_added.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
              border: '1px solid #6c63ff30', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>
                追加された具体例
              </div>
              {result.examples_added.map((ex, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  marginBottom: i < result.examples_added.length - 1 ? 8 : 0,
                  fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                  {ex}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
