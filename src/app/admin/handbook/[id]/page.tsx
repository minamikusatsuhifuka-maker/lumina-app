'use client';
import { useState, useEffect, use } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';
import { AITextReviser } from '@/components/clinic/AITextReviser';

const QUICK_INSTRUCTIONS = ['わかりやすく', '理念に沿って', '箇条書き化', '具体例を追加', 'トーンを丁寧に'];

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]); i++;
      }
      const dataLines = tableLines.filter(l => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
      if (dataLines.length > 0) {
        const rows = dataLines.map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">';
        rows.forEach((cells, idx) => {
          html += '<tr style="border-bottom:1px solid var(--border)">';
          cells.forEach(cell => {
            const tag = idx === 0 ? 'th' : 'td';
            const style = idx === 0 ? 'padding:5px 8px;text-align:left;font-weight:700;color:var(--text-primary);background:var(--bg-secondary)' : 'padding:5px 8px;color:var(--text-secondary)';
            const content = cell.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html += `<${tag} style="${style}">${content}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
        result.push(html);
      }
      continue;
    }
    if (/^## (.+)$/.test(line)) {
      result.push(`<h2 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border)">${line.replace(/^## /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h2>`);
      i++; continue;
    }
    if (/^### (.+)$/.test(line)) {
      result.push(`<h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:12px 0 4px">${line.replace(/^### /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</h3>`);
      i++; continue;
    }
    if (/^# (.+)$/.test(line)) {
      result.push(`<h1 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 10px">${line.replace(/^# /, '')}</h1>`);
      i++; continue;
    }
    if (/^---$/.test(line.trim())) {
      result.push('<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');
      i++; continue;
    }
    if (/^> (.+)$/.test(line)) {
      const content = line.replace(/^> /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      result.push(`<div style="padding:7px 12px;border-left:3px solid #6c63ff;background:rgba(108,99,255,0.06);margin:5px 0;font-size:12px;color:var(--text-secondary)">${content}</div>`);
      i++; continue;
    }
    if (/^[-*] (.+)$/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] (.+)$/.test(lines[i])) {
        const content = lines[i].replace(/^[-*] /, '').replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>');
        items.push(`<li style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.6">${content}</li>`);
        i++;
      }
      result.push(`<ul style="padding-left:16px;margin:6px 0">${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') { result.push('<div style="height:6px"></div>'); i++; continue; }
    const content = line.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary)">$1</strong>');
    result.push(`<p style="margin:3px 0;font-size:12px;color:var(--text-secondary);line-height:1.8">${content}</p>`);
    i++;
  }
  return result.join('');
}

export default function HandbookEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [handbook, setHandbook] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 章編集
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // AI改善
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ instruction: string; result: string }[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  // ウィザード管理
  const [beforeContent, setBeforeContent] = useState('');
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);

  // 理念一致度スコア
  const [ideologyScore, setIdeologyScore] = useState<null | { score: number; reason: string; points: string[] }>(null);

  // Step1・2 同時評価＆採点
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<{ score: number; comment: string; suggestions: string[] } | null>(null);
  const [evaluationSaved, setEvaluationSaved] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [originalContent, setOriginalContent] = useState('');

  // Step3 複数テンプレート選択・同時生成
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [multipleResults, setMultipleResults] = useState<{
    label: string; icon: string; result: string;
    scoring?: {
      score: number; score_diff: number; comment: string;
      good_points: string[]; improve_points: string[];
      balance: { readability: number; agency: number; specificity: number; philosophy: number; warmth: number; };
    };
    isScoringLoading?: boolean;
    // 90点超え自動再改善
    selectedImprovePoints?: string[];
    rewritten?: string;
    rewrittenScoring?: {
      score: number; score_diff: number; comment: string;
      good_points: string[]; improve_points: string[];
      balance: { readability: number; agency: number; specificity: number; philosophy: number; warmth: number; };
    };
    isRewriting?: boolean;
    isRewrittenScoring?: boolean;
    rewrittenSaved?: boolean;
  }[]>([]);
  const [isScoringAll, setIsScoringAll] = useState(false);
  const [isRewritingAll, setIsRewritingAll] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [showBalanceComparison, setShowBalanceComparison] = useState(false);
  const [finalSelectedLabel, setFinalSelectedLabel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  // 改善履歴
  const [improveHistories, setImproveHistories] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Before/After表示設定
  const [resultFontSize, setResultFontSize] = useState(13);
  const [resultBoxHeight, setResultBoxHeight] = useState(660);

  // モデル比較関連state
  const [showModelCompare, setShowModelCompare]           = useState(false);
  const [compareTemplate, setCompareTemplate]             = useState('');
  const [compareTemplatePrompt, setCompareTemplatePrompt] = useState('');
  const [isComparing, setIsComparing]                     = useState(false);
  const [compareResult, setCompareResult]                 = useState<{
    sonnet: { result: string; scoring: any };
    opus:   { result: string; scoring: any };
  } | null>(null);
  const [compareSaved, setCompareSaved]                   = useState(false);
  const [compareHistory, setCompareHistory]               = useState<any[]>([]);
  const [showCompareHistory, setShowCompareHistory]       = useState(false);


  // ボスマネ変換・問いかけ
  const [bossConvertLoading, setBossConvertLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionResult, setQuestionResult] = useState('');
  const [questionVisible, setQuestionVisible] = useState(false);

  // 章末問いかけ生成 - 複数レベル比較・保存・選択
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);
  const [selectedQuestionLevels, setSelectedQuestionLevels] = useState<string[]>(['standard']);
  const [questionResults, setQuestionResults] = useState<{ id: string; label: string; icon: string; desc: string; text: string }[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [questionGeneratedCount, setQuestionGeneratedCount] = useState(0);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionsSaved, setQuestionsSaved] = useState(false);
  const [savedQuestions, setSavedQuestions] = useState<any[]>([]);
  const [bossBeforeContent, setBossBeforeContent] = useState('');
  const [bossAfterContent, setBossAfterContent] = useState('');
  const [bossCompareVisible, setBossCompareVisible] = useState(false);
  const [bossAfterEditing, setBossAfterEditing] = useState(false);
  const [bossAfterEdited, setBossAfterEdited] = useState('');

  // 新章追加
  const [newChapterTitle, setNewChapterTitle] = useState('');

  // AIチャットパネル
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'propose' | 'analyze' | 'free'>('propose');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fetchData = async () => {
    const res = await fetch(`/api/clinic/handbooks/${id}`);
    const data = await res.json();
    setHandbook(data);
    const chs = data.chapters || [];
    setChapters(chs);
    if (chs.length > 0 && activeIdx < chs.length) {
      setEditTitle(chs[activeIdx].title);
      setEditContent(chs[activeIdx].content);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (chapters[activeIdx]) {
      setEditTitle(chapters[activeIdx].title);
      setEditContent(chapters[activeIdx].content);
      setAiResult('');
      setAiHistory([]);
      setEvaluationResult(null);
      setEvaluationSaved(false);
      setScoreResult(null);
      setIdeologyScore(null);
      setOriginalContent('');
      setSelectedTemplates([]);
      setMultipleResults([]);
      setGeneratedCount(0);
      setQuestionResults([]);
      setSelectedQuestionId(null);
      setQuestionsSaved(false);
      setSavedQuestions([]);
      if (chapters[activeIdx].id) loadImproveHistory(chapters[activeIdx].id);
    }
  }, [activeIdx]);

  // 問いかけパネルを開いたら保存済み履歴を取得
  useEffect(() => {
    if (showQuestionPanel && chapters[activeIdx]) fetchSavedQuestions();
  }, [showQuestionPanel, activeIdx]);


  const saveChapter = async () => {
    const ch = chapters[activeIdx];
    if (!ch) return;
    setSaving(true);
    await fetch(`/api/clinic/handbooks/${id}/chapters/${ch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle, content: editContent }) });
    setChapters(prev => prev.map((c, i) => i === activeIdx ? { ...c, title: editTitle, content: editContent } : c));
    setMessage('保存しました');
    setSaving(false);
    setTimeout(() => setMessage(''), 2000);
  };

  const addChapter = async () => {
    if (!newChapterTitle.trim()) return;
    const orderIndex = chapters.length + 1;
    await fetch(`/api/clinic/handbooks/${id}/chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newChapterTitle, content: '', orderIndex }) });
    setNewChapterTitle('');
    await fetchData();
    setActiveIdx(chapters.length);
  };

  const deleteChapter = async (chId: string, idx: number) => {
    if (!confirm('この章を削除しますか？')) return;
    await fetch(`/api/clinic/handbooks/${id}/chapters/${chId}`, { method: 'DELETE' });
    await fetchData();
    if (activeIdx >= chapters.length - 1) setActiveIdx(Math.max(0, chapters.length - 2));
  };

  const runAi = async () => {
    if (!aiInstruction.trim() || !chapters[activeIdx]) return;
    setAiLoading(true); setAiResult('');
    const ch = chapters[activeIdx];
    try {
      const res = await fetch(`/api/clinic/handbooks/${id}/chapters/${ch.id}/ai-improve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiInstruction, chapterContent: editContent }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') { acc += json.content; setAiResult(acc); }
            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') { acc += json.delta.text; setAiResult(acc); }
          } catch {}
        }
      }
      setAiHistory(prev => [...prev, { instruction: aiInstruction, result: acc }]);
      setAiInstruction('');
    } catch { setMessage('AI改善に失敗しました'); }
    finally { setAiLoading(false); }
  };

  const applyAi = () => { setEditContent(aiResult); setAiResult(''); };

  const loadImproveHistory = async (chapterId: string) => {
    if (!chapterId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/clinic/handbooks/improve-history?chapterId=${chapterId}`);
      const data = await res.json();
      if (Array.isArray(data)) setImproveHistories(data);
    } catch {}
    setHistoryLoading(false);
  };

  const saveImproveHistory = async (direction: string, afterContent: string) => {
    const chapter = chapters[activeIdx];
    if (!chapter || !afterContent) return;
    try {
      await fetch('/api/clinic/handbooks/improve-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: chapter.id,
          handbookId: id,
          chapterTitle: editTitle,
          direction,
          beforeContent: editContent,
          afterContent,
          ideologyScore: null,
        }),
      });
      await loadImproveHistory(chapter.id);
    } catch {}
  };

  // Step1・2 同時評価＆採点
  const handleEvaluateAndScore = async () => {
    setIsEvaluating(true);
    setEvaluationResult(null);
    setScoreResult(null);
    setEvaluationSaved(false);
    setOriginalContent(editContent);
    try {
      const [evalRes, scoreRes] = await Promise.all([
        fetch('/api/clinic/handbooks/enhance', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'evaluate', chapterContent: editContent }),
        }),
        fetch('/api/clinic/handbooks/ideology-score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterContent: editContent }),
        }),
      ]);
      const evalData = await evalRes.json();
      const scoreData = await scoreRes.json();
      if (evalData.result) setEvaluationResult(evalData.result);
      if (scoreData.score !== undefined) {
        setScoreResult({ score: scoreData.score, comment: scoreData.reason || '', suggestions: scoreData.points || [] });
        setIdeologyScore(scoreData);
      }
    } catch {} finally { setIsEvaluating(false); }
  };

  // 元文章＋評価＋採点をセットで保存
  const handleSaveEvaluationAndScore = async () => {
    const chapter = chapters[activeIdx];
    if (!chapter) return;
    await fetch('/api/clinic/handbooks/improve-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: chapter.id,
        handbookId: id,
        chapterTitle: editTitle,
        direction: scoreResult ? `評価＆採点：${scoreResult.score}点` : '評価',
        beforeContent: originalContent || editContent,
        afterContent: '',
        evaluation_result: evaluationResult,
        score_result: scoreResult?.score,
        score_comment: scoreResult?.comment,
        score_suggestions: scoreResult ? JSON.stringify(scoreResult.suggestions) : null,
      }),
    });
    setEvaluationSaved(true);
    await loadImproveHistory(chapter.id);
    setMessage('✅ 元の文章・評価・採点をまとめて保存しました');
    setTimeout(() => setMessage(''), 2000);
  };

  // テンプレート定義（10種）
  const improveTemplates = [
    { k: 'philosophy', icon: '🌟', label: '理念・哲学型', desc: 'クリニックの理念・先払い哲学を体現した文章に' },
    { k: 'lead', icon: '🤝', label: 'リードマネジメント型', desc: '内発的動機を引き出す・命令ではなく問いかけに' },
    { k: 'story', icon: '📖', label: 'ストーリー型', desc: '物語形式でスタッフの心に届く文章に' },
    { k: 'dialogue', icon: '💬', label: '問いかけ・内省型', desc: '読んだあと自分で考えたくなる文章に' },
    { k: 'warm', icon: '🤗', label: '温かみ・共感型', desc: '感謝と共感を込めた、読んで安心できる文章に' },
    { k: 'concrete', icon: '✅', label: '具体的行動型', desc: '「明日からこう動こう」と思える実践的な文章に' },
    { k: 'growth', icon: '🌱', label: '成長・自己実現型', desc: '読んだスタッフが自分の可能性を信じられる文章に' },
    { k: 'insideout', icon: '🎯', label: 'インサイドアウト型', desc: '外圧ではなく内側からの動機・自己選択を促す文章に' },
    { k: 'sevenfruit', icon: '🏆', label: '7つの実・評価型', desc: '実行・実績・実力・実現・充実・誠実・結実が伝わる文章に' },
    { k: 'teal', icon: '🔄', label: 'ティール・自律型', desc: '全員が主役・自律分散・自分で考えて動ける文章に' },
  ];

  const toggleTemplate = (label: string) => {
    setSelectedTemplates(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  // 比較履歴を取得
  const fetchCompareHistory = async () => {
    const chapter = chapters[activeIdx];
    if (!chapter?.id) return;
    const res = await fetch(
      `/api/clinic/handbook-model-compare?chapter_id=${chapter.id}`
    );
    const data = await res.json();
    setCompareHistory(data.comparisons ?? []);
  };

  // モデル比較実行
  const handleCompareModels = async () => {
    if (!compareTemplate) {
      alert('テンプレートを1つ選択してください');
      return;
    }
    setIsComparing(true);
    setCompareResult(null);
    setCompareSaved(false);

    try {
      const res = await fetch('/api/clinic/handbook-improve/compare-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
          templateLabel: compareTemplate,
          templatePrompt: compareTemplatePrompt,
        }),
      });
      const data = await res.json();
      setCompareResult(data);
    } catch {
      setMessage('モデル比較に失敗しました');
    } finally {
      setIsComparing(false);
    }
  };

  // 比較結果を保存
  const handleSaveComparison = async (selectedModel?: string) => {
    const chapter = chapters[activeIdx];
    if (!compareResult || !chapter?.id) return;
    await fetch('/api/clinic/handbook-model-compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapter_id: chapter.id,
        chapter_content: editContent,
        template_label: compareTemplate,
        sonnet_result:  compareResult.sonnet.result,
        sonnet_score:   compareResult.sonnet.scoring?.score,
        sonnet_comment: compareResult.sonnet.scoring?.comment,
        sonnet_balance: compareResult.sonnet.scoring?.balance,
        opus_result:    compareResult.opus.result,
        opus_score:     compareResult.opus.scoring?.score,
        opus_comment:   compareResult.opus.scoring?.comment,
        opus_balance:   compareResult.opus.scoring?.balance,
        selected_model: selectedModel ?? null,
      }),
    });
    setCompareSaved(true);
    fetchCompareHistory();
  };

  // 採用してエディタに反映
  const handleAdoptModel = (modelKey: 'sonnet' | 'opus') => {
    if (!compareResult) return;
    const text = compareResult[modelKey].result;
    setEditContent(text);
    handleSaveComparison(modelKey === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-opus-4-7');
    setMessage('✅ 選択したモデルの結果をエディタに反映しました');
    setTimeout(() => setMessage(''), 2000);
  };

  // 複数テンプレート同時生成
  const handleGenerateMultiple = async () => {
    setIsGenerating(true);
    setGeneratedCount(0);
    setMultipleResults([]);
    setShowBeforeAfter(false);
    setAiResult('');

    const targets = selectedTemplates.length > 0
      ? selectedTemplates
      : aiInstruction.trim() ? [aiInstruction.trim()] : [];

    const results = await Promise.allSettled(
      targets.map(async (templateLabel) => {
        const template = improveTemplates.find(t => t.label === templateLabel);
        const isTemplate = !!template;
        const instruction = template
          ? `${template.desc}${aiInstruction.trim() ? '。また、' + aiInstruction.trim() : ''}`
          : templateLabel;

        const res = await fetch('/api/clinic/handbooks/enhance', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isTemplate
              ? { mode: 'template', template: template.k, chapterContent: editContent }
              : { mode: 'rewrite', instruction, chapterContent: editContent }
          ),
        });
        const data = await res.json();
        setGeneratedCount(prev => prev + 1);
        return { label: template ? `${template.icon} ${template.label}` : `✏️ ${templateLabel}`, icon: template?.icon ?? '✏️', result: data.result || '' };
      })
    );

    const fulfilled = results
      .filter((r): r is PromiseFulfilledResult<{ label: string; icon: string; result: string }> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => r.result);

    setMultipleResults(fulfilled);
    setIsGenerating(false);
    if (aiInstruction.trim() && selectedTemplates.length === 0) setAiInstruction('');
  };

  // 個別改善案を保存
  const handleSaveImproved = async (improvedContent: string, templateLabel: string) => {
    const chapter = chapters[activeIdx];
    if (!chapter || !improvedContent) return;
    await fetch('/api/clinic/handbooks/improve-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: chapter.id,
        handbookId: id,
        chapterTitle: editTitle,
        direction: templateLabel,
        beforeContent: editContent,
        afterContent: improvedContent,
        template_label: templateLabel,
        evaluation_result: evaluationResult,
        score_result: scoreResult?.score,
        score_comment: scoreResult?.comment,
        score_suggestions: scoreResult ? JSON.stringify(scoreResult.suggestions) : null,
      }),
    });
    await loadImproveHistory(chapter.id);
    setMessage(`✅ 「${templateLabel}」の改善案を保存しました`);
    setTimeout(() => setMessage(''), 2000);
  };

  // 個別採点
  const handleScoreImproved = async (index: number) => {
    const r = multipleResults[index];

    setMultipleResults(prev => prev.map((item, i) =>
      i === index ? { ...item, isScoringLoading: true } : item
    ));

    try {
      const res = await fetch('/api/clinic/handbook-improve/score-improved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: editContent,
          improved: r.result,
          templateLabel: r.label,
        }),
      });

      if (!res.ok) {
        console.error('採点APIエラー:', res.status, await res.text());
        setMultipleResults(prev => prev.map((item, i) =>
          i === index ? { ...item, isScoringLoading: false } : item
        ));
        return;
      }

      const data = await res.json();

      if (data.error) {
        console.error('採点結果エラー:', data.error, data.raw);
        setMultipleResults(prev => prev.map((item, i) =>
          i === index ? { ...item, isScoringLoading: false } : item
        ));
        return;
      }

      setMultipleResults(prev => prev.map((item, i) =>
        i === index ? { ...item, scoring: data, isScoringLoading: false } : item
      ));

    } catch (e) {
      console.error('handleScoreImproved 例外:', e);
      setMultipleResults(prev => prev.map((item, i) =>
        i === index ? { ...item, isScoringLoading: false } : item
      ));
    }
  };

  // 全カード一括採点
  const handleScoreAll = async () => {
    console.log('handleScoreAll: multipleResults =', multipleResults);

    if (multipleResults.length === 0) {
      alert('先に改善文を生成してください');
      return;
    }

    setIsScoringAll(true);
    await Promise.allSettled(
      multipleResults.map((_, i) => handleScoreImproved(i))
    );
    setIsScoringAll(false);
    setShowBalanceComparison(true);
  };

  // === AI改善結果テキスト出力 ===

  // 全案のテキストを生成
  const buildExportText = (): string => {
    const lines: string[] = [];
    const now = new Date().toLocaleString('ja-JP');
    const chapter = chapters[activeIdx];

    lines.push('='.repeat(60));
    lines.push('LUMINA ハンドブック AI改善結果レポート');
    lines.push(`出力日時：${now}`);
    lines.push(`章タイトル：${chapter?.title ?? editTitle ?? ''}`);
    lines.push('='.repeat(60));
    lines.push('');

    multipleResults.forEach((r, i) => {
      lines.push(`【${i + 1}】${r.icon} ${r.label}`);
      lines.push('-'.repeat(50));

      if (r.scoring) {
        lines.push(`■ 初回改善スコア：${r.scoring.score}点`);
        lines.push('');
      }

      lines.push('▼ Before（元の文章）');
      lines.push(editContent ?? '');
      lines.push('');

      lines.push('▼ After（初回改善）');
      lines.push(r.result ?? '');
      lines.push('');

      if (r.scoring) {
        lines.push('▼ 評価コメント');
        lines.push(r.scoring.comment ?? '');
        lines.push('');

        lines.push('▼ 良い点');
        r.scoring.good_points?.forEach(p => lines.push(`・${p}`));
        lines.push('');

        lines.push('▼ 改善できる点');
        r.scoring.improve_points?.forEach(p => lines.push(`・${p}`));
        lines.push('');

        lines.push('▼ バランス指標');
        lines.push(`　読みやすさ：${r.scoring.balance.readability}`);
        lines.push(`　主体性・自律：${r.scoring.balance.agency}`);
        lines.push(`　具体性：${r.scoring.balance.specificity}`);
        lines.push(`　理念一致度：${r.scoring.balance.philosophy}`);
        lines.push(`　温かみ：${r.scoring.balance.warmth}`);
        lines.push('');
      }

      if (r.rewritten) {
        lines.push('▼ After（再改善）');
        lines.push(r.rewritten);
        lines.push('');

        if (r.rewrittenScoring) {
          lines.push(`■ 再改善スコア：${r.rewrittenScoring.score}点`);
          if (r.scoring) {
            const diff = r.rewrittenScoring.score - r.scoring.score;
            lines.push(`　初回改善比：${diff >= 0 ? '+' : ''}${diff}点`);
          }
          lines.push('');
          lines.push('▼ 再改善評価コメント');
          lines.push(r.rewrittenScoring.comment ?? '');
          lines.push('');
        }
      }

      lines.push('='.repeat(60));
      lines.push('');
    });

    return lines.join('\n');
  };

  // クリップボードにコピー
  const handleCopyAll = async () => {
    const text = buildExportText();
    try {
      await navigator.clipboard.writeText(text);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    } catch (e) {
      console.error('クリップボードコピー失敗:', e);
      alert('クリップボードへのコピーに失敗しました');
    }
  };

  // .txtファイルとしてダウンロード
  const handleDownloadAll = () => {
    const text = buildExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    const chapter = chapters[activeIdx];
    const titleStr = (chapter?.title ?? editTitle ?? 'chapter').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `LUMINA_改善レポート_${titleStr}_${dateStr}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // === 90点超え自動再改善ライター ===

  // 改善点チェックボックスのtoggle
  const toggleImprovePoint = (index: number, point: string) => {
    setMultipleResults(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const current = item.selectedImprovePoints ?? [];
      const updated = current.includes(point)
        ? current.filter(p => p !== point)
        : [...current, point];
      return { ...item, selectedImprovePoints: updated };
    }));
  };

  // 全改善点を一括選択/解除
  const toggleAllImprovePoints = (index: number, allPoints: string[]) => {
    setMultipleResults(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const isAllSelected = (item.selectedImprovePoints ?? []).length === allPoints.length;
      return {
        ...item,
        selectedImprovePoints: isAllSelected ? [] : [...allPoints],
      };
    }));
  };

  // 個別再改善
  const handleRewrite = async (index: number) => {
    const r = multipleResults[index];
    const improvePoints = (r.selectedImprovePoints && r.selectedImprovePoints.length > 0)
      ? r.selectedImprovePoints
      : (r.scoring?.improve_points ?? []);

    if (improvePoints.length === 0) {
      alert('改善点を1つ以上選択してください');
      return;
    }

    // 再改善中フラグON
    setMultipleResults(prev => prev.map((item, i) =>
      i === index ? { ...item, isRewriting: true, rewritten: undefined, rewrittenScoring: undefined, rewrittenSaved: false } : item
    ));

    try {
      const rewriteRes = await fetch('/api/clinic/handbook-improve/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: editContent,
          improved: r.result,
          templateLabel: r.label,
          improvePoints,
          targetScore: 90,
        }),
      });
      const rewriteData = await rewriteRes.json();

      // 再改善後に自動採点
      setMultipleResults(prev => prev.map((item, i) =>
        i === index ? { ...item, rewritten: rewriteData.rewritten, isRewriting: false, isRewrittenScoring: true } : item
      ));

      const scoreRes = await fetch('/api/clinic/handbook-improve/score-improved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: editContent,
          improved: rewriteData.rewritten,
          templateLabel: r.label + '（再改善版）',
        }),
      });
      const scoreData = await scoreRes.json();

      setMultipleResults(prev => prev.map((item, i) =>
        i === index ? { ...item, rewrittenScoring: scoreData, isRewrittenScoring: false } : item
      ));
    } catch (e) {
      console.error('handleRewrite 例外:', e);
      setMultipleResults(prev => prev.map((item, i) =>
        i === index ? { ...item, isRewriting: false, isRewrittenScoring: false } : item
      ));
    }
  };

  // 全案一括再改善
  const handleRewriteAll = async () => {
    setIsRewritingAll(true);
    // 採点済みで改善点が未選択の案には全改善点を自動選択
    setMultipleResults(prev => prev.map((item) => {
      if (!item.scoring) return item;
      if (item.selectedImprovePoints && item.selectedImprovePoints.length > 0) return item;
      return { ...item, selectedImprovePoints: item.scoring.improve_points ?? [] };
    }));

    // 次のレンダリングを待つため少し遅延してから実行
    await new Promise((resolve) => setTimeout(resolve, 50));

    await Promise.allSettled(
      multipleResults.map((r, i) => {
        if (!r.scoring) return Promise.resolve();
        return handleRewrite(i);
      })
    );
    setIsRewritingAll(false);
  };

  // 再改善結果を保存
  const handleSaveRewritten = async (index: number) => {
    const r = multipleResults[index];
    if (!r.rewritten) return;

    const chapter = chapters[activeIdx];
    if (!chapter) return;

    await fetch('/api/clinic/handbooks/improve-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: chapter.id,
        handbookId: id,
        chapterTitle: editTitle,
        direction: r.label + '（再改善）',
        beforeContent: r.result,          // Before = 初回改善案
        afterContent: r.rewritten,        // After  = 再改善案
        template_label: r.label + '（再改善）',
        score_result: r.rewrittenScoring?.score,
        score_comment: r.rewrittenScoring?.comment,
        score_suggestions: JSON.stringify(r.rewrittenScoring?.good_points ?? []),
      }),
    });

    await loadImproveHistory(chapter.id);

    setMultipleResults(prev => prev.map((item, i) =>
      i === index ? { ...item, rewrittenSaved: true } : item
    ));
    setMessage(`✅ 「${r.label}」の再改善結果を保存しました`);
    setTimeout(() => setMessage(''), 2500);
  };

  // 最終案を採用して保存
  const handleFinalSelect = async (r: typeof multipleResults[0]) => {
    setFinalSelectedLabel(r.label);
    setEditContent(prev => prev + '\n\n---\n\n' + r.result);
    const chapter = chapters[activeIdx];
    if (!chapter) return;
    await fetch('/api/clinic/handbooks/improve-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: chapter.id,
        handbookId: id,
        chapterTitle: editTitle,
        direction: r.label,
        beforeContent: editContent,
        afterContent: r.result,
        template_label: r.label,
        score_result: r.scoring?.score,
        score_comment: r.scoring?.comment,
        score_suggestions: JSON.stringify(r.scoring?.good_points ?? []),
      }),
    });
    await loadImproveHistory(chapter.id);
    setMessage(`✅ 「${r.label}」を最終案として採用しました`);
    setTimeout(() => setMessage(''), 3000);
  };

  const convertBossToLead = async () => {
    setBossConvertLoading(true);
    // 変換前の内容を保存
    setBossBeforeContent(editContent);
    setBossAfterContent('');
    setBossCompareVisible(false);
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'boss-to-lead', chapterContent: editContent }),
      });
      const data = await res.json();
      if (data.result) {
        setBossAfterContent(data.result);
        setBossCompareVisible(true);
        // 本文には即反映せず、比較画面を表示
        setMessage('✅ リードマネジメント型の表現に変換しました。下のBefore/Afterを確認して「採用する」を押してください。');
        saveImproveHistory('ボスマネ→リードマネ変換', data.result);
      }
    } catch { setMessage('❌ 変換に失敗しました'); }
    finally { setBossConvertLoading(false); }
  };

  const generateQuestion = async () => {
    setQuestionLoading(true);
    setQuestionResult('');
    setQuestionVisible(true);
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'add-question', chapterContent: editContent }),
      });
      const data = await res.json();
      if (data.result) setQuestionResult(data.result);
    } catch { setQuestionResult('生成に失敗しました。'); }
    finally { setQuestionLoading(false); }
  };

  // --- 章末問いかけ生成 複数レベル定義 ---
  const questionLevels = [
    {
      id: 'detailed',
      label: '詳細型',
      icon: '🔬',
      desc: '深く考えさせる、多角的な問いかけ（3〜5問）',
      prompt: 'この章の内容について、スタッフが深く考えられるよう、多角的な視点から詳細な問いかけを3〜5問生成してください。背景・理由・具体的行動まで掘り下げる内容にしてください。',
    },
    {
      id: 'standard',
      label: '標準型',
      icon: '📝',
      desc: 'バランスのよい問いかけ（2〜3問）',
      prompt: 'この章の内容について、スタッフが自分ごととして考えられる、バランスのよい問いかけを2〜3問生成してください。',
    },
    {
      id: 'simple',
      label: '簡単型',
      icon: '💡',
      desc: '読んですぐ答えられるシンプルな問いかけ（1〜2問）',
      prompt: 'この章の内容について、読んですぐに答えられるシンプルで親しみやすい問いかけを1〜2問生成してください。',
    },
    {
      id: 'action',
      label: '行動促進型',
      icon: '🚀',
      desc: '「明日からこうする」と決意を促す問いかけ（2問）',
      prompt: 'この章を読んだスタッフが「明日からこう行動しよう」と具体的な決意ができるような、行動を促す問いかけを2問生成してください。',
    },
    {
      id: 'reflection',
      label: '内省・振り返り型',
      icon: '🪞',
      desc: '自分自身を振り返る内省的な問いかけ（2〜3問）',
      prompt: 'この章の内容をもとに、スタッフが自分自身の行動・価値観・あり方を静かに振り返れるような内省的な問いかけを2〜3問生成してください。',
    },
  ];

  const toggleQuestionLevel = (id: string) => {
    setSelectedQuestionLevels(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  // 保存済み問いかけを取得
  const fetchSavedQuestions = async () => {
    const chapter = chapters[activeIdx];
    if (!chapter) return;
    try {
      const res = await fetch(`/api/clinic/handbook-questions?chapter_id=${chapter.id}`);
      const data = await res.json();
      setSavedQuestions(data.questions ?? []);
    } catch {}
  };

  // 複数レベル同時生成
  const handleGenerateQuestions = async () => {
    const chapter = chapters[activeIdx];
    if (!chapter) return;
    setIsGeneratingQuestions(true);
    setQuestionGeneratedCount(0);
    setQuestionResults([]);
    setQuestionsSaved(false);
    setSelectedQuestionId(null);

    const targets = questionLevels.filter(l => selectedQuestionLevels.includes(l.id));

    const results = await Promise.allSettled(
      targets.map(async (level) => {
        const res = await fetch('/api/clinic/handbook-questions/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editContent, prompt: level.prompt }),
        });
        const data = await res.json();
        setQuestionGeneratedCount(prev => prev + 1);
        return {
          id: level.id,
          label: level.label,
          icon: level.icon,
          desc: level.desc,
          text: data.question ?? '',
        };
      })
    );

    const fulfilled = results
      .filter((r): r is PromiseFulfilledResult<{ id: string; label: string; icon: string; desc: string; text: string }> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => r.text);

    setQuestionResults(fulfilled);
    setIsGeneratingQuestions(false);
  };

  // 個別保存
  const handleSaveQuestion = async (r: { id: string; label: string; desc?: string; text: string }) => {
    const chapter = chapters[activeIdx];
    if (!chapter) return;
    await fetch('/api/clinic/handbook-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapter_id: chapter.id,
        chapter_content: editContent,
        level_label: r.label,
        level_desc: r.desc ?? '',
        question_text: r.text,
      }),
    });
    await fetchSavedQuestions();
  };

  // まとめて保存
  const handleSaveAllQuestions = async () => {
    await Promise.all(questionResults.map(r => handleSaveQuestion(r)));
    setQuestionsSaved(true);
    setMessage('✅ すべての問いかけを保存しました');
    setTimeout(() => setMessage(''), 2000);
  };

  // 採用（章末に追記）
  const handleSelectQuestion = (r: { id: string; text: string }) => {
    setSelectedQuestionId(r.id);
    setEditContent(prev => prev + '\n\n---\n\n**📝 振り返りの問いかけ**\n\n' + r.text);
    setMessage('✅ 章末に問いかけを追記しました');
    setTimeout(() => setMessage(''), 2000);
  };

  // 保存済みから採用
  const handleSelectSavedQuestion = (q: any) => {
    setEditContent(prev => prev + '\n\n---\n\n**📝 振り返りの問いかけ**\n\n' + q.question_text);
    setMessage('✅ 章末に問いかけを追記しました');
    setTimeout(() => setMessage(''), 2000);
  };

  const sendChat = async (overrideInput?: string) => {
    const input = overrideInput || chatInput;
    if (!input.trim() && chatMode !== 'analyze') return;
    setChatLoading(true);

    const userMsg = chatMode === 'analyze' && chatMessages.length === 0
      ? 'この章を分析してください。'
      : input;

    const newMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...chatMessages,
      { role: 'user', content: userMsg },
    ];
    setChatMessages(newMessages);
    setChatInput('');

    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          chatMode,
          chapterContent: editContent,
          messages: newMessages,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.result }]);

        // 対話モードで「---」で囲まれた文章は自動適用オファー
        if (chatMode === 'free' && data.result.includes('---')) {
          const match = data.result.match(/---\n([\s\S]+?)\n---/);
          if (match) {
            setAiResult(match[1].trim());
          }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const exportFile = async (format: string) => {
    const res = await fetch(`/api/clinic/handbooks/${id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }) });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${handbook?.title || 'handbook'}.${format}`;
    a.click();
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <>
    <style>{`
      @keyframes handbookSlide {
        0% { transform: translateX(0%); }
        100% { transform: translateX(350%); }
      }
    `}</style>
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
      {/* 左カラム: 章ナビ */}
      <div style={{ width: 220, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handbook?.title}</div>
        {chapters.map((ch, i) => (
          <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setActiveIdx(i)} style={{
              flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: i === activeIdx ? 'rgba(108,99,255,0.15)' : 'transparent',
              color: i === activeIdx ? 'var(--text-primary)' : 'var(--text-muted)',
              border: i === activeIdx ? '1px solid rgba(108,99,255,0.3)' : '1px solid transparent',
              fontWeight: i === activeIdx ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{i + 1}. {ch.title}</button>
            <button onClick={() => deleteChapter(ch.id, i)} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <input value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChapter(); } }} placeholder="新しい章のタイトル" style={{ flex: 1, padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, outline: 'none' }} />
          <button onClick={addChapter} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(108,99,255,0.15)', color: '#6c63ff', fontSize: 11, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>＋</button>
        </div>
      </div>

      {/* 右カラム: エディタ */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {/* ツールバー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))} disabled={activeIdx === 0} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>⬅️ 前の章</button>
            <button onClick={() => setActiveIdx(Math.min(chapters.length - 1, activeIdx + 1))} disabled={activeIdx >= chapters.length - 1} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>次の章 ➡️</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => exportFile('md')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>📄 MD出力</button>
            <button onClick={() => exportFile('txt')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>📄 TXT出力</button>
            <a href={`/admin/handbook/${id}/preview`} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>👁 プレビュー</a>
          </div>
        </div>

        {message && <div style={{ padding: 8, background: 'rgba(74,222,128,0.1)', borderRadius: 6, fontSize: 12, color: '#4ade80', marginBottom: 12 }}>{message}</div>}

        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>章がありません。左のパネルから追加してください。</div>
        ) : (
          <>
            {/* 保存ボタン行（タイトル上） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button onClick={saveChapter} disabled={saving} style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: saving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                {saving ? '保存中...' : '💾 保存'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>文字数: {editContent.length}</span>
            </div>

            {/* 章タイトル */}
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...inputStyle, fontSize: 18, fontWeight: 700, marginBottom: 12 }} />

            {/* 本文 */}
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{ ...inputStyle, minHeight: 400, resize: 'vertical', lineHeight: 1.8, fontSize: 14 }} />
            <AITextReviser
              text={editContent}
              onRevised={(revised) => setEditContent(revised)}
              defaultPurpose="manual"
              purposes={['manual', 'patient', 'simple', 'warm', 'official']}
            />


            {/* ボスマネ→リードマネ変換・問いかけ生成 */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={convertBossToLead}
                disabled={bossConvertLoading}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: bossConvertLoading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {bossConvertLoading ? '変換中...' : '🔄 ボスマネ→リードマネ変換'}
              </button>
              <button
                onClick={() => setShowQuestionPanel(!showQuestionPanel)}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>💬 章末問いかけを生成</span>
                <span>{showQuestionPanel ? '▲' : '▼'}</span>
              </button>
            </div>

            {/* 章末問いかけ生成パネル（複数レベル比較・保存・選択） */}
            {showQuestionPanel && (
              <div style={{ marginTop: 12, padding: 16, borderRadius: 12, border: '1px solid rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.04)' }}>
                {/* レベル選択（チェックボックス） */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    生成するタイプを選択（複数可）
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                    {questionLevels.map((level) => {
                      const checked = selectedQuestionLevels.includes(level.id);
                      return (
                        <label
                          key={level.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: 10, borderRadius: 10, cursor: 'pointer',
                            border: checked ? '1px solid #06b6d4' : '1px solid var(--border)',
                            background: checked ? 'rgba(6,182,212,0.08)' : 'var(--bg-card)',
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestionLevel(level.id)}
                            style={{ marginTop: 3, accentColor: '#06b6d4' }}
                          />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {level.icon} {level.label}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{level.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 生成ボタン */}
                <button
                  onClick={handleGenerateQuestions}
                  disabled={selectedQuestionLevels.length === 0 || isGeneratingQuestions}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none',
                    background: (selectedQuestionLevels.length === 0 || isGeneratingQuestions)
                      ? 'rgba(6,182,212,0.35)'
                      : 'linear-gradient(135deg, #06b6d4, #0891b2)',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    opacity: selectedQuestionLevels.length === 0 ? 0.5 : 1,
                  }}
                >
                  {isGeneratingQuestions
                    ? `⏳ 生成中... (${questionGeneratedCount}/${selectedQuestionLevels.length})`
                    : `💬 選択した${selectedQuestionLevels.length}種類を同時生成`}
                </button>

                {/* 比較結果 */}
                {questionResults.length > 0 && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      📋 生成結果の比較（{questionResults.length}種類）
                    </div>
                    {questionResults.map((r) => {
                      const isSelected = selectedQuestionId === r.id;
                      return (
                        <div
                          key={r.id}
                          style={{
                            borderRadius: 10, overflow: 'hidden',
                            border: isSelected ? '2px solid #06b6d4' : '1px solid var(--border)',
                            background: 'var(--bg-card)',
                          }}
                        >
                          {/* ヘッダー */}
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {r.icon} {r.label}
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleSaveQuestion(r)}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                              >
                                💾 保存
                              </button>
                              <button
                                onClick={() => handleSelectQuestion(r)}
                                style={{
                                  fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                                  border: isSelected ? 'none' : '1px solid #06b6d4',
                                  background: isSelected ? '#06b6d4' : 'transparent',
                                  color: isSelected ? '#fff' : '#06b6d4',
                                }}
                              >
                                {isSelected ? '✅ 採用中' : '採用する'}
                              </button>
                            </div>
                          </div>
                          {/* 問いかけ内容 */}
                          <div style={{ padding: 12, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                            {r.text}
                          </div>
                        </div>
                      );
                    })}

                    {/* まとめて保存 */}
                    <button
                      onClick={handleSaveAllQuestions}
                      style={{
                        marginTop: 4, background: 'transparent', border: 'none',
                        color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >
                      💾 全ての結果をまとめて保存する
                    </button>
                    {questionsSaved && (
                      <div style={{ textAlign: 'center', color: '#1D9E75', fontSize: 11 }}>✓ 保存済み</div>
                    )}
                  </div>
                )}

                {/* 保存済み問いかけ履歴 */}
                {savedQuestions.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                      🗂 保存済みの問いかけ履歴（{savedQuestions.length}件）
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                      {savedQuestions.map((q) => (
                        <div
                          key={q.id}
                          style={{
                            display: 'flex', gap: 8, padding: 10, borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--bg-card)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>
                              {q.level_label}
                              <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400 }}>
                                {new Date(q.created_at).toLocaleDateString('ja-JP')}
                              </span>
                            </div>
                            <div style={{
                              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                              {q.question_text}
                            </div>
                          </div>
                          <button
                            onClick={() => handleSelectSavedQuestion(q)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#06b6d4', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', height: 'fit-content', fontWeight: 600 }}
                          >
                            採用
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ボスマネ→リードマネ Before/After比較 */}
            {bossCompareVisible && bossAfterContent && (
              <div style={{ marginTop: 12, padding: 14, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', marginBottom: 12 }}>
                  🔄 ボスマネ→リードマネ 変換結果
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {/* Before */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Before（変換前）</div>
                    <div style={{
                      padding: 10, background: 'rgba(239,68,68,0.04)',
                      border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                      fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8,
                      whiteSpace: 'pre-wrap', height: 500, overflowY: 'auto',
                    }}>
                      {bossBeforeContent}
                    </div>
                  </div>
                  {/* After */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>After（リードマネジメント型）</span>
                      {!bossAfterEditing ? (
                        <button
                          onClick={() => { setBossAfterEditing(true); setBossAfterEdited(bossAfterContent); }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(29,158,117,0.3)', background: 'transparent', color: '#1D9E75', cursor: 'pointer' }}
                        >✏️ 編集</button>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => { setBossAfterContent(bossAfterEdited); setBossAfterEditing(false); }}
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                          >確定</button>
                          <button
                            onClick={() => { setBossAfterEditing(false); setBossAfterEdited(''); }}
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >キャンセル</button>
                        </div>
                      )}
                    </div>
                    {bossAfterEditing ? (
                      <textarea
                        value={bossAfterEdited}
                        onChange={e => setBossAfterEdited(e.target.value)}
                        style={{
                          width: '100%', padding: 12,
                          background: 'rgba(29,158,117,0.04)',
                          border: '2px solid rgba(29,158,117,0.3)', borderRadius: 8,
                          fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8,
                          height: 500, resize: 'vertical', outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                      />
                    ) : (
                      <div style={{
                        padding: 12, background: 'rgba(29,158,117,0.04)',
                        border: '1px solid rgba(29,158,117,0.2)', borderRadius: 8,
                        fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8,
                        whiteSpace: 'pre-wrap', height: 500, overflowY: 'auto',
                      }}>
                        {bossAfterContent || (bossConvertLoading ? '生成中...' : '← 変換ボタンを押すとここに表示されます')}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setEditContent(bossAfterContent);
                      setBossCompareVisible(false);
                      setMessage('✅ リードマネジメント型の文章を本文に採用しました');
                      setTimeout(() => setMessage(''), 3000);
                    }}
                    style={{
                      padding: '8px 20px', borderRadius: 8, border: 'none',
                      background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ✅ この変換を採用する
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(bossAfterContent)
                      .then(() => setMessage('📋 コピーしました！'))}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    📋 コピー
                  </button>
                  <button
                    onClick={() => setBossCompareVisible(false)}
                    style={{
                      padding: '8px 14px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {/* 問いかけ結果表示 */}
            {questionVisible && (
              <div style={{ marginTop: 10, padding: 14, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>💭 章末問いかけ（本文に追加できます）</div>
                {questionLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>生成中...</div>
                ) : (
                  <>
                    <div
                      style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(questionResult) }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setEditContent(prev => prev + '\n\n' + questionResult);
                          setQuestionVisible(false);
                          setMessage('✅ 章末に問いかけを追加しました');
                        }}
                        style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: '#06b6d4', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✅ 章末に追加する
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(questionResult).then(() => setMessage('📋 コピーしました！'))}
                        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                      >
                        📋 コピー
                      </button>
                      <button
                        onClick={() => setQuestionVisible(false)}
                        style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                      >
                        閉じる
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* AI改善ウィザード — 縦並び常時表示 */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ウィザードヘッダー */}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff' }}>🤖 AI改善ウィザード</div>

              {/* ===== Step 1・2 統合: 評価 ＆ 採点 ===== */}
              <div style={{ padding: 18, background: 'rgba(108,99,255,0.04)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  🔍 Step 1・2 — 評価 ＆ 採点
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  現在の文章を評価し、理念一致度スコアを同時に生成します
                </div>
                <button onClick={handleEvaluateAndScore} disabled={isEvaluating} style={{
                  width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: isEvaluating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                }}>
                  {isEvaluating ? '⏳ 評価・採点中...' : evaluationResult ? '🔍 再評価 ＆ 再採点する' : '🔍 評価 ＆ 採点する'}
                </button>

                {evaluationResult && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* 元の文章 */}
                    <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📄 評価した元の文章</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto' }}>
                        {originalContent || editContent}
                      </div>
                    </div>

                    {/* Step1 評価結果（紫） */}
                    <div style={{ padding: 14, background: 'rgba(108,99,255,0.05)', borderRadius: 10, border: '1px solid rgba(108,99,255,0.15)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>📊 現在の文章の評価</div>
                      <div
                        style={{ maxHeight: 350, overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(evaluationResult) }}
                      />
                    </div>

                    {/* Step2 採点結果（緑） */}
                    {scoreResult && (
                      <div style={{ padding: 14, background: 'rgba(29,158,117,0.05)', borderRadius: 10, border: '1px solid rgba(29,158,117,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                          <span style={{
                            fontSize: 22, fontWeight: 800,
                            color: scoreResult.score >= 80 ? '#1D9E75' : scoreResult.score >= 60 ? '#f59e0b' : '#ef4444',
                          }}>
                            {scoreResult.score}点
                          </span>
                          <div style={{ flex: 1, height: 12, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{
                              width: `${scoreResult.score}%`, height: '100%', borderRadius: 6,
                              background: scoreResult.score >= 80 ? '#1D9E75' : scoreResult.score >= 60 ? '#f59e0b' : '#ef4444',
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>理念一致度</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{scoreResult.comment}</div>
                        {scoreResult.suggestions.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {scoreResult.suggestions.map((s, i) => (
                              <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 8, borderLeft: '3px solid rgba(29,158,117,0.4)' }}>
                                {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* まとめて保存ボタン */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={handleSaveEvaluationAndScore} disabled={evaluationSaved}
                        style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.3)', background: evaluationSaved ? 'rgba(108,99,255,0.1)' : 'transparent', color: '#6c63ff', fontSize: 12, fontWeight: 600, cursor: evaluationSaved ? 'default' : 'pointer' }}>
                        {evaluationSaved ? '✓ 保存済み' : '💾 元の文章・評価・採点をまとめて保存する'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== Step 3: AI改善文を生成（チェックボックス複数選択） ===== */}
              <div style={{ padding: 18, background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  ✨ Step 3 — AI改善文を生成する
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  テンプレートを複数選択して同時生成・比較できます
                </div>

                {/* テンプレート選択（チェックボックス付き） */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {improveTemplates.map(t => (
                    <label key={t.k} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, cursor: 'pointer',
                      border: selectedTemplates.includes(t.label) ? '2px solid #6c63ff' : '1px solid var(--border)',
                      background: selectedTemplates.includes(t.label) ? 'rgba(108,99,255,0.06)' : 'var(--bg-card)',
                      transition: 'all 0.15s ease',
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedTemplates.includes(t.label)}
                        onChange={() => toggleTemplate(t.label)}
                        style={{ marginTop: 2, accentColor: '#6c63ff' }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{t.icon} {t.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* 選択数の表示 */}
                {selectedTemplates.length > 0 && (
                  <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 8 }}>
                    ✓ {selectedTemplates.length}種類を選択中
                  </div>
                )}

                {/* 自由指示 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>追加の指示（選択テンプレートと組み合わせ可）：</div>
                  <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                    placeholder="例：理念に沿って、患者さんへの感謝を込めた表現に"
                    style={{ ...inputStyle, fontSize: 12 }} />
                </div>

                {/* 生成ボタン */}
                <button
                  onClick={handleGenerateMultiple}
                  disabled={(selectedTemplates.length === 0 && !aiInstruction.trim()) || isGenerating}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: isGenerating ? 'rgba(108,99,255,0.3)' : (selectedTemplates.length === 0 && !aiInstruction.trim()) ? 'rgba(108,99,255,0.15)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    opacity: (selectedTemplates.length === 0 && !aiInstruction.trim()) ? 0.4 : 1,
                  }}>
                  {isGenerating
                    ? `⏳ 生成中... (${generatedCount}/${selectedTemplates.length || 1})`
                    : `🤖 選択した${selectedTemplates.length || 1}種類を同時生成`}
                </button>

                {/* ローディング中表示 */}
                {isGenerating && (
                  <div style={{
                    marginTop: 8, height: 4,
                    background: 'rgba(108,99,255,0.1)',
                    borderRadius: 2, overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: '-40%',
                      height: '100%', width: '40%',
                      background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.8), transparent)',
                      animation: 'handbookSlide 1.2s ease-in-out infinite',
                    }} />
                  </div>
                )}

                {/* 複数生成結果の比較表示 */}
                {multipleResults.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      📋 生成結果の比較（{multipleResults.length}種類）
                    </div>

                    {/* テキスト出力ボタン（生成結果が1件以上ある場合に表示） */}
                    {multipleResults.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          onClick={handleCopyAll}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: '1px solid #d1d5db',
                            background: exportCopied ? '#dcfce7' : '#f9fafb',
                            color: exportCopied ? '#16a34a' : '#374151',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {exportCopied ? '✓ コピー完了！' : '📋 全案をコピー'}
                        </button>
                        <button
                          onClick={handleDownloadAll}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: '1px solid #d1d5db',
                            background: '#f9fafb',
                            color: '#374151',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ⬇️ .txtダウンロード
                        </button>
                      </div>
                    )}

                    {/* 表示設定コントロール */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>🔤 文字</span>
                        <input type="range" min={12} max={22} value={resultFontSize} onChange={e => setResultFontSize(Number(e.target.value))} style={{ width: 96, accentColor: '#8b5cf6' }} />
                        <span style={{ color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>{resultFontSize}px</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>↕️ 高さ</span>
                        <input type="range" min={200} max={800} step={20} value={resultBoxHeight} onChange={e => setResultBoxHeight(Number(e.target.value))} style={{ width: 96, accentColor: '#8b5cf6' }} />
                        <span style={{ color: 'var(--text-secondary)', width: 48, textAlign: 'right' }}>{resultBoxHeight}px</span>
                      </div>
                      <button onClick={() => { setResultFontSize(13); setResultBoxHeight(660); }} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>リセット</button>
                    </div>

                    {multipleResults.map((r, i) => (
                      <div key={i} style={{ borderRadius: 12, border: finalSelectedLabel === r.label ? '2px solid #22c55e' : '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)', boxShadow: finalSelectedLabel === r.label ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none' }}>
                        {/* ヘッダー */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</span>
                            {r.scoring && (
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: r.scoring.score >= 85 ? '#dcfce7' : r.scoring.score >= 70 ? '#fef9c3' : '#fecaca', color: r.scoring.score >= 85 ? '#15803d' : r.scoring.score >= 70 ? '#a16207' : '#dc2626' }}>
                                {r.scoring.score}点
                                {r.scoring.score_diff > 0 && <span style={{ marginLeft: 4, color: '#16a34a' }}>↑+{r.scoring.score_diff}</span>}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(!r.scoring || r.scoring.score === 0) && (
                              <button
                                onClick={() => handleScoreImproved(i)}
                                disabled={r.isScoringLoading}
                                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 11, fontWeight: 700, cursor: r.isScoringLoading ? 'wait' : 'pointer', opacity: r.isScoringLoading ? 0.5 : 1 }}
                              >
                                {r.isScoringLoading ? '⏳ 採点中...' : '📊 採点'}
                              </button>
                            )}
                            <button
                              onClick={() => handleSaveImproved(r.result, r.label)}
                              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              💾 保存
                            </button>
                            <button
                              onClick={() => {
                                setEditContent(r.result);
                                setMessage(`✅ 「${r.label}」の改善案を本文に適用しました`);
                                setTimeout(() => setMessage(''), 3000);
                              }}
                              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ✏️ 適用
                            </button>
                            <button
                              onClick={() => handleFinalSelect(r)}
                              style={{ padding: '4px 10px', borderRadius: 6, border: finalSelectedLabel === r.label ? 'none' : '1.5px solid #22c55e', background: finalSelectedLabel === r.label ? '#22c55e' : 'transparent', color: finalSelectedLabel === r.label ? '#fff' : '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {finalSelectedLabel === r.label ? '✅ 採用済み' : '✅ これを採用'}
                            </button>
                          </div>
                        </div>
                        {/* Before/After */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                          <div style={{ padding: 12, borderRight: '1px solid var(--border)', height: resultBoxHeight, overflowY: 'auto' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Before</div>
                            <div style={{ fontSize: resultFontSize, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                              {editContent}
                            </div>
                          </div>
                          <div style={{ padding: 12, height: resultBoxHeight, overflowY: 'auto' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#6c63ff', marginBottom: 4 }}>After</div>
                            <div style={{ fontSize: resultFontSize, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                              {r.result}
                            </div>
                          </div>
                        </div>
                        {/* 採点結果 */}
                        {r.scoring && r.scoring.score === 0 ? (
                          <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: '#fef2f2' }}>
                            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>⚠️ 採点に失敗しました。再度「📊 採点」を押してください。</p>
                            <p style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>{r.scoring.comment}</p>
                          </div>
                        ) : r.scoring ? (
                          <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{r.scoring.comment}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>✅ 良い点</p>
                                {r.scoring.good_points.map((p, j) => (
                                  <p key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>・{p}</p>
                                ))}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', marginBottom: 4 }}>💡 改善できる点</p>
                                {r.scoring.improve_points.map((p, j) => (
                                  <p key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>・{p}</p>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>📊 バランス指標</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {([
                                  { key: 'readability' as const, label: '読みやすさ' },
                                  { key: 'agency' as const, label: '主体性・自律' },
                                  { key: 'specificity' as const, label: '具体性' },
                                  { key: 'philosophy' as const, label: '理念一致度' },
                                  { key: 'warmth' as const, label: '温かみ' },
                                ] as const).map(({ key, label }) => {
                                  const val = r.scoring!.balance[key];
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{label}</span>
                                      <div style={{ flex: 1, background: 'var(--border)', borderRadius: 99, height: 8 }}>
                                        <div style={{ width: `${val * 10}%`, height: 8, borderRadius: 99, background: '#8b5cf6', transition: 'width 0.3s' }} />
                                      </div>
                                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{val}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 改善点チェックボックス */}
                            {r.scoring.improve_points.length > 0 && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: '#ea580c' }}>💡 解決する改善点を選択</p>
                                  <button
                                    onClick={() => toggleAllImprovePoints(i, r.scoring!.improve_points)}
                                    style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                                  >
                                    {(r.selectedImprovePoints ?? []).length === r.scoring.improve_points.length ? '全解除' : '全選択'}
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {r.scoring.improve_points.map((point, pi) => {
                                    const checked = (r.selectedImprovePoints ?? []).includes(point);
                                    return (
                                      <label
                                        key={pi}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          gap: 8,
                                          padding: 8,
                                          borderRadius: 8,
                                          border: `1px solid ${checked ? '#fb923c' : 'var(--border)'}`,
                                          background: checked ? '#fff7ed' : 'var(--bg-card)',
                                          cursor: 'pointer',
                                          fontSize: 12,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleImprovePoint(i, point)}
                                          style={{ marginTop: 2, accentColor: '#f97316' }}
                                        />
                                        <span style={{ color: 'var(--text-secondary)' }}>{point}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                <button
                                  onClick={() => handleRewrite(i)}
                                  disabled={r.isRewriting || (r.selectedImprovePoints ?? []).length === 0}
                                  style={{
                                    marginTop: 10,
                                    width: '100%',
                                    padding: '8px 0',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: '#f97316',
                                    color: '#fff',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: r.isRewriting ? 'wait' : (((r.selectedImprovePoints ?? []).length === 0) ? 'not-allowed' : 'pointer'),
                                    opacity: r.isRewriting || (r.selectedImprovePoints ?? []).length === 0 ? 0.4 : 1,
                                  }}
                                >
                                  {r.isRewriting ? '⏳ 再改善中...' : '🚀 選択した改善点を解決して90点超えを目指す'}
                                </button>
                              </div>
                            )}

                            {/* 再改善結果のBefore/After */}
                            {(r.rewritten || r.isRewriting || r.isRewrittenScoring) && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>🚀 再改善結果</p>

                                {r.isRewriting && (
                                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>⏳ AI再改善中...</p>
                                )}

                                {r.rewritten && (
                                  <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                                      <div style={{ padding: 12, height: resultBoxHeight, overflowY: 'auto', borderRight: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>Before（初回改善）</p>
                                        <div style={{ fontSize: resultFontSize, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                          {r.result}
                                        </div>
                                      </div>
                                      <div style={{ padding: 12, height: resultBoxHeight, overflowY: 'auto', background: 'var(--bg-card)' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>After（再改善）</p>
                                        <div style={{ fontSize: resultFontSize, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                          {r.rewritten}
                                        </div>
                                      </div>
                                    </div>

                                    {r.isRewrittenScoring && (
                                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>📊 再改善後を採点中...</p>
                                    )}

                                    {r.rewrittenScoring && (
                                      <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: '#faf5ff' }}>
                                        {/* 再改善スコアのメイン表示 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                          <span style={{
                                            fontSize: 28,
                                            fontWeight: 700,
                                            color: r.rewrittenScoring.score >= 90 ? '#16a34a' : '#ca8a04',
                                          }}>
                                            {r.rewrittenScoring.score}点{r.rewrittenScoring.score >= 90 ? ' 🎉' : ''}
                                          </span>
                                          <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 9999, height: 8 }}>
                                            <div style={{
                                              height: 8,
                                              borderRadius: 9999,
                                              background: r.rewrittenScoring.score >= 90 ? '#16a34a' : '#a855f7',
                                              width: `${r.rewrittenScoring.score}%`,
                                              transition: 'width 0.5s ease',
                                            }} />
                                          </div>
                                        </div>

                                        {/* 初回改善 → 再改善の変化を明示 */}
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          padding: '8px 12px',
                                          background: '#f3f4f6',
                                          borderRadius: 10,
                                          marginBottom: 10,
                                          fontSize: 13,
                                          flexWrap: 'wrap',
                                        }}>
                                          <span style={{ color: '#6b7280' }}>初回改善</span>
                                          <span style={{ fontWeight: 700, color: '#6b7280' }}>{r.scoring?.score ?? '?'}点</span>
                                          <span style={{ color: '#9ca3af' }}>→</span>
                                          <span style={{ color: '#6b7280' }}>再改善</span>
                                          <span style={{ fontWeight: 700, color: r.rewrittenScoring.score >= 90 ? '#16a34a' : '#a855f7' }}>
                                            {r.rewrittenScoring.score}点
                                          </span>
                                          {r.scoring && (
                                            <span style={{
                                              marginLeft: 4,
                                              fontWeight: 700,
                                              color: (r.rewrittenScoring.score - r.scoring.score) >= 0 ? '#16a34a' : '#dc2626',
                                              background: (r.rewrittenScoring.score - r.scoring.score) >= 0 ? '#dcfce7' : '#fee2e2',
                                              padding: '2px 8px',
                                              borderRadius: 9999,
                                            }}>
                                              {(r.rewrittenScoring.score - r.scoring.score) >= 0 ? '+' : ''}
                                              {r.rewrittenScoring.score - r.scoring.score}点
                                            </span>
                                          )}
                                          {r.rewrittenScoring.score_diff !== 0 && (
                                            <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>
                                              元の文章比 {r.rewrittenScoring.score_diff >= 0 ? '+' : ''}{r.rewrittenScoring.score_diff}点
                                            </span>
                                          )}
                                        </div>

                                        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                                          {r.rewrittenScoring.comment}
                                        </p>
                                      </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                      <button
                                        onClick={() => handleSaveRewritten(i)}
                                        disabled={r.rewrittenSaved}
                                        style={{
                                          flex: 1,
                                          padding: '8px 0',
                                          borderRadius: 10,
                                          border: 'none',
                                          background: '#22c55e',
                                          color: '#fff',
                                          fontSize: 13,
                                          fontWeight: 700,
                                          cursor: r.rewrittenSaved ? 'default' : 'pointer',
                                          opacity: r.rewrittenSaved ? 0.5 : 1,
                                        }}
                                      >
                                        {r.rewrittenSaved ? '✓ 保存済み' : '💾 再改善結果を保存'}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditContent(prev => prev + '\n\n---\n\n' + r.rewritten!);
                                          setFinalSelectedLabel(r.label + '（再改善）');
                                        }}
                                        style={{
                                          flex: 1,
                                          padding: '8px 0',
                                          borderRadius: 10,
                                          border: 'none',
                                          background: '#8b5cf6',
                                          color: '#fff',
                                          fontSize: 13,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ✅ この再改善案を採用
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {/* 全カード一括採点ボタン */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        onClick={handleScoreAll}
                        disabled={isScoringAll}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isScoringAll ? 'wait' : 'pointer', opacity: isScoringAll ? 0.5 : 1 }}
                      >
                        {isScoringAll ? '⏳ 全案を採点中...' : '📊 全案を一括採点する'}
                      </button>
                      {multipleResults.some(r => r.scoring) && (
                        <button
                          onClick={handleRewriteAll}
                          disabled={isRewritingAll}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontSize: 13, fontWeight: 700, cursor: isRewritingAll ? 'wait' : 'pointer', opacity: isRewritingAll ? 0.5 : 1 }}
                        >
                          {isRewritingAll ? '⏳ 全案を再改善中...' : '🚀 全案を一括再改善（90点超えを目指す）'}
                        </button>
                      )}
                      {multipleResults.some(r => r.scoring) && (
                        <button
                          onClick={() => setShowBalanceComparison(!showBalanceComparison)}
                          style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {showBalanceComparison ? '比較を閉じる' : '📈 バランス比較'}
                        </button>
                      )}
                    </div>

                    {/* バランス比較ビュー */}
                    {showBalanceComparison && multipleResults.some(r => r.scoring) && (
                      <div style={{ marginTop: 8, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', overflowX: 'auto' }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>📈 全案バランス比較</p>
                        <table style={{ width: '100%', fontSize: 12, textAlign: 'center', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', color: 'var(--text-muted)' }}>指標</th>
                              {multipleResults.filter(r => r.scoring).map(r => (
                                <th key={r.label} style={{ padding: '8px 8px', color: '#8b5cf6' }}>{r.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { key: 'score', label: '総合スコア', isTotal: true },
                              { key: 'readability', label: '読みやすさ', isTotal: false },
                              { key: 'agency', label: '主体性・自律', isTotal: false },
                              { key: 'specificity', label: '具体性', isTotal: false },
                              { key: 'philosophy', label: '理念一致度', isTotal: false },
                              { key: 'warmth', label: '温かみ', isTotal: false },
                            ].map(({ key, label, isTotal }) => (
                              <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: isTotal ? 'rgba(139,92,246,0.06)' : 'transparent', fontWeight: isTotal ? 700 : 400 }}>
                                <td style={{ textAlign: 'left', padding: '8px 12px 8px 0', color: 'var(--text-secondary)' }}>{label}</td>
                                {multipleResults.filter(r => r.scoring).map(r => {
                                  const sc = r.scoring!;
                                  const val = isTotal
                                    ? sc.score
                                    : sc.balance[key as keyof typeof sc.balance];
                                  const max = isTotal ? 100 : 10;
                                  const pct = val / max;
                                  return (
                                    <td key={r.label} style={{ padding: '8px 8px', color: pct >= 0.85 ? '#16a34a' : pct >= 0.70 ? '#a16207' : '#dc2626' }}>
                                      {isTotal ? `${val}点` : val}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr>
                              <td style={{ padding: '8px 12px 8px 0', textAlign: 'left', color: 'var(--text-muted)' }}>決定</td>
                              {multipleResults.filter(r => r.scoring).map(r => (
                                <td key={r.label} style={{ padding: '8px 8px' }}>
                                  <button
                                    onClick={() => handleFinalSelect(r)}
                                    style={{ fontSize: 11, borderRadius: 6, padding: '3px 10px', fontWeight: 700, border: finalSelectedLabel === r.label ? 'none' : '1.5px solid #22c55e', background: finalSelectedLabel === r.label ? '#22c55e' : 'transparent', color: finalSelectedLabel === r.label ? '#fff' : '#16a34a', cursor: 'pointer' }}
                                  >
                                    {finalSelectedLabel === r.label ? '✅ 採用済み' : '採用'}
                                  </button>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* ===== モデル比較セクション ===== */}
            <div style={{ marginTop: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>

              {/* ヘッダー */}
              <button
                onClick={() => { setShowModelCompare(!showModelCompare); if (!showModelCompare) fetchCompareHistory(); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🔬</span>
                  <span style={{ fontWeight: 'bold', fontSize: '15px' }}>モデル比較</span>
                  <span style={{ fontSize: '12px', background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>
                    Sonnet 4.6 vs Opus 4.7
                  </span>
                </div>
                <span style={{ color: '#9ca3af' }}>{showModelCompare ? '▲' : '▼'}</span>
              </button>

              {showModelCompare && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f3f4f6' }}>

                  <p style={{ fontSize: '13px', color: '#6b7280', margin: '12px 0 16px' }}>
                    同じ文章・同じテンプレートでSonnet 4.6とOpus 4.7を同時生成し、品質を比較します。
                  </p>

                  {/* テンプレート選択（ラジオ） */}
                  <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                    比較するテンプレートを1つ選択：
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {improveTemplates.map(t => (
                      <label
                        key={t.label}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '8px',
                          padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                          border: compareTemplate === t.label ? '2px solid #7c3aed' : '2px solid #e5e7eb',
                          background: compareTemplate === t.label ? '#faf5ff' : '#fff',
                        }}
                      >
                        <input
                          type="radio"
                          name="compareTemplate"
                          checked={compareTemplate === t.label}
                          onChange={() => {
                            setCompareTemplate(t.label);
                            setCompareTemplatePrompt(t.desc);
                          }}
                          style={{ marginTop: '2px', accentColor: '#7c3aed' }}
                        />
                        <div>
                          <p style={{ fontWeight: 'bold', fontSize: '13px' }}>{t.icon} {t.label}</p>
                          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{t.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* 比較実行ボタン */}
                  <button
                    onClick={handleCompareModels}
                    disabled={isComparing || !compareTemplate}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '12px',
                      background: isComparing || !compareTemplate ? '#e5e7eb' : '#7c3aed',
                      color: '#fff', fontWeight: 'bold', fontSize: '14px',
                      border: 'none', cursor: isComparing || !compareTemplate ? 'not-allowed' : 'pointer',
                      marginBottom: '20px',
                    }}
                  >
                    {isComparing ? '⏳ Sonnet・Opusで同時生成中...' : '🔬 2モデルで同時生成・比較'}
                  </button>

                  {/* 比較結果 */}
                  {compareResult && (
                    <div>
                      {/* 3カラム比較テーブル */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>

                        {/* 元の文章 */}
                        <div style={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                          <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>📄 元の文章</p>
                          </div>
                          <div style={{ padding: '12px 14px', height: `${resultBoxHeight}px`, overflowY: 'auto' }}>
                            <p style={{ fontSize: `${resultFontSize}px`, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>
                              {editContent}
                            </p>
                          </div>
                        </div>

                        {/* Sonnet・Opus結果 */}
                        {(['sonnet', 'opus'] as const).map(modelKey => {
                          const data = compareResult[modelKey];
                          const label = modelKey === 'sonnet' ? '⚡ Sonnet 4.6' : '🏆 Opus 4.7';
                          const color = modelKey === 'sonnet' ? '#1d9e75' : '#7c3aed';
                          return (
                            <div key={modelKey} style={{ borderRadius: '12px', border: `2px solid ${color}`, overflow: 'hidden' }}>
                              {/* モデルヘッダー */}
                              <div style={{ padding: '10px 14px', background: `${color}15`, borderBottom: `1px solid ${color}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontWeight: 'bold', fontSize: '13px', color }}>
                                  {label}
                                </p>
                                {data.scoring?.score > 0 && (
                                  <span style={{
                                    fontWeight: 'bold', fontSize: '14px',
                                    color: data.scoring.score >= 85 ? '#16a34a' : data.scoring.score >= 70 ? '#ca8a04' : '#dc2626',
                                  }}>
                                    {data.scoring.score}点
                                  </span>
                                )}
                              </div>
                              {/* 本文 */}
                              <div style={{ padding: '12px 14px', height: `${resultBoxHeight}px`, overflowY: 'auto' }}>
                                <p style={{ fontSize: `${resultFontSize}px`, color: '#1f2937', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>
                                  {data.result}
                                </p>
                              </div>
                              {/* スコア詳細 */}
                              {data.scoring?.score > 0 && (
                                <div style={{ padding: '12px 14px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
                                  <p style={{ fontSize: '12px', color: '#374151', marginBottom: '8px' }}>{data.scoring.comment}</p>
                                  {/* バランス指標 */}
                                  {['readability','agency','specificity','philosophy','warmth'].map((key, ki) => {
                                    const labels = ['読みやすさ','主体性','具体性','理念一致','温かみ'];
                                    const val = data.scoring.balance?.[key] ?? 0;
                                    return (
                                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '11px', color: '#9ca3af', width: '52px' }}>{labels[ki]}</span>
                                        <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '9999px', height: '6px' }}>
                                          <div style={{ width: `${val * 10}%`, height: '6px', borderRadius: '9999px', background: color }} />
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#6b7280', width: '16px', textAlign: 'right' }}>{val}</span>
                                      </div>
                                    );
                                  })}
                                  {/* 採用ボタン */}
                                  <button
                                    onClick={() => handleAdoptModel(modelKey)}
                                    style={{
                                      marginTop: '10px', width: '100%', padding: '8px',
                                      background: color, color: '#fff', borderRadius: '8px',
                                      border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
                                    }}
                                  >
                                    ✅ この案を採用
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 保存エリア */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '16px',
                        padding: '12px 16px',
                        background: '#f9fafb',
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                      }}>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {compareSaved
                            ? '✓ DBに保存済み。下の履歴から確認できます。'
                            : '比較結果をDBに保存して後から確認できます'}
                        </div>
                        <button
                          onClick={() => handleSaveComparison()}
                          disabled={compareSaved}
                          style={{
                            padding: '8px 20px',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            background: compareSaved ? '#dcfce7' : '#1d9e75',
                            color: compareSaved ? '#16a34a' : '#fff',
                            border: 'none',
                            cursor: compareSaved ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {compareSaved ? '✓ 保存済み' : '💾 比較結果を保存する'}
                        </button>
                      </div>

                      {/* スコアサマリー比較 */}
                      {compareResult.sonnet.scoring?.score > 0 && compareResult.opus.scoring?.score > 0 && (
                        <div style={{ marginTop: '16px', padding: '14px 16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                          <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '10px' }}>📊 スコアサマリー</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {(['sonnet', 'opus'] as const).map(modelKey => {
                              const s = compareResult[modelKey].scoring;
                              const label = modelKey === 'sonnet' ? '⚡ Sonnet 4.6' : '🏆 Opus 4.7';
                              const color = modelKey === 'sonnet' ? '#1d9e75' : '#7c3aed';
                              const isWinner = modelKey === 'sonnet'
                                ? compareResult.sonnet.scoring.score >= compareResult.opus.scoring.score
                                : compareResult.opus.scoring.score > compareResult.sonnet.scoring.score;
                              return (
                                <div key={modelKey} style={{ padding: '12px', borderRadius: '10px', border: `2px solid ${isWinner ? color : '#e5e7eb'}`, background: isWinner ? `${color}10` : '#fff' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color }}>{label}</span>
                                    {isWinner && <span style={{ fontSize: '11px', background: color, color: '#fff', padding: '1px 6px', borderRadius: '9999px' }}>高スコア</span>}
                                  </div>
                                  <p style={{ fontSize: '24px', fontWeight: 'bold', color }}>{s.score}点</p>
                                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', lineHeight: '1.5' }}>{s.comment?.slice(0, 60)}...</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 比較履歴 */}
                  {compareHistory.length > 0 && (
                    <div style={{ marginTop: '24px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <button
                          onClick={() => setShowCompareHistory(!showCompareHistory)}
                          style={{
                            fontSize: '14px', fontWeight: 'bold', color: '#374151',
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                          }}
                        >
                          🗂 比較履歴
                          <span style={{
                            fontSize: '12px', background: '#ede9fe', color: '#7c3aed',
                            padding: '1px 8px', borderRadius: '9999px',
                          }}>
                            {compareHistory.length}件
                          </span>
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                            {showCompareHistory ? '▲ 閉じる' : '▼ 開く'}
                          </span>
                        </button>
                      </div>

                      {showCompareHistory && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {compareHistory.map((h, i) => (
                            <div
                              key={h.id ?? i}
                              style={{
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                overflow: 'hidden',
                                background: '#fff',
                              }}
                            >
                              {/* 履歴ヘッダー */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: '#f9fafb',
                                borderBottom: '1px solid #f3f4f6',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                                    {h.template_label}
                                  </span>
                                  {h.selected_model && (
                                    <span style={{
                                      fontSize: '11px', background: '#dcfce7', color: '#16a34a',
                                      padding: '1px 8px', borderRadius: '9999px', fontWeight: 'bold',
                                    }}>
                                      ✅ {h.selected_model === 'claude-sonnet-4-6' ? 'Sonnet採用' : 'Opus採用'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                                    {new Date(h.created_at).toLocaleString('ja-JP', {
                                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                  <button
                                    onClick={() => setExpandedHistory(expandedHistory === h.id ? null : h.id)}
                                    style={{
                                      fontSize: '12px', color: '#7c3aed', background: '#ede9fe',
                                      border: 'none', padding: '3px 10px', borderRadius: '8px', cursor: 'pointer',
                                    }}
                                  >
                                    {expandedHistory === h.id ? '閉じる' : '詳細を見る'}
                                  </button>
                                </div>
                              </div>

                              {/* スコアサマリー行 */}
                              <div style={{
                                display: 'flex',
                                gap: '16px',
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderBottom: expandedHistory === h.id ? '1px solid #f3f4f6' : 'none',
                              }}>
                                <span style={{ color: '#1d9e75', fontWeight: 'bold' }}>
                                  ⚡ Sonnet: {h.sonnet_score}点
                                </span>
                                <span style={{ color: '#9ca3af' }}>vs</span>
                                <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>
                                  🏆 Opus: {h.opus_score}点
                                </span>
                                {h.sonnet_score !== h.opus_score && (
                                  <span style={{
                                    fontSize: '12px', color: '#6b7280',
                                    background: '#f3f4f6', padding: '1px 8px', borderRadius: '9999px',
                                  }}>
                                    {h.opus_score > h.sonnet_score
                                      ? `Opusが${h.opus_score - h.sonnet_score}点上回る`
                                      : `Sonnetが${h.sonnet_score - h.opus_score}点上回る`}
                                  </span>
                                )}
                              </div>

                              {/* 展開時：全文表示 */}
                              {expandedHistory === h.id && (
                                <div style={{ padding: '16px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                                    {/* Sonnet */}
                                    <div style={{ borderRadius: '10px', border: '2px solid #1d9e75', overflow: 'hidden' }}>
                                      <div style={{ padding: '8px 12px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#1d9e75' }}>⚡ Sonnet 4.6</span>
                                        <span style={{ fontWeight: 'bold', color: '#1d9e75' }}>{h.sonnet_score}点</span>
                                      </div>
                                      <div style={{ padding: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                                        <p style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: '1.7', marginBottom: '8px' }}>
                                          {h.sonnet_result}
                                        </p>
                                        <p style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                                          {h.sonnet_comment}
                                        </p>
                                      </div>
                                      {/* 採用ボタン */}
                                      {!h.selected_model && (
                                        <div style={{ padding: '8px 12px', borderTop: '1px solid #f3f4f6' }}>
                                          <button
                                            onClick={async () => {
                                              setEditContent(h.sonnet_result);
                                              await fetch('/api/clinic/handbook-model-compare', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ id: h.id, selected_model: 'claude-sonnet-4-6' }),
                                              });
                                              fetchCompareHistory();
                                              setMessage('✅ Sonnetの案をエディタに反映しました');
                                              setTimeout(() => setMessage(''), 2000);
                                            }}
                                            style={{
                                              width: '100%', padding: '6px', background: '#1d9e75',
                                              color: '#fff', borderRadius: '8px', border: 'none',
                                              fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                                            }}
                                          >
                                            ✅ この案を採用
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Opus */}
                                    <div style={{ borderRadius: '10px', border: '2px solid #7c3aed', overflow: 'hidden' }}>
                                      <div style={{ padding: '8px 12px', background: '#faf5ff', borderBottom: '1px solid #e9d5ff', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#7c3aed' }}>🏆 Opus 4.7</span>
                                        <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>{h.opus_score}点</span>
                                      </div>
                                      <div style={{ padding: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                                        <p style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: '1.7', marginBottom: '8px' }}>
                                          {h.opus_result}
                                        </p>
                                        <p style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                                          {h.opus_comment}
                                        </p>
                                      </div>
                                      {/* 採用ボタン */}
                                      {!h.selected_model && (
                                        <div style={{ padding: '8px 12px', borderTop: '1px solid #f3f4f6' }}>
                                          <button
                                            onClick={async () => {
                                              setEditContent(h.opus_result);
                                              await fetch('/api/clinic/handbook-model-compare', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ id: h.id, selected_model: 'claude-opus-4-7' }),
                                              });
                                              fetchCompareHistory();
                                              setMessage('✅ Opusの案をエディタに反映しました');
                                              setTimeout(() => setMessage(''), 2000);
                                            }}
                                            style={{
                                              width: '100%', padding: '6px', background: '#7c3aed',
                                              color: '#fff', borderRadius: '8px', border: 'none',
                                              fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                                            }}
                                          >
                                            ✅ この案を採用
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* 改善履歴 */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => { setShowHistory(!showHistory); if (!showHistory && chapters[activeIdx]?.id) loadImproveHistory(chapters[activeIdx].id); }}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>📜 改善履歴（{improveHistories.length}件）</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showHistory ? '▲ 閉じる' : '▼ 開く'}</span>
              </button>

              {showHistory && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historyLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>読み込み中...</div>
                  ) : improveHistories.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                      まだ改善履歴がありません。AI改善を実行すると自動で保存されます。
                    </div>
                  ) : improveHistories.map(h => (
                    <div key={h.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{h.direction || '改善'}</span>
                          {h.template_label && (
                            <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontWeight: 600, marginLeft: 6 }}>
                              {h.template_label}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {new Date(h.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {h.after_content && (
                            <button
                              onClick={() => { setEditContent(h.after_content); setMessage('✅ 過去の改善案を復元しました'); }}
                              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              復元
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm('この履歴を削除しますか？')) return;
                              await fetch('/api/clinic/handbooks/improve-history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: h.id }) });
                              setImproveHistories(prev => prev.filter(x => x.id !== h.id));
                            }}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                          >
                            削除
                          </button>
                        </div>
                      </div>

                      {/* Step1 評価結果 */}
                      {h.evaluation_result && (
                        <div style={{ marginBottom: 6, padding: 10, background: 'rgba(108,99,255,0.05)', borderRadius: 8, border: '1px solid rgba(108,99,255,0.15)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 4 }}>🔍 Step1 評価</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto' }}>
                            {h.evaluation_result}
                          </div>
                        </div>
                      )}

                      {/* Step2 採点結果 */}
                      {h.score_result != null && (
                        <div style={{ marginBottom: 6, padding: 10, background: 'rgba(29,158,117,0.05)', borderRadius: 8, border: '1px solid rgba(29,158,117,0.15)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', marginBottom: 4 }}>
                            🌿 Step2 理念一致度スコア：{h.score_result}点
                          </div>
                          {h.score_comment && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>{h.score_comment}</div>
                          )}
                          {h.score_suggestions && (() => {
                            try {
                              const suggestions = JSON.parse(h.score_suggestions);
                              return Array.isArray(suggestions) && suggestions.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {suggestions.map((s: string, i: number) => (
                                    <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', padding: '3px 8px', background: 'var(--bg-card)', borderRadius: 5, borderLeft: '2px solid rgba(29,158,117,0.4)' }}>
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            } catch { return null; }
                          })()}
                        </div>
                      )}

                      {/* Step3 改善文 Before/After */}
                      {h.after_content && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 3 }}>Before</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, maxHeight: 80, overflowY: 'hidden', padding: '6px 8px', background: 'rgba(239,68,68,0.04)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)' }}>
                              {h.before_content?.slice(0, 120)}...
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#1D9E75', marginBottom: 3 }}>After</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 80, overflowY: 'hidden', padding: '6px 8px', background: 'rgba(29,158,117,0.04)', borderRadius: 6, border: '1px solid rgba(29,158,117,0.15)' }}>
                              {h.after_content.slice(0, 120)}...
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* AIブラッシュアップチャット（フローティングパネル） */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
      }}>
        {chatOpen && (
          <div style={{
            width: 380, height: 560,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* ヘッダー */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(236,72,153,0.05))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 AIブラッシュアップ</span>
                <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
              </div>
              {/* モード切替 */}
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  { k: 'propose', l: '💬 提案' },
                  { k: 'analyze', l: '🔍 分析' },
                  { k: 'free', l: '🎙 対話' },
                ] as const).map(m => (
                  <button key={m.k} onClick={() => { setChatMode(m.k); setChatMessages([]); setChatInput(''); }}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: chatMode === m.k ? 'rgba(108,99,255,0.15)' : 'transparent', color: chatMode === m.k ? '#6c63ff' : 'var(--text-muted)', borderColor: chatMode === m.k ? 'rgba(108,99,255,0.4)' : 'var(--border)' }}>
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            {/* メッセージ一覧 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  {chatMode === 'propose' && '「もっと温かみを出したい」「患者への感謝を入れたい」など、話しかけてください'}
                  {chatMode === 'analyze' && (
                    <div>
                      <div style={{ marginBottom: 8 }}>AIがこの章を分析します</div>
                      <button onClick={() => sendChat('analyze')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🔍 今すぐ分析する
                      </button>
                    </div>
                  )}
                  {chatMode === 'free' && '自由に話しかけてください。AIが文章化・整理します'}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}>{msg.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '8px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                    考え中...
                  </div>
                </div>
              )}
            </div>

            {/* aiResultがある場合の適用バナー */}
            {aiResult && chatMode === 'free' && (
              <div style={{ padding: '8px 12px', background: 'rgba(74,222,128,0.1)', borderTop: '1px solid rgba(74,222,128,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#4ade80' }}>✅ 改善案があります</span>
                <button onClick={applyAi} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>本文に反映</button>
              </div>
            )}

            {/* 入力エリア */}
            {chatMode !== 'analyze' && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={chatMode === 'propose' ? 'こうしたい、を話しかける...' : '自由に話しかける...'}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                />
                <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: chatLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  送信
                </button>
              </div>
            )}
          </div>
        )}

        {/* トグルボタン */}
        <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setChatMessages([]); }}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: chatOpen ? 'var(--bg-card)' : 'linear-gradient(135deg, #6c63ff, #ec4899)',
            color: chatOpen ? 'var(--text-muted)' : '#fff',
            fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(108,99,255,0.4)',
          }}>
          {chatOpen ? '✕' : '🤖'}
        </button>
      </div>
    </div>
    </>
  );
}
