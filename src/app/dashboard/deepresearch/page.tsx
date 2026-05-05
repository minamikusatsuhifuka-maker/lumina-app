'use client';
import { useState, useEffect, useRef } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { DateRangePicker, DateRange, getDateCondition } from '@/components/DateRangePicker';

const TEMPLATES = [
  { label: 'AI最新動向', topic: '2026年の生成AI・大規模言語モデルの最新動向と活用事例' },
  { label: 'ブログ収益化', topic: 'ブログ・noteで月10万円稼ぐための最新戦略と実践方法' },
  { label: '電子書籍出版', topic: 'Kindleダイレクト・パブリッシングで電子書籍を出版する方法と収益化' },
  { label: 'SEO対策', topic: '2026年最新のSEO対策・Google検索アルゴリズム変化への対応' },
  { label: '小説執筆', topic: 'プロ作家に学ぶ小説執筆テクニック・キャラクター作り・世界観構築' },
  { label: 'SNSマーケ', topic: 'X(Twitter)・Instagram・TikTokを活用したコンテンツマーケティング最新手法' },
];

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const waitMs = (i + 1) * 3000;
    console.log(`[retry] 429 received, waiting ${waitMs}ms... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  return fetch(url, options);
}

const processInline = (text: string): string => {
  // 太字
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');

  // 「出典: サイト名 https://URL」形式
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">$1 ↗</a>'
  );

  // 裸のURL（前後に余分なものがないもの）
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

    // 見出し
    if (t.startsWith('# ')) return `<div style="font-size:1.25em;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2))}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.1em;font-weight:600;color:var(--text-secondary);margin:16px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3))}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1em;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${processInline(t.slice(4))}</div>`;

    // 番号付きリスト
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.7;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2])}</span></div>`;
    }

    // 箇条書き
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.7;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2))}</span></div>`;
    }

    // 出典行（「出典:」で始まる行）
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      return `<div style="font-size:0.85em;color:var(--text-muted);padding:4px 0 4px 12px;border-left:2px solid rgba(0,212,184,0.3);margin:4px 0;">${processInline(t)}</div>`;
    }

    // 区切り線
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';

    // 空行
    if (t === '') return '<div style="height:8px"></div>';

    // 通常のテキスト
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
  });

  return html.join('');
};

type BatchTopic = { topic: string; mode: 'quick' | 'standard' | 'deep' };
type ProgressEvent = { type: string; index?: number; topic?: string; total?: number; error?: string; success?: boolean; jobId?: number; message?: string };
type BatchJob = {
  id: number;
  group_name: string;
  topics: { topic: string; mode: string; status: string }[];
  schedule_type: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
};

export default function DeepResearchPage() {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState('standard');
  const [tab, setTab] = useState<'single' | 'batch'>('single');

  // バッチリサーチ
  const [batchTopics, setBatchTopics] = useState<BatchTopic[]>([{ topic: '', mode: 'standard' }]);
  const [scheduleType, setScheduleType] = useState<'immediate' | 'browser' | 'cron'>('immediate');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [groupName, setGroupName] = useState('');
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [runningJobId, setRunningJobId] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<ProgressEvent[]>([]);
  type TopicStatus = 'pending' | 'researching' | 'generating' | 'done' | 'error';
  const [topicStatuses, setTopicStatuses] = useState<Record<number, TopicStatus>>({});
  const [isStuck, setIsStuck] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const browserTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ブラウザタイマー カウントダウン表示
  const [browserCountdown, setBrowserCountdown] = useState<{
    jobId: number;
    targetTime: number;
    groupName: string;
  } | null>(null);
  const [countdownDisplay, setCountdownDisplay] = useState('');

  // カウントダウン更新
  useEffect(() => {
    if (!browserCountdown) {
      setCountdownDisplay('');
      return;
    }
    const update = () => {
      const remaining = browserCountdown.targetTime - Date.now();
      if (remaining <= 0) {
        setCountdownDisplay('実行中...');
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdownDisplay(
        h > 0 ? `${h}時間${m}分${s}秒後に実行` : `${m}分${s}秒後に実行`
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [browserCountdown]);

  // ページ離脱時の警告（タイマー待機中のみ）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (browserCountdown) {
        e.preventDefault();
        e.returnValue = 'ブラウザタイマーが待機中です。ページを離れるとタイマーがキャンセルされます。';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [browserCountdown]);

  const handleDeleteJob = async (jobId: number, status: string) => {
    if (status === 'running') return;
    if (!confirm('このジョブを削除しますか？')) return;
    try {
      const res = await fetch(`/api/batch-research?id=${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        loadBatchJobs();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`削除できませんでした: ${data.error || res.status}`);
      }
    } catch {
      alert('削除中にエラーが発生しました');
    }
  };

  const loadBatchJobs = async () => {
    try {
      const res = await fetch('/api/batch-research?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      setBatchJobs(data.jobs || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'batch') loadBatchJobs();
    return () => {
      if (browserTimerRef.current) clearTimeout(browserTimerRef.current);
    };
  }, [tab]);

  // URLパラメータ ?q=...&fromNode=...&depth=... で自動リサーチ
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      const fromNode = params.get('fromNode');
      const depthParam = params.get('depth');
      if (q) {
        const parentId = fromNode ? parseInt(fromNode, 10) : null;
        const startDepth = depthParam ? parseInt(depthParam, 10) : 0;
        setTopic(q);
        setCurrentDepth(startDepth);
        // 自動リサーチ実行
        research(q, parentId, startDepth);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBatchTopic = () => setBatchTopics(prev => prev.length < 10 ? [...prev, { topic: '', mode: 'standard' }] : prev);
  const removeBatchTopic = (i: number) => setBatchTopics(prev => prev.filter((_, idx) => idx !== i));
  const updateBatchTopic = (i: number, patch: Partial<BatchTopic>) => {
    setBatchTopics(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  };

  const clearBatchTimers = () => {
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    stuckTimerRef.current = null;
    elapsedTimerRef.current = null;
  };

  const resetStuckTimer = () => {
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    setIsStuck(false);
    stuckTimerRef.current = setTimeout(() => setIsStuck(true), 60000); // 60秒無応答でアラート
  };

  const runBatchJob = async (jobId: number) => {
    setRunningJobId(jobId);
    setBatchProgress([]);
    setTopicStatuses({});
    setIsStuck(false);
    setElapsedSeconds(0);

    // 経過時間カウンター
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    // スタック検知タイマー初期化
    resetStuckTimer();

    try {
      const res = await fetch(`/api/batch-research/${jobId}/run`, { method: 'POST' });
      if (!res.ok || !res.body) {
        const err = await res.text();
        alert(`実行エラー: ${err.slice(0, 200)}`);
        setRunningJobId(null);
        clearBatchTimers();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
            const event = JSON.parse(json) as ProgressEvent;
            // イベント受信のたびにスタックタイマーをリセット
            resetStuckTimer();
            setBatchProgress(prev => [...prev, event]);

            const idx = event.index ?? -1;
            if (event.type === 'topic_start' && idx >= 0) {
              setTopicStatuses(prev => ({ ...prev, [idx]: 'researching' }));
            } else if (event.type === 'research_done' && idx >= 0) {
              setTopicStatuses(prev => ({ ...prev, [idx]: 'generating' }));
            } else if (event.type === 'topic_done' && idx >= 0) {
              setTopicStatuses(prev => ({ ...prev, [idx]: 'done' }));
            } else if (event.type === 'topic_error' && idx >= 0) {
              setTopicStatuses(prev => ({ ...prev, [idx]: 'error' }));
            } else if (event.type === 'all_done' || event.type === 'error') {
              clearBatchTimers();
              setRunningJobId(null);
              setIsStuck(false);
              loadBatchJobs();
            }
          } catch {}
        }
      }
    } catch (e: any) {
      alert(`通信エラー: ${e?.message || ''}`);
    } finally {
      clearBatchTimers();
      setRunningJobId(null);
    }
  };

  const handleBatchSubmit = async () => {
    const validTopics = batchTopics.filter(t => t.topic.trim());
    if (validTopics.length === 0) {
      alert('トピックを入力してください');
      return;
    }
    if ((scheduleType === 'browser' || scheduleType === 'cron') && !scheduledAt) {
      alert('実行時刻を指定してください');
      return;
    }

    try {
      const res = await fetch('/api/batch-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupName: groupName.trim() || undefined,
          topics: validTopics,
          scheduleType,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          notifyEmail: notifyEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`登録エラー: ${data.error || '不明なエラー'}`);
        return;
      }
      const jobId = data.job?.id;
      await loadBatchJobs();

      if (scheduleType === 'immediate') {
        await runBatchJob(jobId);
      } else if (scheduleType === 'browser') {
        // datetime-local はローカル時刻として正しく解釈される
        const targetTime = new Date(scheduledAt).getTime();
        const now = Date.now();
        const delay = targetTime - now;

        if (delay <= 0) {
          alert('過去の時刻は設定できません。未来の時刻を指定してください。');
          return;
        }
        if (delay > 24 * 60 * 60 * 1000) {
          alert('ブラウザタイマーは24時間以内の時刻のみ設定できます。\n24時間以上先はサーバー自動実行をご利用ください。');
          return;
        }

        const minutes = Math.floor(delay / 60000);
        const seconds = Math.floor((delay % 60000) / 1000);

        if (browserTimerRef.current) clearTimeout(browserTimerRef.current);
        browserTimerRef.current = setTimeout(async () => {
          setBrowserCountdown(null);
          await runBatchJob(jobId);
        }, delay);

        setBrowserCountdown({
          jobId,
          targetTime,
          groupName: groupName.trim() || 'バッチリサーチ',
        });

        alert(
          `✅ ブラウザタイマーをセットしました。\n\n` +
          `実行予定: ${new Date(scheduledAt).toLocaleString('ja-JP')}\n` +
          `（約${minutes}分${seconds}秒後）\n\n` +
          `⚠️ このページを開いたまま待機してください。\n` +
          `ページを閉じるとタイマーがキャンセルされます。`
        );
      } else {
        alert(`サーバー自動実行ジョブを登録しました。\n毎朝7時（日本時間）に自動実行されます。\nページを閉じても実行されます。`);
      }
    } catch (e: any) {
      alert(`通信エラー: ${e?.message || ''}`);
    }
  };

  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [elapsed, setElapsed] = useState(0);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  // AI背景情報コンテキスト最適化
  const [contextText, setContextText] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [savedContextId, setSavedContextId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState('');

  // 専門用語サーチ
  type ExtractedTerm = { term: string; reading: string; category: string; difficulty: 'やや難' | '難' | '超難'; context: string; alreadySaved?: boolean };
  type ExplainedTerm = { id?: number; term: string; reading?: string | null; explanation?: string; category?: string; alreadyExists?: boolean; error?: string };
  const [extractedTerms, setExtractedTerms] = useState<ExtractedTerm[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [isExtractingTerms, setIsExtractingTerms] = useState(false);
  const [isExplainingTerms, setIsExplainingTerms] = useState(false);
  const [explainedTerms, setExplainedTerms] = useState<ExplainedTerm[]>([]);
  const [extractError, setExtractError] = useState('');

  const extractTermsFromResearch = async (researchText: string, t: string) => {
    setIsExtractingTerms(true);
    setExtractedTerms([]);
    setSelectedTerms(new Set());
    setExplainedTerms([]);
    setExtractError('');
    try {
      const res = await fetch('/api/glossary/research-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ researchText, topic: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(`抽出エラー: ${data.error || res.status}`);
        return;
      }
      const terms = Array.isArray(data.terms) ? data.terms : [];
      setExtractedTerms(terms);
      if (terms.length === 0) {
        setExtractError('AIが専門用語を検出できませんでした。');
      }
    } catch (e: any) {
      console.error('用語抽出エラー:', e);
      setExtractError(`通信エラー: ${e?.message || ''}`);
    } finally {
      setIsExtractingTerms(false);
    }
  };

  const handleExplainTerms = async () => {
    const termsToExplain = extractedTerms.filter(t => selectedTerms.has(t.term));
    if (termsToExplain.length === 0) {
      alert('用語を選択してください');
      return;
    }
    setIsExplainingTerms(true);
    setExplainedTerms([]);
    try {
      const res = await fetch('/api/glossary/research-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: termsToExplain, sourceTopic: topic }),
      });
      const data = await res.json();
      setExplainedTerms(data.results || []);
    } catch (e) {
      console.error('用語解説エラー:', e);
    } finally {
      setIsExplainingTerms(false);
    }
  };

  // 関連トピック一括バッチ
  type BatchRelatedItem = { topic: string; status: 'pending' | 'running' | 'done' | 'error' };
  const [selectedRelatedTopics, setSelectedRelatedTopics] = useState<Set<string>>(new Set());
  const [batchRelatedMode, setBatchRelatedMode] = useState(false);
  const [isBatchingRelated, setIsBatchingRelated] = useState(false);
  const [batchRelatedProgress, setBatchRelatedProgress] = useState<BatchRelatedItem[]>([]);

  const handleBatchRelatedResearch = async (mode: 'quick' | 'standard' | 'deep') => {
    const topics = Array.from(selectedRelatedTopics);
    if (topics.length === 0) {
      alert('トピックを選択してください');
      return;
    }
    const modeLabels: Record<typeof mode, string> = { quick: '1500字', standard: '3000字', deep: '5000字' };
    if (!confirm(`選択した${topics.length}件を${modeLabels[mode]}でリサーチします。よろしいですか？`)) return;

    setIsBatchingRelated(true);
    setBatchRelatedProgress(topics.map(t => ({ topic: t, status: 'pending' })));

    for (let i = 0; i < topics.length; i++) {
      const t = topics[i];
      setBatchRelatedProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'running' } : p));

      try {
        // バッチジョブ登録
        const jobRes = await fetch('/api/batch-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupName: `関連リサーチ: ${t.slice(0, 20)}`,
            topics: [{ topic: t, mode }],
            scheduleType: 'immediate',
          }),
        });
        const jobData = await jobRes.json();
        if (!jobRes.ok) throw new Error(jobData.error || 'ジョブ登録失敗');
        const jobId = jobData.job?.id;

        // SSEで完了まで待機
        const runRes = await fetch(`/api/batch-research/${jobId}/run`, { method: 'POST' });
        if (!runRes.ok || !runRes.body) throw new Error('実行開始失敗');
        const reader = runRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let topicCompleted = false;
        while (!topicCompleted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'topic_done' || event.type === 'all_done') {
                topicCompleted = true;
              } else if (event.type === 'topic_error' || event.type === 'error') {
                throw new Error(event.error || event.message || 'リサーチ失敗');
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && (parseErr.message.includes('リサーチ失敗') || parseErr.message.includes('failed'))) {
                throw parseErr;
              }
            }
          }
        }

        // 知識ツリーに親子関係で保存
        await fetch('/api/knowledge/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: currentNodeId,
            topic: t,
            sourceType: 'deepresearch',
            summary: `バッチリサーチ（${modeLabels[mode]}）から自動保存`,
            depth: (currentDepth || 0) + 1,
          }),
        }).catch(() => {});

        setBatchRelatedProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (e) {
        console.error(`関連バッチエラー (${t}):`, e);
        setBatchRelatedProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error' } : p));
      }
    }

    setIsBatchingRelated(false);
    setSelectedRelatedTopics(new Set());
    setBatchRelatedMode(false);
  };

  // 知識ツリー・関連タイトル案
  type SuggestedTitle = { title: string; reason: string; category: string; level: string };
  const [suggestedTitles, setSuggestedTitles] = useState<SuggestedTitle[]>([]);
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [pendingParentId, setPendingParentId] = useState<number | null>(null);
  const [pendingDepth, setPendingDepth] = useState(0);

  const saveNodeAndSuggestTitles = async (
    nodeTopic: string,
    researchText: string,
    parentId: number | null,
    depth: number
  ) => {
    setIsLoadingTitles(true);
    setSuggestedTitles([]);
    try {
      // 1. タイトル案生成
      const sRes = await fetch('/api/knowledge/suggest-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: nodeTopic, researchText, depth }),
      });
      const sData = await sRes.json();
      const titles: SuggestedTitle[] = sData.titles || [];

      // 2. ノード保存
      const nRes = await fetch('/api/knowledge/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          topic: nodeTopic,
          sourceType: 'deepresearch',
          summary: researchText.slice(0, 200),
          depth,
          suggestedTitles: titles,
        }),
      });
      const nData = await nRes.json();

      setSuggestedTitles(titles);
      setCurrentNodeId(nData?.node?.id || null);
      setCurrentDepth(depth);
    } catch (e) {
      console.error('saveNodeAndSuggestTitles エラー:', e);
    } finally {
      setIsLoadingTitles(false);
    }
  };

  const handleTitleClick = (title: string) => {
    setSelectedTitle(title);
    setShowSourcePicker(true);
  };

  const executeWithSource = (source: 'deepresearch' | 'notesearch') => {
    setShowSourcePicker(false);
    if (!selectedTitle) return;
    if (source === 'deepresearch') {
      setTopic(selectedTitle);
      setPendingParentId(currentNodeId);
      setPendingDepth(currentDepth + 1);
      research(selectedTitle, currentNodeId, currentDepth + 1);
    } else {
      const params = new URLSearchParams({
        q: selectedTitle,
        ...(currentNodeId ? { fromNode: String(currentNodeId), depth: String(currentDepth + 1) } : {}),
      });
      window.location.href = `/dashboard/note?${params.toString()}`;
    }
  };

  const optimizeContext = async () => {
    if (!report.trim()) return;
    setOptimizing(true);
    setContextText('');
    setSavedContextId(null);
    try {
      const res = await fetch('/api/deepresearch/optimize-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, researchText: report }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`最適化エラー: ${data.error || '不明なエラー'}`);
      } else {
        setContextText(data.contextText || '');
        if (data.warning) {
          alert(`⚠️ ${data.warning}`);
        }
      }
    } catch (e: any) {
      alert(`通信エラー: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  // AI背景情報コンテキストをMDファイルとしてダウンロード
  const handleDownloadMD = () => {
    if (!contextText) return;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

    const safeTopic = (topic ?? 'コンテキスト')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40);

    const filename = `${dateStr}_${timeStr}_${safeTopic}.md`;

    const mdContent = `---
title: ${topic ?? 'AI背景情報コンテキスト'}
generated_at: ${now.toISOString()}
source: xLUMINA Deep Research
type: ai_context
---

${contextText}
`.trim();

    const blob = new Blob([mdContent], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveContext = async () => {
    if (!contextText.trim()) return;
    setSaveStatus('保存中...');
    try {
      const res = await fetch('/api/context-saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, contextText, researchText: report }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus('');
        alert(`保存エラー: ${data.error || '不明なエラー'}`);
      } else {
        setSavedContextId(data.id);
        setSaveStatus('✅ 保存完了');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e: any) {
      setSaveStatus('');
      alert(`通信エラー: ${e.message}`);
    }
  };

  // コンテキストを sessionStorage に格納してから遷移
  const goToTool = async (tool: 'write' | 'sns-post' | 'lp' | 'materials') => {
    if (!contextText.trim()) return;
    // 未保存ならまず保存
    let id = savedContextId;
    if (!id) {
      try {
        const res = await fetch('/api/context-saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, contextText, researchText: report }),
        });
        const data = await res.json();
        if (res.ok) {
          id = data.id;
          setSavedContextId(id);
        }
      } catch {}
    }
    // sessionStorageにも保持（既存ツールが対応していなくても利用可能にする）
    try {
      sessionStorage.setItem('lumina_context_text', contextText);
      sessionStorage.setItem('lumina_context_topic', topic);
    } catch {}
    const toolPath: Record<typeof tool, string> = {
      'write': '/dashboard/write',
      'sns-post': '/dashboard/sns-post',
      'lp': '/dashboard/lp-generator',
      'materials': '/dashboard/materials',
    };
    const url = id ? `${toolPath[tool]}?contextId=${id}` : toolPath[tool];
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const research = async (t?: string, parentId: number | null = null, startDepth: number | null = null) => {
    const q = t || topic;
    if (!q.trim()) return;
    setLoading(true);
    startProgress();
    setReport('');
    setElapsed(0);
    setSuggestedTitles([]);
    setCurrentNodeId(null);
    if (startDepth !== null) setCurrentDepth(startDepth);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const res = await retryFetch('/api/deepresearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: q + getDateCondition(dateRange), depth }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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

      // 完了後：知識ツリーノード保存＋関連タイトル案生成＋専門用語抽出
      const finalDepth = startDepth !== null ? startDepth : 0;
      const finalParentId = parentId;
      if (accumulated.trim() && !accumulated.startsWith('エラー')) {
        saveNodeAndSuggestTitles(q, accumulated, finalParentId, finalDepth).catch(e => console.error(e));
        extractTermsFromResearch(accumulated, q).catch(e => console.error(e));
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

  const sendToWrite = () => {
    localStorage.setItem('lumina_research_context', report);
    window.location.href = '/dashboard/write';
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report], { type: 'text/plain' }));
    a.download = `lumina_research_${Date.now()}.md`;
    a.click();
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="🔭 ディープリサーチ実行中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔭 ディープリサーチ</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Claude AIが複数ソースを統合し、徹底的なリサーチレポートを生成します</p>

      {/* タブ切替 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setTab('single')}
          style={{
            padding: '10px 20px',
            background: tab === 'single' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
            color: tab === 'single' ? '#fff' : 'var(--text-muted)',
            border: tab === 'single' ? 'none' : '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          🔭 通常リサーチ
        </button>
        <button
          onClick={() => setTab('batch')}
          style={{
            padding: '10px 20px',
            background: tab === 'batch' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
            color: tab === 'batch' ? '#fff' : 'var(--text-muted)',
            border: tab === 'batch' ? 'none' : '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ⚡ バッチリサーチ
        </button>
      </div>

      {tab === 'single' && (<>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>リサーチトピック</div>
          <div style={{ position: 'relative' }}>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={'調査したいテーマを詳しく入力してください\n例：AIを活用したブログ記事の自動生成と収益化の最新事例'}
              style={{ width: '100%', minHeight: 80, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, padding: 12, paddingRight: 48, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }}
            />
            <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
              <VoiceInputButton size="sm" onResult={(text) => setTopic(prev => prev + text)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { value: 'quick', label: '⚡ クイック', desc: '約1500字' },
            { value: 'standard', label: '📊 スタンダード', desc: '約3000字' },
            { value: 'deep', label: '🔭 ディープ', desc: '約5000字+' },
          ].map(d => (
            <button
              key={d.value}
              onClick={() => setDepth(d.value)}
              style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: depth === d.value ? '2px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', background: depth === d.value ? 'var(--accent-soft)' : 'var(--bg-primary)', color: depth === d.value ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, textAlign: 'center' as const }}
            >
              <div>{d.label}</div>
              <div style={{ fontSize: 11, marginTop: 2, fontWeight: 400 }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>調査期間：</span>
          <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="期間を指定（任意）" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => research()}
            disabled={loading}
            style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? `🔍 調査中... ${elapsed}秒` : '🔭 ディープリサーチ開始'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => { setTopic(t.topic); research(t.topic); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>複数のWebソースを調査・統合中...（混雑時は自動でリトライします）</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{elapsed}秒経過 / ディープリサーチは30〜60秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>🔭 リサーチレポート</span>
              <SaveToLibraryButton
                title={`ディープリサーチ: ${topic}`}
                content={report}
                type="deepresearch"
                groupName="ディープリサーチ"
                tags="ディープリサーチ"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(11, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
              </div>
              <button onClick={sendToWrite} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✍️ 文章作成に使う
              </button>
              <button onClick={download} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                💾 MD保存
              </button>
              <button onClick={() => navigator.clipboard.writeText(report)} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
            </div>
          </div>
          <div
            style={{ fontSize: fontSize, color: 'var(--text-secondary)', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatReport(report) }}
          />

          {/* 関連タイトル案（知識ツリー） */}
          {(isLoadingTitles || suggestedTitles.length > 0) && (
            <div style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 12,
              border: '1px solid var(--border-accent)',
              background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  🔗 次に調べると理解が深まるトピック
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    探求深度: Lv.{currentDepth}
                    {currentDepth >= 3 ? ' 🏆 専門家レベル' : currentDepth >= 2 ? ' 🎯 応用レベル' : currentDepth >= 1 ? ' 📚 学習中' : ' 🌱 入門'}
                  </div>
                  {!isLoadingTitles && suggestedTitles.length > 0 && !isBatchingRelated && (
                    <button
                      onClick={() => {
                        setBatchRelatedMode(!batchRelatedMode);
                        setSelectedRelatedTopics(new Set());
                      }}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 6,
                        cursor: 'pointer',
                        border: 'none',
                        color: '#fff',
                        background: batchRelatedMode
                          ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                          : 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
                      }}
                    >
                      {batchRelatedMode ? '✕ キャンセル' : '⚡ まとめて調べる'}
                    </button>
                  )}
                </div>
              </div>

              {/* バッチモードのツールバー */}
              {batchRelatedMode && !isBatchingRelated && suggestedTitles.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  marginBottom: 10,
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 8,
                  flexWrap: 'wrap' as const,
                }}>
                  <button
                    onClick={() => {
                      if (selectedRelatedTopics.size === suggestedTitles.length) {
                        setSelectedRelatedTopics(new Set());
                      } else {
                        setSelectedRelatedTopics(new Set(suggestedTitles.map(s => s.title)));
                      }
                    }}
                    style={{ fontSize: 11, color: '#8b5cf6', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    {selectedRelatedTopics.size === suggestedTitles.length ? '全選択解除' : '全選択'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {selectedRelatedTopics.size} / {suggestedTitles.length} 件選択中
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => handleBatchRelatedResearch('quick')}
                    disabled={selectedRelatedTopics.size === 0}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 700,
                      borderRadius: 6, border: 'none', color: '#fff', cursor: selectedRelatedTopics.size === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedRelatedTopics.size === 0 ? 0.4 : 1,
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    }}
                  >
                    ⚡ 1500字
                  </button>
                  <button
                    onClick={() => handleBatchRelatedResearch('standard')}
                    disabled={selectedRelatedTopics.size === 0}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 700,
                      borderRadius: 6, border: 'none', color: '#fff', cursor: selectedRelatedTopics.size === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedRelatedTopics.size === 0 ? 0.4 : 1,
                      background: 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
                    }}
                  >
                    📖 3000字
                  </button>
                  <button
                    onClick={() => handleBatchRelatedResearch('deep')}
                    disabled={selectedRelatedTopics.size === 0}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 700,
                      borderRadius: 6, border: 'none', color: '#fff', cursor: selectedRelatedTopics.size === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedRelatedTopics.size === 0 ? 0.4 : 1,
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    }}
                  >
                    🔬 5000字
                  </button>
                </div>
              )}

              {/* バッチ実行中の進捗表示 */}
              {isBatchingRelated && batchRelatedProgress.length > 0 && (
                <div style={{
                  padding: 14,
                  marginBottom: 12,
                  background: 'rgba(108,99,255,0.06)',
                  border: '1px solid rgba(108,99,255,0.2)',
                  borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      🚀 一括リサーチ実行中...
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {batchRelatedProgress.filter(p => p.status === 'done' || p.status === 'error').length} / {batchRelatedProgress.length} 完了
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' as const, marginBottom: 10 }}>
                    <div style={{
                      width: `${(batchRelatedProgress.filter(p => p.status === 'done' || p.status === 'error').length / batchRelatedProgress.length) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #00d4b8)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    {batchRelatedProgress.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: 14, width: 20, display: 'inline-block', textAlign: 'center' as const }}>
                          {p.status === 'pending' && '○'}
                          {p.status === 'running' && (
                            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                          )}
                          {p.status === 'done' && '✅'}
                          {p.status === 'error' && '❌'}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                          {p.topic}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {p.status === 'pending' && '待機中'}
                          {p.status === 'running' && 'リサーチ中'}
                          {p.status === 'done' && '完了'}
                          {p.status === 'error' && 'エラー'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* バッチ完了バナー */}
              {!isBatchingRelated && batchRelatedProgress.length > 0 && batchRelatedProgress.every(p => p.status === 'done' || p.status === 'error') && (
                <div style={{
                  padding: 14,
                  marginBottom: 12,
                  background: 'linear-gradient(135deg, rgba(29,158,117,0.10), rgba(0,212,184,0.10))',
                  border: '1px solid rgba(29,158,117,0.3)',
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                    🎉 一括リサーチが完了しました
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    成功: {batchRelatedProgress.filter(p => p.status === 'done').length}件 ／ エラー: {batchRelatedProgress.filter(p => p.status === 'error').length}件
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                    <a href="/dashboard/context-library" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                      🧠 コンテキストライブラリで確認 →
                    </a>
                    <a href="/dashboard/knowledge-tree" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                      🌳 知識ツリーで確認 →
                    </a>
                    <button
                      onClick={() => setBatchRelatedProgress([])}
                      style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, marginLeft: 'auto' }}
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}

              {isLoadingTitles ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' as const, padding: 12 }}>
                  🤖 AIが関連トピックを分析中...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                  {suggestedTitles.map((item, i) => {
                    const lvColor =
                      item.level === 'プロ' ? { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' } :
                      item.level === '専門' ? { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' } :
                      item.level === '応用' ? { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04' } :
                      item.level === '基礎' ? { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' } :
                      { bg: 'rgba(59,130,246,0.18)', color: '#3b82f6' };
                    const isSelected = selectedRelatedTopics.has(item.title);
                    const handleClick = batchRelatedMode
                      ? () => {
                          setSelectedRelatedTopics(prev => {
                            const next = new Set(prev);
                            if (next.has(item.title)) next.delete(item.title);
                            else next.add(item.title);
                            return next;
                          });
                        }
                      : () => handleTitleClick(item.title);
                    return (
                      <button
                        key={i}
                        onClick={handleClick}
                        disabled={isBatchingRelated}
                        style={{
                          textAlign: 'left' as const,
                          padding: 12,
                          background: batchRelatedMode && isSelected ? 'rgba(139,92,246,0.12)' : 'var(--bg-primary)',
                          border: batchRelatedMode && isSelected ? '2px solid #8b5cf6' : '1px solid var(--border)',
                          borderRadius: 8,
                          cursor: isBatchingRelated ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                          opacity: isBatchingRelated ? 0.6 : 1,
                        }}
                        onMouseEnter={e => {
                          if (isBatchingRelated) return;
                          e.currentTarget.style.borderColor = batchRelatedMode && isSelected ? '#8b5cf6' : 'var(--accent)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = batchRelatedMode && isSelected ? '#8b5cf6' : 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          {batchRelatedMode && (
                            <span style={{
                              fontSize: 14, width: 18, height: 18,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 4,
                              border: isSelected ? '2px solid #8b5cf6' : '2px solid var(--border)',
                              background: isSelected ? '#8b5cf6' : 'transparent',
                              color: '#fff', fontWeight: 700, flexShrink: 0, marginTop: 1,
                            }}>
                              {isSelected ? '✓' : ''}
                            </span>
                          )}
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: lvColor.bg, color: lvColor.color, fontWeight: 700, flexShrink: 0 }}>
                            {item.level}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                              {item.reason}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentNodeId && !batchRelatedMode && (
                <div style={{ marginTop: 10, textAlign: 'right' as const }}>
                  <a
                    href="/dashboard/knowledge-tree"
                    style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    🌳 知識ツリーで探求マップを見る →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 専門用語サーチパネル */}
          {(isExtractingTerms || extractedTerms.length > 0 || extractError) && (
            <div style={{
              marginTop: 24,
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden' as const,
            }}>
              <div style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #f59e0b, #ef6c00)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap' as const,
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                  <span style={{ fontSize: 16 }}>📚</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>専門用語サーチ</span>
                  {extractedTerms.length > 0 && (
                    <span style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      {extractedTerms.length}件検出
                    </span>
                  )}
                  {extractedTerms.filter(t => t.alreadySaved).length > 0 && (
                    <span style={{ background: 'rgba(187,247,208,0.95)', color: '#15803d', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      ✅ {extractedTerms.filter(t => t.alreadySaved).length}件保存済み
                    </span>
                  )}
                </div>
                <a href="/dashboard/research-glossary" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, textDecoration: 'none' }}>
                  用語集を見る →
                </a>
              </div>

              {isExtractingTerms ? (
                <div style={{ padding: 18, textAlign: 'center' as const, fontSize: 12, color: 'var(--text-muted)', animation: 'pulse 1.6s ease-in-out infinite' }}>
                  🤖 AIが専門用語を抽出中...
                </div>
              ) : extractedTerms.length === 0 && extractError ? (
                <div style={{ padding: 18, textAlign: 'center' as const, fontSize: 12, color: 'var(--text-muted)' }}>
                  ⚠️ {extractError}
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => extractTermsFromResearch(report, topic)}
                      style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                    >
                      🔄 再試行
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 16, background: 'var(--bg-primary)' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    調べたい用語を選択して「まとめて解説」を押してください
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6, marginBottom: 12 }}>
                    {extractedTerms.map((item) => {
                      const checked = selectedTerms.has(item.term);
                      const diffColor =
                        item.difficulty === '超難' ? { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' } :
                        item.difficulty === '難' ? { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' } :
                        { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04' };
                      const saved = !!item.alreadySaved;
                      return (
                        <label
                          key={item.term}
                          style={{
                            display: 'flex', gap: 8, padding: 10,
                            background: saved ? 'rgba(34,197,94,0.08)' : checked ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)',
                            border: saved ? '1px solid rgba(34,197,94,0.5)' : checked ? '1px solid #f59e0b' : '1px solid var(--border)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            alignItems: 'flex-start' as const,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedTerms);
                              if (e.target.checked) next.add(item.term);
                              else next.delete(item.term);
                              setSelectedTerms(next);
                            }}
                            style={{ marginTop: 2, accentColor: '#f59e0b', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.term}</span>
                              {item.reading && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>（{item.reading}）</span>
                              )}
                              {saved ? (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.18)', color: '#15803d', fontWeight: 700 }}>
                                  ✅ 保存済み
                                </span>
                              ) : (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: diffColor.bg, color: diffColor.color, fontWeight: 700 }}>
                                  {item.difficulty}
                                </span>
                              )}
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                                {item.category}
                              </span>
                            </div>
                            {item.context && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                                文中: 「{item.context}」
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                    <button
                      onClick={() => {
                        if (selectedTerms.size === extractedTerms.length) {
                          setSelectedTerms(new Set());
                        } else {
                          setSelectedTerms(new Set(extractedTerms.map(t => t.term)));
                        }
                      }}
                      style={{ fontSize: 11, color: '#f59e0b', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', fontWeight: 600 }}
                    >
                      {selectedTerms.size === extractedTerms.length ? '全解除' : '全選択'}
                    </button>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selectedTerms.size}件選択中</span>
                    <button
                      onClick={handleExplainTerms}
                      disabled={selectedTerms.size === 0 || isExplainingTerms}
                      style={{
                        marginLeft: 'auto',
                        padding: '8px 16px',
                        background: selectedTerms.size === 0 || isExplainingTerms ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #f59e0b, #ef6c00)',
                        color: selectedTerms.size === 0 || isExplainingTerms ? 'var(--text-muted)' : '#fff',
                        border: 'none', borderRadius: 8, cursor: selectedTerms.size === 0 || isExplainingTerms ? 'not-allowed' : 'pointer',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {isExplainingTerms
                        ? `🔄 解説生成中... (${explainedTerms.length}/${selectedTerms.size})`
                        : `📖 まとめて解説・保存 (${selectedTerms.size}件)`}
                    </button>
                  </div>

                  {/* 解説結果 */}
                  {explainedTerms.length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>📖 解説結果</span>
                        <a href="/dashboard/research-glossary" style={{ fontSize: 11, color: '#f59e0b', textDecoration: 'none' }}>
                          用語集で全件確認 →
                        </a>
                      </div>
                      {explainedTerms.map((item, i) => {
                        const isErr = !!item.error;
                        const isExist = item.alreadyExists;
                        const bg = isErr ? 'rgba(239,68,68,0.06)' : isExist ? 'var(--bg-secondary)' : 'rgba(245,158,11,0.06)';
                        const border = isErr ? '1px solid rgba(239,68,68,0.3)' : isExist ? '1px solid var(--border)' : '1px solid rgba(245,158,11,0.3)';
                        return (
                          <div key={i} style={{ background: bg, border, borderRadius: 8, padding: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.term}</span>
                              {item.reading && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>（{item.reading}）</span>
                              )}
                              {item.category && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                  {item.category}
                                </span>
                              )}
                              {isExist && (
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>保存済み</span>
                              )}
                              {!isExist && !isErr && (
                                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1D9E75', fontWeight: 600 }}>✅ 用語集に保存</span>
                              )}
                            </div>
                            {isErr ? (
                              <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>エラー: {item.error}</p>
                            ) : (
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>{item.explanation}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI背景情報最適化セクション */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
            {!contextText && !optimizing && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={optimizeContext}
                  style={{
                    padding: '12px 28px',
                    background: 'linear-gradient(135deg, #00d4b8, #6c63ff)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(108,99,255,0.25)',
                  }}
                >
                  🧠 AI背景情報として最適化
                </button>
              </div>
            )}

            {optimizing && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ width: 32, height: 32, border: '3px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>背景情報コンテキストを生成中...</div>
              </div>
            )}

            {contextText && !optimizing && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>🧠 AI背景情報コンテキスト</span>
                    {saveStatus && <span style={{ fontSize: 12, color: '#00d4b8', fontWeight: 600 }}>{saveStatus}</span>}
                  </div>
                  <button
                    onClick={optimizeContext}
                    style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    🔄 再生成
                  </button>
                </div>

                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-accent)', borderRadius: 10, padding: 16, marginBottom: 12, maxHeight: 400, overflowY: 'auto' as const }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, fontSize: 12, fontFamily: 'inherit', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {contextText}
                  </pre>
                </div>

                {/* 連携ボタン群 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <button
                    onClick={() => navigator.clipboard.writeText(contextText)}
                    style={{ padding: '8px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📋 コピー
                  </button>
                  <button
                    onClick={handleDownloadMD}
                    disabled={!contextText}
                    title="AIが読み込みやすいMarkdown形式でダウンロード"
                    style={{ padding: '8px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 8, cursor: contextText ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, opacity: contextText ? 1 : 0.4 }}
                  >
                    📄 MDで出力
                  </button>
                  <button
                    onClick={saveContext}
                    style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    💾 保存
                  </button>
                  <button
                    onClick={() => goToTool('write')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✍️ 文章作成へ
                  </button>
                  <button
                    onClick={() => goToTool('sns-post')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📱 SNS投稿へ
                  </button>
                  <button
                    onClick={() => goToTool('lp')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📄 LP作成へ
                  </button>
                  <button
                    onClick={() => goToTool('materials')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📊 資料作成へ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </>)}

      {tab === 'batch' && (
        <div>
          {/* ブラウザタイマー カウントダウンバナー */}
          {browserCountdown && (
            <div style={{
              marginBottom: 16,
              padding: 14,
              background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.08))',
              border: '1px solid var(--border-accent)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap' as const,
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <span style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>⏱</span>
                  ブラウザタイマー待機中
                </div>
                <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                  「{browserCountdown.groupName}」 — {countdownDisplay}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  実行予定: {new Date(browserCountdown.targetTime).toLocaleString('ja-JP')}
                </div>
              </div>
              <button
                onClick={() => {
                  if (browserTimerRef.current) {
                    clearTimeout(browserTimerRef.current);
                    browserTimerRef.current = null;
                  }
                  setBrowserCountdown(null);
                  alert('ブラウザタイマーをキャンセルしました');
                }}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ✕ キャンセル
              </button>
            </div>
          )}

          {/* バッチリサーチ */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            {/* グループ名 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>グループ名（任意）</div>
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="例: 朝のリサーチ 2026-05-06"
                style={{ width: '100%', padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>

            {/* トピックリスト */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>リサーチトピック（最大10件）</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {batchTopics.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 24, textAlign: 'center' as const }}>{i + 1}</span>
                    <input
                      value={item.topic}
                      onChange={e => updateBatchTopic(i, { topic: e.target.value })}
                      placeholder={`トピック ${i + 1}`}
                      style={{ flex: 1, padding: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                    />
                    <select
                      value={item.mode}
                      onChange={e => updateBatchTopic(i, { mode: e.target.value as BatchTopic['mode'] })}
                      style={{ padding: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                    >
                      <option value="quick">⚡ クイック(1500字)</option>
                      <option value="standard">📊 標準(3000字)</option>
                      <option value="deep">🔭 ディープ(5000字)</option>
                    </select>
                    {batchTopics.length > 1 && (
                      <button
                        onClick={() => removeBatchTopic(i)}
                        style={{ width: 28, height: 28, background: 'transparent', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              {batchTopics.length < 10 && (
                <button
                  onClick={addBatchTopic}
                  style={{ marginTop: 8, padding: '6px 14px', background: 'transparent', border: '1px dashed var(--border-accent)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >＋ トピックを追加</button>
              )}
            </div>

            {/* 実行タイミング */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>実行タイミング</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {[
                  { value: 'immediate' as const, label: '⚡ 今すぐ実行', desc: 'すぐ一括実行' },
                  { value: 'browser' as const, label: '🌐 ブラウザタイマー', desc: 'ページ開いたまま' },
                  { value: 'cron' as const, label: '⏰ サーバー自動実行', desc: '毎朝7時に自動実行' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setScheduleType(opt.value)}
                    style={{
                      flex: 1, minWidth: 140, padding: '10px 8px', borderRadius: 8,
                      border: scheduleType === opt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: scheduleType === opt.value ? 'var(--accent-soft)' : 'var(--bg-primary)',
                      color: scheduleType === opt.value ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' as const,
                    }}
                  >
                    <div>{opt.label}</div>
                    <div style={{ fontSize: 10, marginTop: 2, fontWeight: 400, opacity: 0.8 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
              {(scheduleType === 'browser' || scheduleType === 'cron') && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    style={{ padding: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                  />
                  {scheduleType === 'cron' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      ⚠ Vercel Cronで毎分監視・自動実行されます（ページを閉じても実行）
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* メール通知 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>完了通知メール（任意）</div>
              <input
                type="email"
                value={notifyEmail}
                onChange={e => setNotifyEmail(e.target.value)}
                placeholder="example@gmail.com"
                style={{ width: '100%', padding: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>

            {/* 実行ボタン */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleBatchSubmit}
                disabled={!!runningJobId}
                style={{
                  padding: '10px 28px',
                  background: runningJobId ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: runningJobId ? 'var(--text-muted)' : '#fff',
                  border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                  cursor: runningJobId ? 'not-allowed' : 'pointer',
                }}
              >
                {runningJobId
                  ? '⏳ 実行中...'
                  : scheduleType === 'immediate' ? '⚡ 今すぐ一括実行' : '📅 スケジュール登録'}
              </button>
            </div>
          </div>

          {/* ========== 進捗表示（改善版） ========== */}
          {(runningJobId !== null || batchProgress.length > 0) && (() => {
            const validTopics = batchTopics.filter(t => t.topic.trim());
            const completedCount = Object.values(topicStatuses).filter(s => s === 'done' || s === 'error').length;
            const totalCount = validTopics.length;
            const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
            const isRunning = runningJobId !== null;
            const isAllDone = batchProgress.some(p => p.type === 'all_done');
            const min = Math.floor(elapsedSeconds / 60);
            const sec = elapsedSeconds % 60;

            return (
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden' as const,
                marginBottom: 20,
                background: 'var(--bg-secondary)',
              }}>
                {/* ヘッダー */}
                <div style={{
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isRunning
                    ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                    : 'linear-gradient(135deg, #1D9E75, #00d4b8)',
                  flexWrap: 'wrap' as const,
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isRunning ? (
                      <>
                        <div style={{
                          width: 18, height: 18,
                          border: '3px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                          バッチリサーチ実行中
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 18 }}>✅</span>
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                          {isAllDone ? '完了' : '終了'}
                        </span>
                      </>
                    )}
                  </div>
                  {isRunning && (
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                      経過時間: {min}分{sec}秒
                    </span>
                  )}
                </div>

                {/* スタックアラート */}
                {isStuck && isRunning && (
                  <div style={{
                    padding: '12px 18px',
                    background: 'rgba(239,68,68,0.08)',
                    borderBottom: '1px solid rgba(239,68,68,0.3)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    flexWrap: 'wrap' as const,
                  }}>
                    <span style={{ fontSize: 22 }}>⚠️</span>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>
                        60秒以上応答がありません
                      </div>
                      <div style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.6 }}>
                        処理が止まっている可能性があります。ページを再読み込みするか、しばらくお待ちください。
                      </div>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      style={{
                        padding: '6px 14px',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      再読み込み
                    </button>
                  </div>
                )}

                {/* トピック別ステータス */}
                {validTopics.length > 0 && (
                  <div style={{ background: 'var(--bg-primary)' }}>
                    {validTopics.map((item, i) => {
                      const status = (topicStatuses[i] ?? 'pending') as TopicStatus;
                      const labels: Record<TopicStatus, { text: string; color: string }> = {
                        pending: { text: '待機中...', color: 'var(--text-muted)' },
                        researching: { text: '🔭 ディープリサーチ中...', color: '#6c63ff' },
                        generating: { text: '🧠 AIコンテキスト生成中...', color: '#8b5cf6' },
                        done: { text: '✓ リサーチ・コンテキスト保存完了', color: '#1D9E75' },
                        error: { text: '✗ エラーが発生しました', color: '#ef4444' },
                      };
                      const isPulsing = status === 'researching' || status === 'generating';

                      return (
                        <div key={i} style={{
                          padding: '12px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderBottom: i < validTopics.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                            {status === 'pending' && (
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%',
                                border: '2px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, color: 'var(--text-muted)',
                              }}>
                                {i + 1}
                              </span>
                            )}
                            {status === 'researching' && (
                              <div style={{
                                width: 22, height: 22,
                                border: '3px solid rgba(108,99,255,0.2)',
                                borderTopColor: '#6c63ff',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                              }} />
                            )}
                            {status === 'generating' && (
                              <div style={{
                                width: 22, height: 22,
                                border: '3px solid rgba(139,92,246,0.2)',
                                borderTopColor: '#8b5cf6',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                              }} />
                            )}
                            {status === 'done' && <span style={{ fontSize: 18 }}>✅</span>}
                            {status === 'error' && <span style={{ fontSize: 18 }}>❌</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                              {item.topic}
                            </div>
                            <div style={{
                              fontSize: 11,
                              color: labels[status].color,
                              marginTop: 2,
                              animation: isPulsing ? 'pulse 1.6s ease-in-out infinite' : 'none',
                            }}>
                              {labels[status].text}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {item.mode === 'deep' ? '5000字' : item.mode === 'standard' ? '3000字' : '1500字'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 全体プログレスバー */}
                {validTopics.length > 0 && (
                  <div style={{ padding: '12px 18px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      <span>全体進捗</span>
                      <span>{completedCount} / {totalCount} 件完了</span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #6c63ff, #00d4b8)',
                        borderRadius: 99,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                )}

                {/* 完了メッセージ */}
                {isAllDone && (
                  <div style={{
                    padding: '14px 18px',
                    background: 'rgba(29,158,117,0.08)',
                    borderTop: '1px solid rgba(29,158,117,0.3)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75', marginBottom: 8 }}>
                      🎉 全件完了！コンテキストライブラリに保存されました
                    </div>
                    <a
                      href="/dashboard/context-library"
                      style={{
                        display: 'inline-block',
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, #1D9E75, #00d4b8)',
                        color: '#fff',
                        textDecoration: 'none',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      📚 コンテキストライブラリで確認する →
                    </a>
                  </div>
                )}

                {/* エラーメッセージ */}
                {batchProgress.some(p => p.type === 'error') && (
                  <div style={{
                    padding: '12px 18px',
                    background: 'rgba(239,68,68,0.08)',
                    borderTop: '1px solid rgba(239,68,68,0.3)',
                    fontSize: 12,
                    color: '#ef4444',
                  }}>
                    {batchProgress.filter(p => p.type === 'error').map((p, i) => (
                      <div key={i}>❌ {p.message || 'エラーが発生しました'}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 履歴 */}
          {batchJobs.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>📋 バッチジョブ履歴</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {batchJobs.map(job => (
                  <div key={job.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{job.group_name}</span>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                          background:
                            job.status === 'completed' ? 'rgba(29,158,117,0.18)' :
                            job.status === 'running' ? 'rgba(108,99,255,0.18)' :
                            job.status === 'failed' ? 'rgba(239,68,68,0.18)' :
                            'rgba(100,116,139,0.18)',
                          color:
                            job.status === 'completed' ? '#1D9E75' :
                            job.status === 'running' ? '#6c63ff' :
                            job.status === 'failed' ? '#ef4444' :
                            '#64748b',
                        }}>
                          {job.status === 'completed' ? '✅ 完了' :
                           job.status === 'running' ? '⏳ 実行中' :
                           job.status === 'failed' ? '❌ 失敗' : '⏰ 待機中'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px', background: 'var(--bg-primary)', borderRadius: 6 }}>
                          {job.schedule_type === 'immediate' ? '即時' : job.schedule_type === 'browser' ? 'ブラウザ' : 'cron'}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {new Date(job.created_at).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                      {job.topics.map((t, i) => (
                        <span key={i}>
                          {t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'} {t.topic}
                        </span>
                      ))}
                    </div>
                    {job.status === 'pending' && job.scheduled_at && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#6c63ff' }}>
                        ⏰ 実行予定: {new Date(job.scheduled_at).toLocaleString('ja-JP')}
                      </div>
                    )}
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      <a
                        href={`/dashboard/context-library?batch=${job.id}`}
                        style={{ padding: '4px 10px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        📚 コンテキスト確認
                      </a>
                      {(job.status === 'pending' && job.schedule_type !== 'cron') && (
                        <button
                          onClick={() => runBatchJob(job.id)}
                          disabled={!!runningJobId}
                          style={{ padding: '4px 10px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          ▶️ いま実行
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteJob(job.id, job.status)}
                        disabled={job.status === 'running'}
                        title={job.status === 'running' ? '実行中は削除できません' : 'このジョブを削除'}
                        style={{
                          marginLeft: 'auto',
                          padding: '4px 10px',
                          background: 'transparent',
                          border: `1px solid ${job.status === 'running' ? 'var(--border)' : '#ef4444'}`,
                          color: job.status === 'running' ? 'var(--text-muted)' : '#ef4444',
                          borderRadius: 6,
                          cursor: job.status === 'running' ? 'not-allowed' : 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: job.status === 'running' ? 0.5 : 1,
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 実行ソース選択モーダル */}
      {showSourcePicker && selectedTitle && (
        <div
          onClick={() => setShowSourcePicker(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              どちらで調べますか？
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
              「{selectedTitle}」
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <button
                onClick={() => executeWithSource('deepresearch')}
                style={{
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🔭 ディープリサーチで調べる
              </button>
              <button
                onClick={() => executeWithSource('notesearch')}
                style={{
                  padding: '12px 16px',
                  background: 'var(--accent-soft)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-accent)', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                📓 noteサーチで調べる
              </button>
              <button
                onClick={() => setShowSourcePicker(false)}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  color: 'var(--text-muted)', border: 'none', borderRadius: 8,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
