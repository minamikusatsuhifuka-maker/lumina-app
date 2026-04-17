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
  const [multipleResults, setMultipleResults] = useState<{ label: string; icon: string; result: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  // 改善履歴
  const [improveHistories, setImproveHistories] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Before/After表示設定
  const [resultFontSize, setResultFontSize] = useState(16);
  const [resultBoxHeight, setResultBoxHeight] = useState(420);


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
                      <button onClick={() => { setResultFontSize(16); setResultBoxHeight(420); }} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>リセット</button>
                    </div>

                    {multipleResults.map((r, i) => (
                      <div key={i} style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
                        {/* ヘッダー */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.label}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleSaveImproved(r.result, r.label)}
                              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ✅ この案を保存
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
