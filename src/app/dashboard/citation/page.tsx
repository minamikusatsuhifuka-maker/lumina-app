'use client';
import { useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';

interface CitationResult {
  citation: string;
  inline_citation: string;
  bibliography_entry: string;
  missing_info: string[];
  tips: string;
}

const STYLES = [
  { value: 'APA', label: 'APA', desc: '心理学・社会科学' },
  { value: 'MLA', label: 'MLA', desc: '人文科学' },
  { value: 'Chicago', label: 'Chicago', desc: '歴史学・出版' },
  { value: 'Harvard', label: 'Harvard', desc: '英国式汎用' },
  { value: 'Vancouver', label: 'Vancouver', desc: '医学・自然科学' },
  { value: 'Japan', label: '日本語形式', desc: 'SIST02準拠' },
];

const SAMPLE = {
  url: 'https://www.anthropic.com/news/claude-3-5-sonnet',
  title: 'Introducing Claude 3.5 Sonnet',
  author: 'Anthropic',
  publishDate: '2024-06-20',
  siteName: 'Anthropic',
};

export default function CitationPage() {
  const [style, setStyle] = useState('APA');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [siteName, setSiteName] = useState('');
  const [result, setResult] = useState<CitationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setUrl(SAMPLE.url);
    setTitle(SAMPLE.title);
    setAuthor(SAMPLE.author);
    setPublishDate(SAMPLE.publishDate);
    setSiteName(SAMPLE.siteName);
  };

  const generate = async () => {
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/citation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, author, publishDate, siteName, style }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【引用情報】スタイル: ${style}`);
    lines.push('');
    lines.push('--- 引用文 ---');
    lines.push(result.citation);
    lines.push('');
    lines.push('--- 本文中引用 ---');
    lines.push(result.inline_citation);
    lines.push('');
    lines.push('--- 参考文献リスト ---');
    lines.push(result.bibliography_entry);
    lines.push('');
    if (result.missing_info && result.missing_info.length > 0) {
      lines.push('--- 不足情報 ---');
      result.missing_info.forEach(m => lines.push(`・${m}`));
      lines.push('');
    }
    if (result.tips) {
      lines.push('--- アドバイス ---');
      lines.push(result.tips);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `citation_${style}_${Date.now()}.txt`;
    a.click();
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={progressLoading} progress={progress} label="引用情報を生成中..." />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📚 引用元自動生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        URL・タイトル・著者情報からAPA/MLA/Chicago等の正式な引用形式を自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/research', icon: '🔬', label: '文献検索' },
          { href: '/dashboard/fact-check', icon: '✅', label: 'ファクトチェック' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>引用情報を入力</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        {/* スタイル選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>引用スタイル</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {STYLES.map(s => (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                style={{
                  padding: '12px 12px', borderRadius: 10, cursor: 'pointer',
                  border: style === s.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: style === s.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                  color: style === s.value ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: style === s.value ? 700 : 500,
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div>{s.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* URL */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
        </div>

        {/* タイトル */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>タイトル</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="記事・論文のタイトル" style={inputStyle} />
        </div>

        {/* 著者・公開日 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>著者</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="著者名" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>公開日</label>
            <input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* サイト名 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>サイト名</label>
          <input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="Webサイト名" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={generate} disabled={loading} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}>
            {loading ? '生成中...' : '引用を生成'}
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
          引用情報をAIが生成しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`引用(${style}): ${title || url || 'Untitled'}`}
              content={`${result.citation}\n\n本文中: ${result.inline_citation}\n\n参考文献: ${result.bibliography_entry}`}
              type="citation"
              groupName="引用"
              tags={`引用,${style}`}
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
          </div>

          {/* 引用文（メインハイライト） */}
          <div style={{
            background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
            border: '2px solid #6c63ff40',
            borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>引用文（{style}形式）</div>
              <button
                onClick={() => copyText(result.citation, 'citation')}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #6c63ff40', background: 'transparent', color: '#6c63ff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
              >
                {copied === 'citation' ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 500, wordBreak: 'break-all' }}>
              {result.citation}
            </div>
          </div>

          {/* 本文中引用 */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>本文中引用</div>
              <button
                onClick={() => copyText(result.inline_citation, 'inline')}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
              >
                {copied === 'inline' ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
            <div style={{
              fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.6,
              padding: '10px 16px', background: 'var(--bg-primary)', borderRadius: 8,
              border: '1px solid var(--border)', fontFamily: 'monospace',
            }}>
              {result.inline_citation}
            </div>
          </div>

          {/* 参考文献リスト */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>参考文献リスト用</div>
              <button
                onClick={() => copyText(result.bibliography_entry, 'bib')}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
              >
                {copied === 'bib' ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {result.bibliography_entry}
            </div>
          </div>

          {/* 不足情報の警告 */}
          {result.missing_info && result.missing_info.length > 0 && (
            <div style={{
              background: 'rgba(245,166,35,0.08)',
              border: '1px solid rgba(245,166,35,0.25)',
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>
                ⚠ 不足している情報
              </div>
              {result.missing_info.map((info, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: '#f5a623', fontWeight: 700, flexShrink: 0 }}>•</span>
                  {info}
                </div>
              ))}
            </div>
          )}

          {/* アドバイス */}
          {result.tips && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
              borderLeft: '4px solid #4ade80',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
                💡 アドバイス
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.tips}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
