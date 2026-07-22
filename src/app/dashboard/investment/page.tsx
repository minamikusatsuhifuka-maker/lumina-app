'use client';
import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import { useRef, useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import InlineAnalysisPanel from '@/components/text-analysis/InlineAnalysisPanel';
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
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';

type Insights = {
  summary: string;
  advice: string;
  keywords: string[];
};

type InvestmentMode = 'world' | 'sector' | 'future' | 'custom';

const MODE_OPTIONS: Array<{ value: InvestmentMode; label: string; desc: string }> = [
  { value: 'world', label: '🌍 世界情勢', desc: '地政学・経済動向から包括分析' },
  { value: 'sector', label: '📊 分野別トレンド', desc: '業界・分野の成長性検証' },
  { value: 'future', label: '🔮 未来予測', desc: '3〜5年先の発展シナリオ' },
  { value: 'custom', label: '💡 個別検証', desc: '銘柄・候補を多角的に分析' },
];

const TEMPLATES = [
  { label: '米中対立と半導体', topic: '米中対立の半導体業界への影響と日本・韓国・台湾企業の動向' },
  { label: '2030年のAI市場', topic: '2030年に向けた生成AI・AGI市場の発展予測と恩恵を受ける業界' },
  { label: '再エネ分野の注目銘柄', topic: '再生可能エネルギー分野における注目の国内外企業と成長要因' },
  { label: 'インド経済の成長性', topic: 'インド経済の中長期的成長性と投資視点での注目セクター' },
  { label: '医療・バイオの未来予測', topic: '医療・バイオテクノロジー分野の今後5年の発展シナリオ' },
  { label: '日本の電気自動車戦略', topic: '日本のEV市場戦略と国内自動車メーカーの中長期的な競争力' },
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

const processInline = (text: string): string => {
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">$1 ↗</a>'
  );
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
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      return `<div style="font-size:0.85em;color:var(--text-muted);padding:4px 0 4px 12px;border-left:2px solid rgba(0,212,184,0.3);margin:4px 0;">${processInline(t)}</div>`;
    }
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';
    if (t === '') return '<div style="height:8px"></div>';
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
  });
  return html.join('');
};

export default function InvestmentResearchPage() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<InvestmentMode>('custom');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
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
  // 追加機能: 要約・アドバイス・関連キーワード
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [downloadingAdvice, setDownloadingAdvice] = useState(false);
  const topicInputRef = useRef<HTMLTextAreaElement | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  // 要約・アドバイス・関連キーワードを取得
  const fetchInsights = async (reportText: string, reportTopic: string) => {
    if (!reportText.trim() || !reportTopic.trim()) return;
    setInsightsLoading(true);
    setInsights(null);
    try {
      const res = await fetch('/api/investment-research/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: reportText, topic: reportTopic, model: getSavedModel() }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Insights & { error?: string };
      setInsights({
        summary: data.summary ?? '',
        advice: data.advice ?? '',
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
      });
    } catch {
      // メインレポートには影響させない
    } finally {
      setInsightsLoading(false);
    }
  };

  // 関連キーワードをクリック → 再リサーチ（ループ可能）
  const handleKeywordClick = (keyword: string) => {
    setTopic(keyword);
    setReport('');
    setInsights(null);
    // 入力欄へスクロール
    setTimeout(() => {
      topicInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      topicInputRef.current?.focus();
    }, 50);
    // state 反映後にリサーチ実行
    setTimeout(() => {
      research(keyword);
    }, 100);
  };

  // 要約・アドバイスを MD としてダウンロード
  const downloadInsightMd = async (
    kind: 'summary' | 'advice',
    body: string,
    setBusy: (b: boolean) => void,
  ) => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const label = kind === 'summary' ? '投資予測_要約' : '投資予測_AIアドバイス';
      const fallback = topic ? `${label}_${topic}` : label;
      const autoTitle = await generateTitleWithTimeout(body, label, fallback);
      const fileTitle = sanitizeFilename(autoTitle);
      const modelLine = reportModel
        ? `> 生成AI: ${getModelIcon(reportModel)} ${getModelLabel(reportModel)}\n\n---\n\n`
        : '';
      const md = `# ${autoTitle}\n\n${modelLine}${body}`;
      triggerDownload(`${fileTitle}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
    } finally {
      setBusy(false);
    }
  };

  const research = async (t?: string) => {
    const q = t || topic;
    if (!q.trim()) return;
    setLoading(true);
    startProgress();
    setReport('');
    setInsights(null);
    setElapsed(0);
    setTrafficStats(null);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const modelAtRequest = getSavedModel();
      setReportModel(modelAtRequest);
      const reqBody = JSON.stringify({
        topic: q,
        mode,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        model: modelAtRequest,
      });
      const requestBytes = new TextEncoder().encode(reqBody).length;

      const res = await retryFetch('/api/investment-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
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
              setReport(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }

      setTrafficStats({
        requestBytes,
        responseBytes,
        totalBytes: requestBytes + responseBytes,
      });

      // メインレポート完了後、追加機能（要約・アドバイス・関連キーワード）を生成
      if (accumulated.trim() && !accumulated.startsWith('エラー') && !accumulated.startsWith('通信エラー')) {
        fetchInsights(accumulated, q).catch(() => {});
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

  const download = async () => {
    if (!report.trim()) return;
    setDownloadingMd(true);
    try {
      const label = '投資予測';
      const fallback = topic ? `${label}_${topic}` : label;
      const autoTitle = await generateTitleWithTimeout(report, label, fallback);
      const fileTitle = sanitizeFilename(autoTitle);
      const modelLine = reportModel
        ? `> 生成AI: ${getModelIcon(reportModel)} ${getModelLabel(reportModel)}\n\n---\n\n`
        : '';
      const md = `# ${autoTitle}\n\n${modelLine}${report}`;
      triggerDownload(`${fileTitle}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
    } finally {
      setDownloadingMd(false);
    }
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="📈 投資予測リサーチ実行中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📈 投資予測</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        Claude AI または {GEMINI_TEXT_MODEL_LABEL} が、世界情勢・市場動向を統合し、投資先の候補や可能性を多角的に検証します
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>

        {/* モード選択 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>分析モード</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {MODE_OPTIONS.map(m => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: mode === m.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: mode === m.value ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  color: mode === m.value ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center' as const,
                }}
              >
                <div>{m.label}</div>
                <div style={{ fontSize: 11, marginTop: 3, fontWeight: 400 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* テーマ入力 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>テーマ・検証対象</div>
          <div style={{ position: 'relative' }}>
            <textarea
              ref={topicInputRef}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={'例：米中対立の半導体業界への影響と注目企業\n例：トヨタ自動車の中長期的な競争力検証'}
              style={{
                width: '100%',
                minHeight: 80,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 14,
                padding: 12,
                paddingRight: 48,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.7,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
              <VoiceInputButton size="sm" onResult={(text) => setTopic(prev => prev + text)} />
            </div>
          </div>
        </div>

        {/* 期間指定 */}
        <details style={{ marginBottom: 16 }}>
          <summary style={{
            cursor: 'pointer',
            padding: '8px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}>
            📅 対象期間を指定する（任意）
            {(periodStart || periodEnd) && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>
                ✓ {periodStart || '指定なし'} 〜 {periodEnd || '現在まで'}
              </span>
            )}
          </summary>
          <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>開始日</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>
            <span style={{ color: 'var(--text-muted)', marginTop: 16 }}>〜</span>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>終了日</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>
            {(periodStart || periodEnd) && (
              <button
                type="button"
                onClick={() => { setPeriodStart(''); setPeriodEnd(''); }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  marginTop: 16,
                }}
              >
                クリア
              </button>
            )}
          </div>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            ※ 指定した期間の情報を中心に分析します。AI 検索の制約により完全な期間絞り込みではありませんが、AI に明示的に指示することで精度を高めます。
          </p>
        </details>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => research()}
            disabled={loading}
            style={{
              padding: '10px 28px',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? `🔍 分析中... ${elapsed}秒` : '🚀 投資予測リサーチ実行'}
          </button>
        </div>
      </div>

      {/* クイックテンプレート */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => { setTopic(t.topic); research(t.topic); }}
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
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>市場動向・世界情勢を統合分析中...（混雑時は自動でリトライします）</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / 投資予測は30〜60秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>📈 投資予測レポート</span>
              <SaveToLibraryButton
                title={`投資予測: ${topic}`}
                content={report}
                type="deepresearch"
                groupName="投資予測"
                tags="投資予測"
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
                onClick={() => copyToClipboard(report)}
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
            {reportModel && (
              <span>使用モデル: {getModelIcon(reportModel)} {getModelLabel(reportModel)}</span>
            )}
            {trafficStats && (
              <span>通信量: {formatBytes(trafficStats.totalBytes)}（送信 {formatBytes(trafficStats.requestBytes)} / 受信 {formatBytes(trafficStats.responseBytes)}）</span>
            )}
          </div>
        </div>
      )}

      {/* 追加機能: 生成中インジケータ */}
      {report && !loading && insightsLoading && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '2px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>要約・アドバイス・関連キーワードを生成中...</div>
        </div>
      )}

      {/* 要約カード */}
      {report && !loading && insights && insights.summary && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>📝 要約（1000字以内）</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => copyToClipboard(insights.summary)}
                style={{ padding: '5px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                📋 コピー
              </button>
              <button
                onClick={() => downloadInsightMd('summary', insights.summary, setDownloadingSummary)}
                disabled={downloadingSummary}
                style={{ padding: '5px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: downloadingSummary ? 'not-allowed' : 'pointer', fontSize: 12, opacity: downloadingSummary ? 0.6 : 1 }}
              >
                {downloadingSummary ? '⏳ 生成中...' : '📥 MD'}
              </button>
              <SaveToLibraryButton
                title={`投資予測 要約: ${topic}`}
                content={insights.summary}
                type="deepresearch"
                groupName="投資予測"
                tags="投資予測,要約"
              />
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
            {insights.summary}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
            {insights.summary.length.toLocaleString()} 字
          </div>
        </div>
      )}

      {/* AI アドバイスカード */}
      {report && !loading && insights && insights.advice && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>💡 AI 投資アドバイス（2000字以内）</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => copyToClipboard(insights.advice)}
                style={{ padding: '5px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                📋 コピー
              </button>
              <button
                onClick={() => downloadInsightMd('advice', insights.advice, setDownloadingAdvice)}
                disabled={downloadingAdvice}
                style={{ padding: '5px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: downloadingAdvice ? 'not-allowed' : 'pointer', fontSize: 12, opacity: downloadingAdvice ? 0.6 : 1 }}
              >
                {downloadingAdvice ? '⏳ 生成中...' : '📥 MD'}
              </button>
              <SaveToLibraryButton
                title={`投資予測 AIアドバイス: ${topic}`}
                content={insights.advice}
                type="deepresearch"
                groupName="投資予測"
                tags="投資予測,AIアドバイス"
              />
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
            {insights.advice}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
            {insights.advice.length.toLocaleString()} 字
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            ⚠️ 本アドバイスは情報提供を目的とした AI 生成内容です。投資判断は最終的に自己責任でお願いします。
          </div>
        </div>
      )}

      {/* 関連キーワードカード */}
      {report && !loading && insights && insights.keywords.length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>🔗 関連情報・関連キーワード</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              （クリックで再リサーチ）
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {insights.keywords.map((kw, i) => (
              <button
                key={`${kw}-${i}`}
                onClick={() => handleKeywordClick(kw)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  border: '1px solid rgba(245,158,11,0.35)',
                  background: 'rgba(245,158,11,0.08)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.18)';
                  e.currentTarget.style.borderColor = '#f59e0b';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(245,158,11,0.35)';
                }}
                title={`「${kw}」で再リサーチ`}
              >
                🔍 {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ブラッシュアップ（既存 InlineAnalysisPanel 埋め込み） */}
      {report && !loading && (
        <div style={{ marginTop: 16 }}>
          <InlineAnalysisPanel text={report} topic={topic} />
        </div>
      )}
    </div>
  );
}
