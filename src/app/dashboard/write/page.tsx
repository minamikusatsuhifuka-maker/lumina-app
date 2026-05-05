'use client';
import { useState, useEffect } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { useWritingTemplates } from '@/hooks/useWritingTemplates';

const ALL_MODES = [
  { key: 'blog',          label: '📝 ブログ',        description: 'SEOを意識した読みやすい長文記事' },
  { key: 'note',          label: '✒️ note',           description: 'noteに最適な共感を生む記事' },
  { key: 'sns_twitter',   label: '𝕏 X投稿文',         description: '140文字以内・拡散されやすい投稿' },
  { key: 'social',        label: '📱 SNS汎用',        description: 'Instagram・FacebookなどSNS全般' },
  { key: 'report',        label: '📊 レポート',       description: '論理的で説得力のあるビジネスレポート' },
  { key: 'email',         label: '📧 メール',         description: '丁寧で伝わりやすいビジネスメール' },
  { key: 'press',         label: '📰 プレスリリース', description: 'メディア向けの公式プレスリリース' },
  { key: 'sns_instagram', label: '📸 Instagram',      description: '絵文字・ハッシュタグ付きキャプション' },
  { key: 'homepage',      label: '🌐 HP・LP',         description: '集客・CVに強いランディングページ文章' },
  { key: 'product',       label: '🛍 商品説明',       description: '購買意欲を高める商品・サービス紹介' },
  { key: 'sns_note',      label: '📓 noteリード文',   description: '読者を引き込む書き出し500字' },
  { key: 'novel',         label: '📚 小説',           description: '読者を引き込む物語・フィクション' },
  { key: 'guide',         label: '📖 解説本',         description: 'わかりやすく丁寧な解説・ガイド文章' },
  { key: 'publish',       label: '🖨 出版用',         description: '出版・書籍向けの高品質な原稿' },
  { key: 'image_prompt',  label: '🎨 画像プロンプト', description: 'Midjourney・DALL-E向け英語プロンプト' },
];

const QUICK_PROMPTS = [
  { label: '詳しく解説', text: 'について、初心者にもわかりやすく詳しく解説してください。' },
  { label: 'メリデメ',   text: 'のメリットとデメリットをそれぞれ5つずつ挙げて解説してください。' },
  { label: '初心者向け', text: 'について、全く知識がない初心者向けにわかりやすく説明してください。' },
  { label: '比較',       text: 'を比較して、それぞれの特徴と向いている人を教えてください。' },
  { label: '事例紹介',   text: 'の具体的な活用事例を5つ紹介してください。' },
  { label: 'まとめ',     text: 'について、重要なポイントをまとめてください。' },
  { label: '最新情報',   text: 'の2026年最新トレンドと今後の展望について解説してください。' },
  { label: 'How To',     text: 'のやり方を、ステップバイステップで詳しく説明してください。' },
];

function calcReadabilityScore(text: string) {
  const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0);
  const avgLen = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length : 0;
  const sentenceScore = avgLen <= 30 ? 25 : avgLen <= 50 ? 20 : avgLen <= 70 ? 15 : 10;

  const kanjiCount = (text.match(/[\u4e00-\u9faf]/g) || []).length;
  const kanjiRate = text.replace(/\s/g, '').length > 0
    ? kanjiCount / text.replace(/\s/g, '').length : 0;
  const kanjiScore = kanjiRate <= 0.2 ? 25 : kanjiRate <= 0.3 ? 20 : kanjiRate <= 0.4 ? 15 : 10;

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const paragraphScore = paragraphs.length >= 3 && paragraphs.length <= 8 ? 25
    : paragraphs.length >= 2 ? 20 : 10;

  const readingPoints = (text.match(/、/g) || []).length;
  const readingRate = sentences.length > 0 ? readingPoints / sentences.length : 0;
  const readingScore = readingRate >= 1 && readingRate <= 3 ? 25
    : readingRate >= 0.5 ? 20 : 10;

  const total = sentenceScore + kanjiScore + paragraphScore + readingScore;

  return {
    total,
    label: total >= 80 ? '読みやすい' as const : total >= 60 ? '普通' as const : '読みにくい' as const,
    details: [
      { name: '文章の長さ', score: sentenceScore, max: 25,
        advice: avgLen > 50 ? '一文が長すぎます。句点で区切りましょう。' : '適切な文長です。' },
      { name: '漢字率', score: kanjiScore, max: 25,
        advice: kanjiRate > 0.3 ? '漢字が多すぎます。ひらがなを増やしましょう。' : '適切な漢字率です。' },
      { name: '段落構成', score: paragraphScore, max: 25,
        advice: paragraphs.length < 3 ? '段落を増やしましょう。話題ごとに改行を。' : '良い段落構成です。' },
      { name: '読点バランス', score: readingScore, max: 25,
        advice: readingRate < 0.5 ? '読点が少なく読みにくいです。' : '適切な読点の使用です。' },
    ],
  };
}

export default function WritePage() {
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();
  const [mode, setMode] = useState('blog');
  const [showAllModes, setShowAllModes] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('casual');
  const [length, setLength] = useState('medium');
  const [audience, setAudience] = useState('general');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [buzzScore, setBuzzScore] = useState<any>(null);
  const [buzzLoading, setBuzzLoading] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [fixLoading, setFixLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [isFavorited, setIsFavorited] = useState(false);
  const [buzzAnalysis, setBuzzAnalysis] = useState<{
    problems: string[];
    suggestions: string[];
    revised: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPurpose, setAnalysisPurpose] = useState('marketing');
  const [analysisTarget, setAnalysisTarget] = useState('general');
  const [showRevised, setShowRevised] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [gensparkResult, setGensparkResult] = useState('');
  const [exportFormat, setExportFormat] = useState('presentation');
  const { templates, isLoading: templatesLoading, saveTemplate, deleteTemplate } = useWritingTemplates();
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [originalText, setOriginalText] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [readability, setReadability] = useState<ReturnType<typeof calcReadabilityScore> | null>(null);
  const [seoTitles, setSeoTitles] = useState<{ title: string; reason: string; score: number }[]>([]);
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showToneButtons, setShowToneButtons] = useState(false);

  // AI改善提案
  const [improveSuggestions, setImproveSuggestions] = useState<Array<{ point: string; detail: string; priority: string }>>([]);
  const [improvedText, setImprovedText] = useState('');
  const [isImproving, setIsImproving] = useState(false);
  const [showImproved, setShowImproved] = useState(false);
  const [improveError, setImproveError] = useState('');

  const handleImprove = async () => {
    if (!output.trim()) return;
    setIsImproving(true);
    setImproveSuggestions([]);
    setImprovedText('');
    setShowImproved(false);
    setImproveError('');

    try {
      const res = await fetch('/api/writing/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: output,
          readabilityScore: readability?.total ?? null,
          scoreDetails: readability?.details ?? null,
          topic: prompt,
          style: mode,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setImproveError(`改善エラー: ${errText.slice(0, 200)}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullJsonText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const parsed = JSON.parse(json);
            if (parsed.type === 'delta' && typeof parsed.text === 'string') {
              fullJsonText += parsed.text;
            } else if (parsed.type === 'done') {
              const text = parsed.fullText || fullJsonText;
              const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
              try {
                const result = JSON.parse(cleaned);
                setImproveSuggestions(result.suggestions ?? []);
                setImprovedText(result.improvedText ?? '');
                setShowImproved(true);
              } catch (e) {
                console.error('[writing/improve] JSONパースエラー:', cleaned.slice(0, 300));
                setImproveError('AI応答のJSON解析に失敗しました。再試行してください。');
              }
            } else if (parsed.type === 'error') {
              setImproveError(`改善エラー: ${parsed.message || ''}`);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err: any) {
      setImproveError(`通信エラー: ${err?.message || String(err)}`);
    } finally {
      setIsImproving(false);
    }
  };

  const handleSuggestTitles = async () => {
    if (!output) return;
    setIsLoadingTitles(true);
    try {
      const res = await fetch('/api/seo-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: output, mode }),
      });
      const data = await res.json();
      setSeoTitles(data.titles ?? []);
    } finally {
      setIsLoadingTitles(false);
    }
  };

  // 続きを書くハンドラ
  const handleContinueWriting = async () => {
    if (!output || isContinuing) return;
    setIsContinuing(true);
    try {
      const response = await fetch('/api/continue-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentText: output, mode, style, audience }),
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta') {
                  setOutput(prev => prev + (data.delta?.text ?? ''));
                }
              } catch {}
            }
          }
        }
      }
    } finally { setIsContinuing(false); }
  };

  // トーン変換ハンドラ
  const TONE_OPTIONS = [
    { key: 'formal',   label: '👔 フォーマルに' },
    { key: 'casual',   label: '😊 カジュアルに' },
    { key: 'shorter',  label: '✂️ 短くする' },
    { key: 'detailed', label: '📖 詳しくする' },
    { key: 'positive', label: '✨ ポジティブに' },
    { key: 'simple',   label: '🎓 わかりやすく' },
  ];
  const handleToneConvert = async (tone: string) => {
    if (!output || isConverting) return;
    setIsConverting(true);
    try {
      const res = await fetch('/api/tone-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: output, tone }),
      });
      const data = await res.json();
      if (data.converted) {
        setOriginalText(output);
        setOutput(data.converted);
      }
      setShowToneButtons(false);
    } finally { setIsConverting(false); }
  };

  useEffect(() => { setIsFavorited(false); }, [output]);

  useEffect(() => {
    const context = localStorage.getItem('lumina_research_context');
    if (context) {
      setPrompt(`【参考情報】\n${context}\n\n【指示】\n`);
      localStorage.removeItem('lumina_research_context');
    }
    // ブレストからの連携データを読み込み
    const brainstormData = sessionStorage.getItem('brainstorm_to_write');
    if (brainstormData) {
      try {
        const { prompt: p, mode: m } = JSON.parse(brainstormData);
        if (p) setPrompt(p);
        if (m) setMode(m);
      } catch {}
      sessionStorage.removeItem('brainstorm_to_write');
    }
    // コンテキストライブラリ・ディープリサーチからの連携（contextId or sessionStorage）
    try {
      const params = new URLSearchParams(window.location.search);
      const contextId = params.get('contextId');
      if (contextId) {
        fetch(`/api/context-saves?id=${contextId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data && data.context_text) {
              setPrompt(`【背景情報】\n${data.context_text}\n\n【指示】\n`);
            }
          })
          .catch(() => {});
      } else {
        const ctx = sessionStorage.getItem('lumina_context_text');
        if (ctx) {
          setPrompt(`【背景情報】\n${ctx}\n\n【指示】\n`);
          sessionStorage.removeItem('lumina_context_text');
          sessionStorage.removeItem('lumina_context_topic');
        }
      }
    } catch {}
  }, []);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    startProgress();
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
      if (text) setReadability(calcReadabilityScore(text));

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
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
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

  const checkBuzz = async () => {
    if (!output) return;
    setBuzzLoading(true);
    setBuzzScore(null);
    setSelectedChecks([]);
    try {
      const res = await fetch('/api/buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: output, mode }),
      });
      const data = await res.json();
      setBuzzScore(data);
    } finally {
      setBuzzLoading(false);
    }
  };

  const autoFix = async () => {
    if (!output || selectedChecks.length === 0) return;
    setFixLoading(true);
    try {
      const checks = buzzScore?.improvements
        ?.filter((imp: any) => selectedChecks.includes(imp.id))
        ?.map((imp: any) => `・${imp.label}：${imp.description}`) || [];

      const res = await fetch('/api/buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: output, mode, checks }),
      });
      const data = await res.json();
      if (data.fixed) {
        setOriginalText(output);
        setOutput(data.fixed);
        setBuzzScore(null);
        setSelectedChecks([]);
      }
    } finally {
      setFixLoading(false);
    }
  };

  const handleBuzzAnalysis = async () => {
    if (!output || !buzzScore) return;
    setIsAnalyzing(true);
    setBuzzAnalysis(null);
    setShowRevised(false);
    try {
      const res = await fetch('/api/analyze-buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: output,
          score: buzzScore.score,
          purpose: analysisPurpose,
          target: analysisTarget,
        }),
      });
      const data = await res.json();
      setBuzzAnalysis(data);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGensparkExport = async (format: string) => {
    setIsExporting(true);
    setExportFormat(format);
    setGensparkResult('');
    try {
      const res = await fetch('/api/genspark-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: output, format }),
      });
      const data = await res.json();
      setGensparkResult(data.result);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setIsSavingTemplate(true);
    const ok = await saveTemplate(templateName, { mode, style, length, audience, prompt });
    if (ok) { setTemplateName(''); setShowSaveInput(false); }
    setIsSavingTemplate(false);
  };

  const handleLoadTemplate = (id: string) => {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setMode(t.mode);
    setStyle(t.style);
    setLength(t.length);
    setAudience(t.audience);
    setPrompt(t.prompt);
    setSelectedTemplateId(id);
  };

  const copy = () => navigator.clipboard.writeText(output).then(() => alert('コピーしました！'));
  const download = (ext: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([output], { type: 'text/plain' }));
    a.download = `lumina_${Date.now()}.${ext}`; a.click();
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="✍️ 文章生成中..." />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>✍️ AI文章作成</h1>
        <a href="/dashboard/library" style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
          📚 下書き一覧
        </a>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Claude Sonnet 4.6 — 高精度ストリーミング生成</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {(showAllModes ? ALL_MODES : ALL_MODES.slice(0, 8)).map(m => (
          <div key={m.key} style={{ position: 'relative' }} className="group">
            <button onClick={() => setMode(m.key)} style={{
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: mode === m.key ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: mode === m.key ? 'var(--accent)' : 'transparent',
              color: mode === m.key ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }} title={m.description}>
              {m.label}
            </button>
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, padding: '4px 10px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap',
              background: 'var(--text-primary)', color: 'var(--bg-primary)',
              pointerEvents: 'none', zIndex: 50, opacity: 0, transition: 'opacity 0.15s',
            }} className="group-hover-tooltip">
              {m.description}
            </div>
          </div>
        ))}
        <button
          onClick={() => setShowAllModes(!showAllModes)}
          style={{
            padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}
        >
          {showAllModes ? '▲ 閉じる' : `▼ もっと見る（+${ALL_MODES.length - 8}）`}
        </button>
        <style>{`.group:hover .group-hover-tooltip { opacity: 1 !important; }`}</style>
      </div>
      {/* テンプレート */}
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <select
          value={selectedTemplateId}
          onChange={e => handleLoadTemplate(e.target.value)}
          disabled={templatesLoading || templates.length === 0}
          style={{ flex: 1, minWidth: 0, maxWidth: 280, padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
        >
          <option value="">
            {templatesLoading ? '読み込み中...' : templates.length === 0 ? 'テンプレートなし' : '📋 テンプレートを呼び出す'}
          </option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {selectedTemplateId && (
          <button
            onClick={() => { deleteTemplate(selectedTemplateId); setSelectedTemplateId(''); }}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: '#ff6b6b', cursor: 'pointer', fontSize: 12 }}
          >
            🗑 削除
          </button>
        )}

        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}
          >
            💾 現在の設定を保存
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
              placeholder="テンプレート名を入力..."
              autoFocus
              style={{ width: 180, padding: '5px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            />
            <button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim() || isSavingTemplate}
              style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: !templateName.trim() || isSavingTemplate ? 0.5 : 1 }}
            >
              {isSavingTemplate ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => { setShowSaveInput(false); setTemplateName(''); }}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={'テーマ・指示を入力\n例：AIが日常生活を変える5つの方法について初心者向けに2000文字で書いてください'} style={{ width: '100%', minHeight: 100, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: 14, paddingRight: 48, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
            <VoiceInputButton size="sm" onResult={(text) => setPrompt(prev => prev + text)} />
          </div>
        </div>
        {/* サンプル＋クイック挿入 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <button onClick={() => {
            const samples: Record<string, string> = {
              blog: 'Claude Codeを使った業務効率化について、具体的な活用事例と導入メリットを初心者向けに解説してください。',
              note: 'AI時代に生き残るフリーランスの仕事術。ChatGPTやClaudeを使って生産性を3倍にした実体験を書いてください。',
              sns_twitter: '2026年のAIトレンドTOP3。知らないと乗り遅れる最新動向をまとめました。',
              social: '【保存版】AIツール活用術5選。毎日使えるビジネスパーソン向けTipsをまとめました。',
              report: '2026年上半期 AI市場動向レポート。主要プレイヤーの動向・市場規模・今後の展望を分析してください。',
              email: '新サービス「xLUMINA」のご案内メール。AIで情報収集から文章作成まで一気通貫で効率化できるサービスの魅力を伝えてください。',
              press: 'AI情報収集・文章作成プラットフォーム「xLUMINA」正式リリースのプレスリリースを作成してください。',
              sns_instagram: '朝活×AI活用術。毎朝30分のAI情報収集で1日の仕事が変わった体験談を書いてください。ハッシュタグも提案してください。',
              homepage: 'AI業務効率化ツール「xLUMINA」のHP用キャッチコピーと説明文を作成してください。',
              product: 'xLUMINA Proプランの商品説明文。月額9,800円の価値を伝える魅力的な文章を作成してください。',
              novel: 'AIが人間の仕事を奪う近未来を舞台にした短編小説。主人公は元ライターで、AIと共存する道を探す物語。',
              guide: 'ChatGPT・Claude初心者向け完全ガイド。アカウント登録から実践的な使い方まで丁寧に解説してください。',
              image_prompt: '夕暮れの東京タワーをバックに、ビジネスパーソンが街を歩いているシーン。プロフェッショナルな雰囲気で。',
            };
            setPrompt(samples[mode] ?? samples.blog);
          }} style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 6,
            border: '1px dashed var(--accent)', background: 'transparent',
            color: 'var(--accent)', cursor: 'pointer',
          }}>📋 サンプル</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>クイック挿入：</span>
          {QUICK_PROMPTS.map(qp => (
            <button key={qp.label} onClick={() => setPrompt(prev => prev + qp.text)} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {qp.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
          {[
            { label: '文体', value: style, set: setStyle, options: [['casual','カジュアル'],['formal','フォーマル'],['literary','文学的'],['academic','学術的']] },
            { label: '文字数', value: length, set: setLength, options: [['short','500字'],['medium','1500字'],['long','3000字'],['xl','5000字+']] },
            { label: '対象読者', value: audience, set: setAudience, options: [['general','一般'],['beginner','初心者'],['expert','専門家'],['business','ビジネス']] },
          ].map(sel => (
            <div key={sel.label}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{sel.label}</div>
              <select value={sel.value} onChange={e => sel.set(e.target.value)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
                {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={() => { setOutput(''); setPrompt(''); setTranslated(''); }} style={{ padding: '9px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>🗑 クリア</button>
          <button onClick={generate} disabled={loading} style={{ padding: '9px 24px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ 生成中...' : '✨ 文章を生成'}
          </button>
        </div>
      </div>
      {(output || loading) && (
        <div>
          {/* リアルタイム統計 */}
          {output && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>📝 {output.length.toLocaleString()}文字</span>
              <span>📄 {output.split(/\n\n+/).filter(p => p.trim().length > 0).length}段落</span>
              <span>⏱ 約{Math.max(1, Math.ceil(output.length / 400))}分で読める</span>
            </div>
          )}
          {/* 主要ボタン行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPreview(false)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: !preview ? 'var(--accent)' : 'var(--bg-secondary)', color: !preview ? '#fff' : 'var(--text-muted)' }}>✏️ 編集</button>
              <button onClick={() => setPreview(true)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: preview ? 'var(--accent)' : 'var(--bg-secondary)', color: preview ? '#fff' : 'var(--text-muted)' }}>👁 プレビュー</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{output.length.toLocaleString()}字</span>
              <SaveToLibraryButton
                title={`${ALL_MODES.find(m => m.key === mode)?.label || mode}: ${prompt.slice(0, 30)}`}
                content={output}
                type="write"
                groupName="文章作成"
                tags="文章"
              />
              <button
                onClick={async () => {
                  await fetch('/api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'write', title: `★ ${mode}: ${prompt.slice(0, 40)}`, content: output, tags: mode, group_name: '文章作成', is_favorite: true }),
                  });
                  setIsFavorited(true);
                }}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: isFavorited ? 'rgba(245,166,35,0.2)' : 'var(--border)', color: isFavorited ? '#f5a623' : 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}
              >
                {isFavorited ? '★ お気に入り済み' : '☆ お気に入り'}
              </button>
              {/* 続きを書く */}
              {output && !loading && (
                <button onClick={handleContinueWriting} disabled={isContinuing} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                  cursor: isContinuing ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                  opacity: isContinuing ? 0.6 : 1,
                }}>
                  {isContinuing ? '生成中...' : '➕ 続きを書く'}
                </button>
              )}
              {/* トーン変換 */}
              {output && !loading && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowToneButtons(!showToneButtons)} disabled={isConverting} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                    background: showToneButtons ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    opacity: isConverting ? 0.6 : 1,
                  }}>
                    {isConverting ? '変換中...' : '🎭 トーン変換 ▾'}
                  </button>
                  {showToneButtons && (
                    <div style={{
                      position: 'absolute', top: 32, left: 0, zIndex: 50, minWidth: 160,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '4px 0',
                    }}>
                      {TONE_OPTIONS.map(t => (
                        <button key={t.key} onClick={() => handleToneConvert(t.key)} style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* エクスポートドロップダウン */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowExportMenu(!showExportMenu)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: showExportMenu ? 'var(--accent-soft)' : 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                  📤 エクスポート {showExportMenu ? '▲' : '▼'}
                </button>
                {showExportMenu && (
                  <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, width: 180, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '4px 0' }}>
                    {[
                      { label: '📋 コピー', action: () => copy() },
                      { label: '💾 Markdown', action: () => download('md') },
                      { label: '💾 TXT', action: () => download('txt') },
                      { label: '📄 PDF', action: async () => { const { exportToPdf } = await import('@/lib/exportPdf'); await exportToPdf(prompt.slice(0, 40) || '文章', output); } },
                      null,
                      { label: '📝 noteに投稿', action: () => {
                        const noteContent = output.replace(/^# (.+)$/gm, '$1\n').replace(/^## (.+)$/gm, '\n■ $1\n').replace(/^### (.+)$/gm, '\n▶ $1\n').replace(/\*\*(.+?)\*\*/g, '$1').replace(/---/g, '\n---\n');
                        navigator.clipboard.writeText(noteContent).then(() => { window.open('https://note.com/notes/new', '_blank'); alert('✅ note形式でコピーしました！'); });
                      }},
                      { label: '🌐 WP用HTML', action: () => {
                        const html = output.replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>').replace(/^(?!<[h1-6ul]).+$/gm, '<p>$&</p>').replace(/---/g, '<hr>');
                        navigator.clipboard.writeText(html).then(() => alert('✅ HTML形式でコピーしました！'));
                      }},
                    ].map((entry, i) => entry === null
                      ? <div key={`sep-${i}`} style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      : <button key={entry.label} onClick={() => { entry.action(); setShowExportMenu(false); }}
                          style={{ width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          {entry.label}
                        </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <textarea value={output} onChange={e => setOutput(e.target.value)} readOnly={loading} style={{ display: preview ? 'none' : 'block', width: '100%', minHeight: 400, background: 'var(--bg-secondary)', border: `1px solid ${loading ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, color: 'var(--text-secondary)', fontSize: 14, padding: 20, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.8, boxSizing: 'border-box' }} />
          {preview && <div style={{ minHeight: 400, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 28px', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{output}</div>}
        </div>
      )}

      {/* 差分確認ボタン（修正適用後に表示） */}
      {originalText && output && originalText !== output && !loading && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowDiff(true)}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.08)', color: '#6c63ff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            📊 変更箇所を確認する
          </button>
        </div>
      )}

      {/* 読みやすさスコア */}
      {readability && output && !loading && (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>📖 読みやすさスコア</span>
            <span style={{
              fontSize: 24, fontWeight: 700,
              color: readability.total >= 80 ? '#1D9E75' : readability.total >= 60 ? '#f59e0b' : '#ef4444',
            }}>{readability.total}点</span>
            <span style={{
              fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
              background: readability.total >= 80 ? 'rgba(29,158,117,0.12)' : readability.total >= 60 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
              color: readability.total >= 80 ? '#1D9E75' : readability.total >= 60 ? '#f59e0b' : '#ef4444',
            }}>{readability.label}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {readability.details.map((d, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', width: 80, flexShrink: 0 }}>{d.name}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                      width: `${(d.score / d.max) * 100}%`,
                      background: d.score >= 20 ? '#1D9E75' : d.score >= 15 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 36, textAlign: 'right', fontFamily: 'monospace' }}>{d.score}/{d.max}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 88 }}>{d.advice}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI改善提案 */}
      {output && !loading && (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: improveSuggestions.length > 0 || showImproved || improveError ? 12 : 0, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>✨ AI改善提案</span>
            <button
              onClick={handleImprove}
              disabled={isImproving}
              style={{
                padding: '8px 18px',
                background: isImproving ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: isImproving ? 'var(--text-muted)' : '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: isImproving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {isImproving ? '🔧 改善中...' : '🔧 AIで改善する'}
            </button>
          </div>

          {improveError && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 8 }}>
              {improveError}
            </div>
          )}

          {improveSuggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {improveSuggestions.map((s, i) => {
                const colors = s.priority === '高'
                  ? { border: '#ef4444', bg: 'rgba(239,68,68,0.06)', tagBg: 'rgba(239,68,68,0.18)', tagColor: '#ef4444' }
                  : s.priority === '中'
                  ? { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)', tagBg: 'rgba(245,158,11,0.18)', tagColor: '#f59e0b' }
                  : { border: '#1D9E75', bg: 'rgba(29,158,117,0.06)', tagBg: 'rgba(29,158,117,0.18)', tagColor: '#1D9E75' };
                return (
                  <div key={i} style={{ padding: 10, borderRadius: 8, borderLeft: `4px solid ${colors.border}`, background: colors.bg }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.point}</span>
                      <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: colors.tagBg, color: colors.tagColor, fontWeight: 700 }}>
                        {s.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>{s.detail}</div>
                  </div>
                );
              })}
            </div>
          )}

          {showImproved && improvedText && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap' as const, gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>📝 改善後の文章</span>
                <button
                  onClick={() => {
                    setOriginalText(output);
                    setOutput(improvedText);
                    setReadability(calcReadabilityScore(improvedText));
                    setShowImproved(false);
                  }}
                  style={{
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, #1D9E75, #00d4b8)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  ✅ この改善を採用する
                </button>
              </div>
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.8,
                whiteSpace: 'pre-wrap' as const,
                maxHeight: 300,
                overflowY: 'auto' as const,
              }}>
                {improvedText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEOタイトル提案 */}
      {output && !loading && (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: seoTitles.length > 0 ? 12 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>💡 SEOタイトル提案</span>
            <button
              onClick={handleSuggestTitles}
              disabled={isLoadingTitles}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
                border: 'none', fontWeight: 600,
                opacity: isLoadingTitles ? 0.6 : 1,
              }}
            >
              {isLoadingTitles ? '生成中...' : '✨ タイトルを提案'}
            </button>
          </div>
          {seoTitles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seoTitles.map((t, i) => (
                <div
                  key={i}
                  onClick={() => setPrompt(t.title)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 8, border: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: 16, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.reason}</div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    background: t.score >= 80 ? '#EAF3DE' : t.score >= 60 ? '#FAEEDA' : '#FCEBEB',
                    color: t.score >= 80 ? '#27500A' : t.score >= 60 ? '#633806' : '#A32D2D',
                  }}>{t.score}点</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SNSバズり予測 */}
      {output && !loading && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={checkBuzz}
            disabled={buzzLoading}
            style={{
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.3)',
              color: '#f5a623', fontWeight: 600, fontSize: 12,
              opacity: buzzLoading ? 0.7 : 1,
            }}
          >
            {buzzLoading ? '分析中...' : '📊 SNSバズり予測'}
          </button>

          {buzzScore && (
            <div style={{
              marginTop: 12, padding: 16,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 12,
            }}>
              {/* スコア表示 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: buzzScore.score >= 70 ? '#1d9e75' : buzzScore.score >= 40 ? '#f5a623' : '#ff6b6b' }}>
                  {buzzScore.score}点
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{buzzScore.level}</div>
                  <div style={{ height: 6, width: 160, background: 'var(--border)', borderRadius: 99, marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${buzzScore.score}%`, borderRadius: 99, background: buzzScore.score >= 70 ? '#1d9e75' : buzzScore.score >= 40 ? '#f5a623' : '#ff6b6b', transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>

              {/* 5軸バーグラフ */}
              {buzzScore.axes && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📊 5軸スコア</p>
                  {[
                    { key: 'hook', label: 'フック力', weight: '25%' },
                    { key: 'emotion', label: '感情訴求', weight: '25%' },
                    { key: 'cta', label: '行動喚起', weight: '20%' },
                    { key: 'virality', label: '拡散性', weight: '15%' },
                    { key: 'quality', label: 'コンテンツ品質', weight: '15%' },
                  ].map(axis => {
                    const axisData = buzzScore.axes[axis.key];
                    if (!axisData) return null;
                    const s = axisData.score;
                    const badgeLabel = s >= 80 ? 'バズ期待' : s >= 60 ? '良好' : s >= 40 ? '普通' : '要改善';
                    const badgeColor = s >= 80 ? '#22c55e' : s >= 60 ? '#3b82f6' : s >= 40 ? '#f59e0b' : '#ef4444';
                    const barColor = s >= 80 ? '#22c55e' : s >= 60 ? '#3b82f6' : s >= 40 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={axis.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{axis.label}</span>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({axis.weight})</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: `${badgeColor}18`, color: badgeColor, fontWeight: 700 }}>{badgeLabel}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontFamily: 'monospace', minWidth: 28, textAlign: 'right' }}>{s}</span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }}>
                          <div style={{ height: '100%', width: `${s}%`, background: barColor, borderRadius: 99, transition: 'width 0.5s ease' }} />
                        </div>
                        {axisData.comment && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{axisData.comment}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 良い点 */}
              {buzzScore.strengths?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1d9e75', marginBottom: 6 }}>✅ 良い点</p>
                  {buzzScore.strengths.map((s: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>・{s}</div>
                  ))}
                </div>
              )}

              {/* 改善項目チェックボックス */}
              {buzzScore.improvements?.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>
                    🔧 改善したい項目を選んでAIに自動修正させる
                  </p>
                  {buzzScore.improvements.map((imp: any) => (
                    <label key={imp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedChecks.includes(imp.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedChecks(prev => [...prev, imp.id]);
                          else setSelectedChecks(prev => prev.filter(c => c !== imp.id));
                        }}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{imp.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{imp.description}</div>
                      </div>
                    </label>
                  ))}

                  {selectedChecks.length > 0 && (
                    <button
                      onClick={autoFix}
                      disabled={fixLoading}
                      style={{
                        marginTop: 8, padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                        color: '#fff', fontWeight: 700, fontSize: 13,
                        opacity: fixLoading ? 0.7 : 1,
                      }}
                    >
                      {fixLoading ? 'AI修正中...' : `⚡ ${selectedChecks.length}項目をAIが自動修正`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AIバズり分析セクション */}
      {buzzScore && output && !loading && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>🤖 AI改善アドバイス</h3>

          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>目的</div>
              <select
                value={analysisPurpose}
                onChange={e => setAnalysisPurpose(e.target.value)}
                style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              >
                <option value="marketing">📣 マーケティング・集客</option>
                <option value="education">📚 教育・学習</option>
                <option value="hr">👥 人材育成・採用</option>
                <option value="branding">✨ ブランディング</option>
                <option value="sales">💼 営業・商品紹介</option>
                <option value="community">🤝 コミュニティ形成</option>
                <option value="pr">📰 PR・プレスリリース</option>
                <option value="thought">🎯 専門性発信</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ターゲット</div>
              <select
                value={analysisTarget}
                onChange={e => setAnalysisTarget(e.target.value)}
                style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              >
                <option value="general">一般読者</option>
                <option value="beginner">初心者・入門者</option>
                <option value="expert">専門家・上級者</option>
                <option value="business">ビジネスパーソン</option>
                <option value="consumer">一般消費者</option>
                <option value="student">学生・若年層</option>
                <option value="manager">管理職・経営者</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleBuzzAnalysis}
                disabled={isAnalyzing}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontWeight: 600, fontSize: 13,
                  opacity: isAnalyzing ? 0.7 : 1,
                }}
              >
                {isAnalyzing ? '分析中...' : '🔍 AIに分析・改善させる'}
              </button>
            </div>
          </div>

          {buzzAnalysis && (
            <div>
              {/* 問題点 */}
              <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠️ 問題点</p>
                {buzzAnalysis.problems?.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>・</span>{p}
                  </div>
                ))}
              </div>

              {/* 改善案 */}
              <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>💡 改善案</p>
                {buzzAnalysis.suggestions?.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>・</span>{s}
                  </div>
                ))}
              </div>

              {/* 修正文章 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowRevised(!showRevised)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
                >
                  {showRevised ? '▲ 修正文章を閉じる' : '✍️ 修正文章を見る'}
                </button>
                {showRevised && (
                  <button
                    onClick={() => {
                      setOriginalText(output);
                      setOutput(buzzAnalysis.revised);
                      setShowRevised(false);
                      setBuzzAnalysis(null);
                      setBuzzScore(null);
                    }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1d9e75', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✅ この修正を適用する
                  </button>
                )}
                {originalText && !showRevised && (
                  <button onClick={() => setShowDiff(true)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.08)', color: '#6c63ff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    📊 変更箇所を確認する
                  </button>
                )}
              </div>
              {showRevised && (
                <div style={{
                  marginTop: 10, padding: 14, background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 10,
                  fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                  whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto',
                }}>
                  {buzzAnalysis.revised}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Genspark連携セクション */}
      {output && !loading && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>✨ Genspark連携</h3>
            <a
              href="https://www.genspark.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}
            >
              🔗 Gensparkを開く
            </a>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 12 }}>
            {[
              { key: 'presentation', label: '📊 プレゼン用スライド構成' },
              { key: 'outline',      label: '📋 アウトライン形式' },
              { key: 'summary',      label: '📝 要約＋キーポイント' },
            ].map(fmt => (
              <button
                key={fmt.key}
                onClick={() => handleGensparkExport(fmt.key)}
                disabled={isExporting}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', fontSize: 12,
                  opacity: isExporting ? 0.7 : 1,
                }}
              >
                {isExporting && exportFormat === fmt.key ? '変換中...' : fmt.label}
              </button>
            ))}
          </div>

          {gensparkResult && (
            <div>
              <div style={{
                padding: 14, background: 'var(--bg-secondary)',
                border: '1px solid var(--border)', borderRadius: 10,
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto',
                marginBottom: 10,
              }}>
                {gensparkResult}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(gensparkResult).then(() => alert('コピーしました！'))}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
                >
                  📋 コピー
                </button>
                <a
                  href="https://www.genspark.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  ✨ Gensparkで開く →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 翻訳セクション */}
      {output && !loading && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.15)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#00d4b8' }}>🌍 翻訳</span>
            <select value={targetLang} onChange={e => setTargetLang(e.target.value)} style={{ padding: '5px 10px', background: 'var(--bg-primary)', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
              <option value="en">🇺🇸 英語</option>
              <option value="zh">🇨🇳 中国語（簡体）</option>
              <option value="ko">🇰🇷 韓国語</option>
              <option value="es">🇪🇸 スペイン語</option>
              <option value="fr">🇫🇷 フランス語</option>
              <option value="de">🇩🇪 ドイツ語</option>
              <option value="pt">🇧🇷 ポルトガル語</option>
            </select>
            <button onClick={translate} disabled={translating} style={{ padding: '5px 16px', background: 'linear-gradient(135deg, #00d4b8, #00b4d8)', color: '#0a0e12', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {translating ? '翻訳中...' : '翻訳する'}
            </button>
          </div>
          {translated && (
            <>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.9, whiteSpace: 'pre-wrap', borderTop: '1px solid rgba(0,212,184,0.1)', paddingTop: 12, maxHeight: 260, overflowY: 'auto' }}>{translated}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(translated)} style={{ padding: '5px 12px', background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.2)', color: '#00d4b8', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
                <button onClick={() => {
                  const blob = new Blob([translated], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `translated_${targetLang}.txt`; a.click();
                  URL.revokeObjectURL(url);
                }} style={{ padding: '5px 12px', background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.2)', color: '#00d4b8', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>💾 TXTで保存</button>
              </div>
            </>
          )}
        </div>
      )}
      {/* 差分比較モーダル */}
      {showDiff && originalText && (() => {
        const splitBlocks = (text: string) => text.split(/(?<=。|\n)/).filter(s => s.trim());
        const beforeBlocks = splitBlocks(originalText);
        const afterBlocks = splitBlocks(output);

        // 簡易LCS差分アルゴリズム
        type DiffLine = { type: 'unchanged' | 'removed' | 'added'; text: string };
        const beforeSet = new Set(beforeBlocks);
        const afterSet = new Set(afterBlocks);
        const diffBefore: DiffLine[] = beforeBlocks.map(b => ({
          type: afterSet.has(b) ? 'unchanged' as const : 'removed' as const,
          text: b,
        }));
        const diffAfter: DiffLine[] = afterBlocks.map(b => ({
          type: beforeSet.has(b) ? 'unchanged' as const : 'added' as const,
          text: b,
        }));

        const addedCount = diffAfter.filter(d => d.type === 'added').length;
        const removedCount = diffBefore.filter(d => d.type === 'removed').length;
        const addedChars = diffAfter.filter(d => d.type === 'added').reduce((sum, d) => sum + d.text.length, 0);
        const removedChars = diffBefore.filter(d => d.type === 'removed').reduce((sum, d) => sum + d.text.length, 0);

        const renderBlock = (d: DiffLine) => {
          const bg = d.type === 'removed' ? '#FCEBEB' : d.type === 'added' ? '#EAF3DE' : 'transparent';
          const decoration = d.type === 'removed' ? 'line-through' : 'none';
          const color = d.type === 'removed' ? '#b91c1c' : d.type === 'added' ? '#15803d' : 'var(--text-secondary)';
          return (
            <div style={{ padding: '4px 8px', borderRadius: 4, background: bg, color, textDecoration: decoration, fontSize: 13, lineHeight: 1.7, marginBottom: 2 }}>
              {d.type === 'removed' && <span style={{ fontSize: 10, marginRight: 4 }}>-</span>}
              {d.type === 'added' && <span style={{ fontSize: 10, marginRight: 4 }}>+</span>}
              {d.text}
            </div>
          );
        };

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowDiff(false)}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, width: '90vw', maxWidth: 960, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}>
              {/* ヘッダー */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📊 変更箇所の比較</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>-{removedCount}箇所 ({removedChars}字)</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>+{addedCount}箇所 ({addedChars}字)</span>
                </div>
                <button onClick={() => setShowDiff(false)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              {/* 2カラム */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
                <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.04)' }}>修正前</div>
                  <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
                    {diffBefore.map((d, i) => <div key={i}>{renderBlock(d)}</div>)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.04)' }}>修正後</div>
                  <div style={{ padding: 16, overflowY: 'auto', maxHeight: '70vh' }}>
                    {diffAfter.map((d, i) => <div key={i}>{renderBlock(d)}</div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
