'use client';
import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import BuzzLibraryList from '@/components/buzz/BuzzLibraryList';
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
type Mode = 'single' | 'multi' | 'pattern';
type TabKey = 'execute' | 'library';

const MODE_OPTIONS: Array<{ value: Mode; label: string; desc: string }> = [
  { value: 'single', label: '📚 単一URL分析', desc: '1本の記事を多角的に分析' },
  { value: 'multi', label: '📋 5本まとめ分析', desc: '複数記事から共通要素を抽出' },
  { value: 'pattern', label: '🎯 分野別バズりパターン', desc: '分野の典型パターンを5つ生成' },
];

// 媒体（メディアタイプ）— 未指定時は 'note' で従来動作
const MEDIA_TYPES = [
  { key: 'note', label: '📝 note記事' },
  { key: 'x', label: '🐦 X投稿' },
  { key: 'blog', label: '📰 ブログ記事' },
  { key: 'instagram', label: '📷 Instagram投稿' },
  { key: 'lp', label: '🎯 ランディングページ' },
  { key: 'ad', label: '💰 広告コピー' },
] as const;
type MediaType = typeof MEDIA_TYPES[number]['key'];

const DEPTH_OPTIONS: Array<{ value: Depth; label: string; desc: string }> = [
  { value: 'light', label: '⚡ ライト', desc: 'ざっくり要点（〜2000字 / 約20秒）' },
  { value: 'standard', label: '📊 スタンダード', desc: 'バランス重視（〜4000字 / 約40秒）' },
  { value: 'deep', label: '🔬 ディープ', desc: '徹底分析（〜8000字 / 約90秒）' },
];

const SINGLE_TEMPLATES = [
  { label: 'note 人気記事の構成分析', placeholder: 'https://note.com/xxx/n/xxx' },
  { label: 'Web メディアのバズり記事', placeholder: 'https://example.com/article' },
  { label: '自分の競合記事を学ぶ', placeholder: 'https://competitor.com/post' },
];

const FIELD_TEMPLATES = [
  '副業ブログ',
  '育児・子育て',
  '学び・スキルアップ',
  'ビジネス・キャリア',
  '健康・ライフスタイル',
  '自己啓発・マインドセット',
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
  const [tab, setTab] = useState<TabKey>('execute');
  // 蓄積一覧の再フェッチトリガ（保存後にインクリメント）
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [mode, setMode] = useState<Mode>('single');
  const [mediaType, setMediaType] = useState<MediaType>('note');
  // バズりパターン抽出
  const [extractingPatterns, setExtractingPatterns] = useState(false);
  const [extractedPatterns, setExtractedPatterns] = useState<any[] | null>(null);
  const [selectedPatternIndices, setSelectedPatternIndices] = useState<Set<number>>(new Set());
  const [savingPatterns, setSavingPatterns] = useState(false);
  const [url, setUrl] = useState('');
  const [urls, setUrls] = useState<string[]>(['', '', '', '', '']);
  const [field, setField] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [report, setReport] = useState('');
  const [reportModel, setReportModel] = useState<AIModel | null>(null);
  const [reportMode, setReportMode] = useState<Mode | null>(null);
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

  // モード切替時にエラー・結果をクリア
  const switchMode = (newMode: Mode) => {
    if (loading) return;
    setMode(newMode);
    setErrorMsg('');
  };

  // multi モード: 個別URLの更新
  const updateMultiUrl = (idx: number, value: string) => {
    setUrls(prev => prev.map((u, i) => (i === idx ? value : u)));
  };

  // 実行前バリデーション → リクエストボディ組み立て
  const buildRequestBody = (): { body: any; label: string } | { error: string } => {
    if (mode === 'single') {
      const u = url.trim();
      if (!u) return { error: 'URL を入力してください' };
      if (!isValidUrl(u)) return { error: 'URL は http:// または https:// で始めてください' };
      return { body: { mode: 'single', url: u }, label: u };
    }
    if (mode === 'multi') {
      const cleanUrls = urls.map(u => u.trim()).filter(u => u.length > 0);
      if (cleanUrls.length < 2) {
        return { error: '2本以上のURLを入力してください（最大5本）' };
      }
      const invalid = cleanUrls.filter(u => !isValidUrl(u));
      if (invalid.length > 0) {
        return { error: `URL は http:// または https:// で始めてください（不正: ${invalid.length}件）` };
      }
      return { body: { mode: 'multi', urls: cleanUrls }, label: `${cleanUrls.length}本まとめ` };
    }
    // pattern
    const f = field.trim();
    if (!f) return { error: '分野名を入力してください' };
    return { body: { mode: 'pattern', field: f }, label: f };
  };

  const analyze = async () => {
    const built = buildRequestBody();
    if ('error' in built) {
      setErrorMsg(built.error);
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
      setReportMode(mode);
      const reqBody = JSON.stringify({ ...built.body, depth, mediaType, model: modelAtRequest });
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

  // 結果保存・MDダウンロード用のメタ情報（モード別）
  const getSaveMeta = () => {
    const m = reportMode || mode;
    if (m === 'single') {
      return {
        title: `バズり分析: ${url.slice(0, 60)}`,
        tags: 'バズり分析,単一URL',
        downloadLabel: 'バズり分析',
        downloadHeader: `> 対象URL: ${url}\n`,
        fallback: url ? `バズり分析_${url.slice(0, 40)}` : 'バズり分析',
      };
    }
    if (m === 'multi') {
      const cleanUrls = urls.filter(u => u.trim());
      return {
        title: `バズり分析(${cleanUrls.length}本まとめ): ${cleanUrls[0]?.slice(0, 40) || ''}`,
        tags: 'バズり分析,5本まとめ',
        downloadLabel: 'バズり分析_5本まとめ',
        downloadHeader: `> 対象URL一覧:\n${cleanUrls.map(u => `> - ${u}`).join('\n')}\n`,
        fallback: 'バズり分析_5本まとめ',
      };
    }
    // pattern
    return {
      title: `バズり分析(分野別): ${field}`,
      tags: 'バズり分析,分野別パターン',
      downloadLabel: 'バズり分析_分野別パターン',
      downloadHeader: `> 対象分野: ${field}\n`,
      fallback: field ? `バズり分析_${field}` : 'バズり分析_分野別',
    };
  };

  const download = async () => {
    if (!report.trim()) return;
    setDownloadingMd(true);
    try {
      const meta = getSaveMeta();
      const autoTitle = await generateTitleWithTimeout(report, meta.downloadLabel, meta.fallback);
      const fileTitle = sanitizeFilename(autoTitle);
      const modelLine = reportModel
        ? `> 生成AI: ${getModelIcon(reportModel)} ${getModelLabel(reportModel)}\n${meta.downloadHeader}\n---\n\n`
        : `${meta.downloadHeader}\n---\n\n`;
      const md = `# ${autoTitle}\n\n${modelLine}${report}`;
      triggerDownload(`${fileTitle}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
    } finally {
      setDownloadingMd(false);
    }
  };

  // パターン抽出（バズり分析結果から再利用可能な型を抽出）
  const handleExtractPatterns = async () => {
    if (!report.trim()) return;
    setExtractingPatterns(true);
    try {
      const res = await fetch('/api/buzz-pattern-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisContent: report,
          mediaType,
        }),
      });

      // 非OK時は JSON でない可能性があるので text() で読んでからフォールバック解析
      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try {
          const j = JSON.parse(text);
          errMsg = j.error || j.message || text;
        } catch {
          // text のまま
        }
        throw new Error(`抽出失敗 (${res.status}): ${errMsg.slice(0, 200)}`);
      }

      const data = await res.json();
      if (Array.isArray(data.patterns)) {
        setExtractedPatterns(data.patterns);
        setSelectedPatternIndices(new Set(data.patterns.map((_: any, i: number) => i)));
      } else {
        alert(`抽出エラー: ${data.error || '不明なエラー'}`);
      }
    } catch (e: any) {
      alert(`通信エラー: ${e?.message || e}`);
    } finally {
      setExtractingPatterns(false);
    }
  };

  // 選択したパターンを library テーブルに type='buzz-pattern' で保存
  const handleSaveSelectedPatterns = async () => {
    if (!extractedPatterns) return;
    const selected = extractedPatterns.filter((_, i) => selectedPatternIndices.has(i));
    if (selected.length === 0) {
      alert('保存するパターンを選択してください');
      return;
    }
    setSavingPatterns(true);
    let saved = 0;
    for (const p of selected) {
      try {
        const examples = Array.isArray(p.examples) ? p.examples : [];
        const scenarios = Array.isArray(p.applicableScenarios) ? p.applicableScenarios : [];
        const content = `## ${p.title}

### カテゴリ
${p.category}

### フレームワーク
${p.framework}

### 説明
${p.description}

### 構造・テンプレート
${p.structure}

### 具体例
${examples.map((ex: string, i: number) => `${i + 1}. ${ex}`).join('\n')}

### 使えるシーン
${scenarios.map((sc: string) => `- ${sc}`).join('\n')}
`;
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'buzz-pattern',
            title: p.title,
            content,
            metadata: {
              category: p.category,
              framework: p.framework,
              mediaType,
              description: p.description,
              structure: p.structure,
              examples,
              applicableScenarios: scenarios,
              extractedAt: new Date().toISOString(),
            },
            tags: p.tags || `${p.category},${p.framework}`,
            group_name: 'バズりパターン辞書',
            is_favorite: false,
          }),
        });
        if (res.ok) saved++;
      } catch {}
    }
    setSavingPatterns(false);
    alert(`✅ ${saved}/${selected.length} 件のパターンを辞書に保存しました。\nサイドバーの「📖 バズりパターン辞書」から確認できます。`);
    setExtractedPatterns(null);
    setSelectedPatternIndices(new Set());
  };

  // 実行ボタンラベル
  const submitLabel = () => {
    if (loading) return `🔍 分析中... ${elapsed}秒`;
    if (mode === 'single') return '🚀 バズり要素を分析';
    if (mode === 'multi') return '🚀 5本まとめてバズり要素を分析';
    return '🚀 この分野のバズりパターンを分析';
  };

  // ローディング中の説明文
  const loadingMsg = () => {
    if (mode === 'single') return '記事の本文取得 → バズり要素分析中...（混雑時は自動でリトライします）';
    if (mode === 'multi') return '複数記事の本文を並列取得 → 共通要素を分析中...（混雑時は自動でリトライします）';
    return '分野別の典型バズりパターンを生成中...';
  };

  const saveMeta = getSaveMeta();

  // タブ切替（蓄積一覧に切替時は最新化）
  const switchTab = (next: TabKey) => {
    setTab(next);
    if (next === 'library') {
      setLibraryRefreshKey(k => k + 1);
    }
  };

  const TABS: Array<{ key: TabKey; label: string; color: string }> = [
    { key: 'execute', label: '🚀 分析実行', color: 'var(--accent)' },
    { key: 'library', label: '📁 蓄積一覧', color: '#8b5cf6' },
  ];

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="📊 バズり要素を分析中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📊 バズり分析</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        Claude AI または {GEMINI_TEXT_MODEL_LABEL} が note・Web 記事のバズり要素を3つのモードで言語化します。
      </p>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? t.color : 'transparent'}`,
                color: active ? t.color : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 蓄積一覧タブ */}
      <div style={{ display: tab === 'library' ? 'block' : 'none' }}>
        <BuzzLibraryList
          refreshKey={libraryRefreshKey}
          onSwitchToExecute={() => switchTab('execute')}
        />
      </div>

      {/* 分析実行タブ（既存3モード機能） */}
      <div style={{ display: tab === 'execute' ? 'block' : 'none' }}>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>

        {/* 媒体選択（3モード共通） */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📺 媒体を選択</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MEDIA_TYPES.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMediaType(m.key)}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 20,
                  border: mediaType === m.key ? '1px solid transparent' : '1px solid var(--border)',
                  background: mediaType === m.key
                    ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                    : 'var(--bg-primary)',
                  color: mediaType === m.key ? '#fff' : 'var(--text-secondary)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: mediaType === m.key ? 700 : 500,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            ※ 選択した媒体の特性に応じて分析観点を最適化します（未選択時は note 記事として分析）
          </div>
        </div>

        {/* モード選択タブ */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>分析モード</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {MODE_OPTIONS.map(m => (
              <button
                key={m.value}
                onClick={() => switchMode(m.value)}
                disabled={loading}
                style={{
                  padding: '12px 8px',
                  borderRadius: 8,
                  border: mode === m.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  background: mode === m.value ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  color: mode === m.value ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center' as const,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <div>{m.label}</div>
                <div style={{ fontSize: 11, marginTop: 3, fontWeight: 400 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

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

        {/* モード別: 入力欄 */}
        {mode === 'single' && (
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
        )}

        {mode === 'multi' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>比較する記事の URL（最大5本、最低2本）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {urls.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 36, fontWeight: 600 }}>#{i + 1}</span>
                  <input
                    type="url"
                    value={u}
                    onChange={e => updateMultiUrl(i, e.target.value)}
                    placeholder={i === 0 ? 'https://note.com/xxx/n/xxx（1本目）' : `URL ${i + 1} 本目（任意）`}
                    style={{
                      flex: 1,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      padding: '10px 12px',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              ※ 全URLの本文取得後、共通するバズり要素 TOP5 を1回の AI 分析で生成します（5本中3本以上の取得成功が必要）
            </div>
          </div>
        )}

        {mode === 'pattern' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>分析する分野・テーマ</div>
            <input
              type="text"
              value={field}
              onChange={e => setField(e.target.value)}
              placeholder="例: 副業ブログ / 育児 / ビジネス書レビュー"
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
              ※ URL 取得は不要です。分野名から AI が「典型バズりパターン」を5つ生成します
            </div>

            {/* 分野別クイックテンプレート */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>分野をクイック選択：</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FIELD_TEMPLATES.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setField(f)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: field === f ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: field === f ? 'var(--accent-soft)' : 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
            {submitLabel()}
          </button>
        </div>
      </div>

      {/* single モードのみ: URL クイックテンプレート（プレースホルダ） */}
      {mode === 'single' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート（URL の参考プレースホルダ）</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SINGLE_TEMPLATES.map(t => (
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
      )}

      {loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>{loadingMsg()}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / 分析には20〜120秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>📊 バズり分析レポート</span>
              <SaveToLibraryButton
                title={saveMeta.title}
                content={report}
                type="buzz-analysis"
                groupName="バズり分析"
                tags={saveMeta.tags}
                metadata={{
                  mode: reportMode || mode,
                  depth,
                  url: reportMode === 'single' ? url : undefined,
                  urls: reportMode === 'multi' ? urls.filter(u => u.trim()) : undefined,
                  field: reportMode === 'pattern' ? field : undefined,
                }}
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
              <button
                onClick={handleExtractPatterns}
                disabled={extractingPatterns || !report.trim()}
                style={{
                  padding: '6px 14px',
                  background: extractingPatterns
                    ? 'var(--bg-secondary)'
                    : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  border: 'none',
                  color: extractingPatterns ? 'var(--text-muted)' : '#fff',
                  borderRadius: 6,
                  cursor: extractingPatterns ? 'wait' : 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title="分析結果から再利用可能な型・パターンを抽出して辞書に追加"
              >
                {extractingPatterns ? '🔄 抽出中...' : '📖 パターンを抽出して辞書に追加'}
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
            <span>モード: {MODE_OPTIONS.find(m => m.value === (reportMode || mode))?.label}</span>
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

      </div>{/* /分析実行タブ */}

      {/* バズりパターン抽出プレビューモーダル */}
      {extractedPatterns && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={() => !savingPatterns && setExtractedPatterns(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)', fontSize: 20 }}>
              📖 抽出されたパターン（{extractedPatterns.length}件）
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              辞書に保存するパターンを選択してください。カードをクリックで選択/解除。
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setSelectedPatternIndices(new Set(extractedPatterns.map((_, i) => i)))}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={() => setSelectedPatternIndices(new Set())}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                すべて解除
              </button>
            </div>

            {extractedPatterns.map((p, i) => {
              const isSelected = selectedPatternIndices.has(i);
              return (
                <div
                  key={i}
                  onClick={() => {
                    const next = new Set(selectedPatternIndices);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setSelectedPatternIndices(next);
                  }}
                  style={{
                    padding: 16,
                    marginBottom: 12,
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>{p.title}</h3>
                    <span style={{
                      fontSize: 11, color: 'var(--text-secondary)',
                      padding: '2px 8px', borderRadius: 10,
                      background: 'var(--accent-soft)',
                    }}>
                      {p.category} / {p.framework}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, marginTop: 8, marginBottom: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {p.description}
                  </p>
                  <details
                    style={{ fontSize: 12, color: 'var(--text-muted)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <summary style={{ cursor: 'pointer', userSelect: 'none' }}>詳細を見る</summary>
                    <div style={{ marginTop: 8, paddingLeft: 8 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>構造・テンプレート:</div>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg-primary)', padding: 8, borderRadius: 6, color: 'var(--text-secondary)' }}>
{p.structure}
                      </pre>
                      {Array.isArray(p.examples) && p.examples.length > 0 && (
                        <>
                          <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>具体例:</div>
                          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)' }}>
                            {p.examples.map((ex: string, j: number) => <li key={j}>{ex}</li>)}
                          </ul>
                        </>
                      )}
                      {Array.isArray(p.applicableScenarios) && p.applicableScenarios.length > 0 && (
                        <>
                          <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>使えるシーン:</div>
                          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)' }}>
                            {p.applicableScenarios.map((sc: string, j: number) => <li key={j}>{sc}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  </details>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => setExtractedPatterns(null)}
                disabled={savingPatterns}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: savingPatterns ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveSelectedPatterns}
                disabled={savingPatterns || selectedPatternIndices.size === 0}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: savingPatterns || selectedPatternIndices.size === 0
                    ? 'var(--bg-secondary)'
                    : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: savingPatterns || selectedPatternIndices.size === 0 ? 'var(--text-muted)' : '#fff',
                  cursor: savingPatterns ? 'wait' : selectedPatternIndices.size === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {savingPatterns
                  ? '💾 保存中...'
                  : `✓ 選択した ${selectedPatternIndices.size} 件を辞書に保存`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
