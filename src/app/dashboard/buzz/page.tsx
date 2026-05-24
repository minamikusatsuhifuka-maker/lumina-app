'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import {
  getSavedModel,
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';

type Depth = 'light' | 'standard' | 'deep';

const DEPTH_OPTIONS: Array<{ value: Depth; label: string; desc: string }> = [
  { value: 'light', label: '⚡ ライト', desc: 'ざっくり要点（〜2000字 / 約20秒）' },
  { value: 'standard', label: '📊 スタンダード', desc: 'バランス重視（〜4000字 / 約40秒）' },
  { value: 'deep', label: '🔬 ディープ', desc: '徹底分析（〜8000字 / 約90秒）' },
];

const TEMPLATES = [
  { label: 'note 人気記事の構成分析', placeholder: 'https://note.com/xxx/n/xxx' },
  { label: 'Web メディアのバズり記事', placeholder: 'https://example.com/article' },
  { label: '自分の競合記事を学ぶ', placeholder: 'https://competitor.com/post' },
];

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const waitMs = (i + 1) * 3000;
    await new Promise(r => setTimeout(r, waitMs));
  }
  return fetch(url, options);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 投資予測ページと共通: インライン整形（太字 / URL リンク化）
const processInline = (text: string): string => {
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');
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
    if (t.startsWith('# ')) return `<div style="font-size:1.25em;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2))}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.1em;font-weight:600;color:var(--text-secondary);margin:16px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3))}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1em;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${processInline(t.slice(4))}</div>`;
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.7;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2])}</span></div>`;
    }
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.7;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2))}</span></div>`;
    }
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';
    if (t === '') return '<div style="height:8px"></div>';
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
  });
  return html.join('');
};

export default function BuzzAnalysisPage() {
  const [url, setUrl] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [report, setReport] = useState('');
  const [reportModel, setReportModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingMd, setDownloadingMd] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [trafficStats, setTrafficStats] = useState<{
    requestBytes: number;
    responseBytes: number;
    totalBytes: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const isValidUrl = (s: string) => /^https?:\/\/.+/.test(s.trim());

  const analyze = async (targetUrl?: string) => {
    const u = (targetUrl || url).trim();
    if (!u) {
      setErrorMsg('URL を入力してください');
      return;
    }
    if (!isValidUrl(u)) {
      setErrorMsg('URL は http:// または https:// で始めてください');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    startProgress();
    setReport('');
    setElapsed(0);
    setTrafficStats(null);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const modelAtRequest = getSavedModel();
      setReportModel(modelAtRequest);
      const reqBody = JSON.stringify({ url: u, depth, model: modelAtRequest });
      const requestBytes = new TextEncoder().encode(reqBody).length;

      const res = await retryFetch('/api/buzz-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        setReport('');
        setErrorMsg(errData.error || `エラーが発生しました（HTTP ${res.status}）`);
        clearInterval(timer);
        setLoading(false);
        resetProgress();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let responseBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) responseBytes += value.byteLength;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') {
              accumulated += json.content;
              setReport(accumulated);
            } else if (json.type === 'error') {
              setErrorMsg(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }

      setTrafficStats({
        requestBytes,
        responseBytes,
        totalBytes: requestBytes + responseBytes,
      });
    } catch (error: any) {
      setErrorMsg(`通信エラー: ${error.message}`);
      resetProgress();
    } finally {
      clearInterval(timer);
      setLoading(false);
      completeProgress();
    }
  };

  const download = async () => {
    if (!report.trim()) return;
    setDownloadingMd(true);
    try {
      const label = 'バズり分析';
      const fallback = url ? `${label}_${url.slice(0, 40)}` : label;
      const autoTitle = await generateTitleWithTimeout(report, label, fallback);
      const fileTitle = sanitizeFilename(autoTitle);
      const modelLine = reportModel
        ? `> 生成AI: ${getModelIcon(reportModel)} ${getModelLabel(reportModel)}\n> 対象URL: ${url}\n\n---\n\n`
        : `> 対象URL: ${url}\n\n---\n\n`;
      const md = `# ${autoTitle}\n\n${modelLine}${report}`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${fileTitle}_${yyyymmdd()}.md`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setDownloadingMd(false);
    }
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="📊 バズり要素を分析中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📊 バズり分析</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        Claude AI または Gemini 3.5 Flash が note・Web 記事のバズり要素を分析し、構成・口調・マーケティング要素を言語化します。
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>

        {/* 深さ選択 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>分析の深さ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {DEPTH_OPTIONS.map(d => (
              <button
                key={d.value}
                onClick={() => setDepth(d.value)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: depth === d.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: depth === d.value ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  color: depth === d.value ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center' as const,
                }}
              >
                <div>{d.label}</div>
                <div style={{ fontSize: 11, marginTop: 3, fontWeight: 400 }}>{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* URL 入力 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>分析する記事の URL</div>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://note.com/xxx/n/xxx"
            style={{
              width: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 14,
              padding: '12px 14px',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !loading) analyze();
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            ※ note 記事、ブログ、ニュース、メディア記事など Web 上の公開 URL に対応します
          </div>
        </div>

        {errorMsg && (
          <div style={{
            marginBottom: 12,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            fontSize: 13,
            color: '#ef4444',
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => analyze()}
            disabled={loading}
            style={{
              padding: '10px 28px',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? `🔍 分析中... ${elapsed}秒` : '🚀 バズり要素を分析'}
          </button>
        </div>
      </div>

      {/* クイックテンプレート */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート（URL の参考プレースホルダ）</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setUrl(t.placeholder)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                background: 'var(--accent-soft)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>記事の本文取得 → バズり要素分析中...（混雑時は自動でリトライします）</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / 分析には20〜90秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>📊 バズり分析レポート</span>
              <SaveToLibraryButton
                title={`バズり分析: ${url.slice(0, 60)}`}
                content={report}
                type="buzz-analysis"
                groupName="バズり分析"
                tags="バズり分析"
                metadata={{ url, depth }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(11, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>−</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>＋</button>
              </div>
              <button
                onClick={download}
                disabled={downloadingMd || !report.trim()}
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: downloadingMd ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  opacity: downloadingMd ? 0.6 : 1,
                }}
              >
                {downloadingMd ? '⏳ タイトル生成中...' : '💾 MDダウンロード'}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(report)}
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                📋 コピー
              </button>
            </div>
          </div>

          <div
            style={{ fontSize, color: 'var(--text-secondary)' }}
            dangerouslySetInnerHTML={{ __html: formatReport(report) }}
          />

          {/* メタ情報 */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>文字数: {report.length.toLocaleString()}</span>
            <span>深さ: {DEPTH_OPTIONS.find(d => d.value === depth)?.label}</span>
            {reportModel && (
              <span>使用モデル: {getModelIcon(reportModel)} {getModelLabel(reportModel)}</span>
            )}
            {trafficStats && (
              <span>通信量: {formatBytes(trafficStats.totalBytes)}（送信 {formatBytes(trafficStats.requestBytes)} / 受信 {formatBytes(trafficStats.responseBytes)}）</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
