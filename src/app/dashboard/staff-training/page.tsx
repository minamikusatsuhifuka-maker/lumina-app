'use client';

import { useState } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const CATEGORIES = [
  '皮膚疾患',
  '美容診療機器',
  '使用薬剤',
  'スキンケア製品',
  '手技・術式',
  '治療説明',
  'スキンケア指導',
  '検査',
];

type Status = 'pending' | 'generating' | 'done' | 'error';

interface TopicInput {
  topic: string;
  category: string;
}

interface TopicResult {
  topic: string;
  category: string;
  beginnerContent: string;
  expertContent: string;
  beginnerStatus: Status;
  expertStatus: Status;
}

// ストリームイベントの型
interface SseEvent {
  type: string;
  index?: number;
  topic?: string;
  content?: string;
  error?: string;
}

// ================== サブコンポーネント ==================

const STATUS_BADGE: Record<Status, string> = {
  done: '✓',
  generating: '⏳',
  error: '✗',
  pending: '...',
};

const COMPACT_BTN_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const ACTION_BTN_STYLE: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

// 本文の状態別表示（pending/generating/error/done）
function ContentBody({
  status,
  content,
}: {
  status: Status;
  content: string;
}) {
  if (status === 'pending')
    return <span style={{ color: 'var(--text-muted)' }}>待機中...</span>;
  if (status === 'generating')
    return <span style={{ color: '#6c63ff' }}>🌀 生成中...</span>;
  if (status === 'error')
    return (
      <span style={{ color: '#ef4444' }}>
        ✗ 生成エラー（このタブの内容を取得できませんでした）
      </span>
    );
  return <>{content || '（本文がありません）'}</>;
}

// 左右並列モードの片側1列
function ColumnView({
  title,
  content,
  status,
  level,
  topic,
  category,
  onCopy,
  onDownload,
  copied,
}: {
  title: string;
  content: string;
  status: Status;
  level: 'beginner' | 'expert';
  topic: string;
  category: string;
  onCopy: (text: string, level: 'beginner' | 'expert') => void;
  onDownload: (text: string, level: 'beginner' | 'expert') => void;
  copied: 'beginner' | 'expert' | null;
}) {
  const levelLabel = level === 'beginner' ? '初心者用' : 'エキスパート用';
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-primary)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {title} {STATUS_BADGE[status]}
        </h4>
      </div>

      {status === 'done' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => onCopy(content, level)} style={COMPACT_BTN_STYLE}>
            {copied === level ? '✓ コピー済' : '📋 コピー'}
          </button>
          <button onClick={() => onDownload(content, level)} style={COMPACT_BTN_STYLE}>
            📥 MD
          </button>
          <SaveToLibraryButton
            title={`${topic}（${levelLabel}）`}
            content={content}
            type="staff-training"
            groupName="スタッフ育成資料"
            tags={`スタッフ育成,${category},${levelLabel}`}
          />
        </div>
      )}

      <div
        style={{
          maxHeight: 600,
          overflowY: 'auto',
          padding: 12,
          background: 'var(--bg-secondary)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          fontSize: 13,
          lineHeight: 1.75,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
        }}
      >
        <ContentBody status={status} content={content} />
      </div>
    </div>
  );
}

function TopicResultCard({
  result,
  displayMode,
}: {
  result: TopicResult;
  displayMode: 'tabs' | 'sideBySide';
}) {
  const [activeTab, setActiveTab] = useState<'beginner' | 'expert'>('beginner');
  const [copied, setCopied] = useState<'beginner' | 'expert' | null>(null);

  const tabContent =
    activeTab === 'beginner' ? result.beginnerContent : result.expertContent;
  const tabStatus =
    activeTab === 'beginner' ? result.beginnerStatus : result.expertStatus;

  const copyText = async (text: string, level: 'beginner' | 'expert') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(level);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const downloadText = (text: string, level: 'beginner' | 'expert') => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = yyyymmdd();
    const levelLabel = level === 'beginner' ? '初心者用' : 'エキスパート用';
    a.download =
      sanitizeFilename(`${result.topic}_${levelLabel}_${date}`) + '.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 14px',
    border: active ? '1px solid transparent' : '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    background: active
      ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
      : 'var(--bg-primary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  });

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
        background: 'var(--bg-secondary)',
      }}
    >
      {/* ヘッダー */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {result.topic}
          </h3>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 99,
              background: 'rgba(108,99,255,0.12)',
              color: '#8b5cf6',
              fontWeight: 600,
            }}
          >
            {result.category}
          </span>
        </div>
      </div>

      {displayMode === 'sideBySide' ? (
        // ================== 左右並列モード ==================
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <ColumnView
            title="📘 初心者用 (1000字以内)"
            content={result.beginnerContent}
            status={result.beginnerStatus}
            level="beginner"
            topic={result.topic}
            category={result.category}
            onCopy={copyText}
            onDownload={downloadText}
            copied={copied}
          />
          <ColumnView
            title="📕 エキスパート用 (2000字以内)"
            content={result.expertContent}
            status={result.expertStatus}
            level="expert"
            topic={result.topic}
            category={result.category}
            onCopy={copyText}
            onDownload={downloadText}
            copied={copied}
          />
        </div>
      ) : (
        // ================== タブ切替モード ==================
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => setActiveTab('beginner')}
              style={tabBtnStyle(activeTab === 'beginner')}
            >
              📘 初心者用 (1000字以内) {STATUS_BADGE[result.beginnerStatus]}
            </button>
            <button
              onClick={() => setActiveTab('expert')}
              style={tabBtnStyle(activeTab === 'expert')}
            >
              📕 エキスパート用 (2000字以内) {STATUS_BADGE[result.expertStatus]}
            </button>
          </div>

          {tabStatus === 'done' && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button
                onClick={() => copyText(tabContent, activeTab)}
                style={ACTION_BTN_STYLE}
              >
                {copied === activeTab ? '✓ コピー済' : '📋 コピー'}
              </button>
              <button
                onClick={() => downloadText(tabContent, activeTab)}
                style={ACTION_BTN_STYLE}
              >
                📥 MD ダウンロード
              </button>
              <SaveToLibraryButton
                title={`${result.topic}（${activeTab === 'beginner' ? '初心者用' : 'エキスパート用'}）`}
                content={tabContent}
                type="staff-training"
                groupName="スタッフ育成資料"
                tags={`スタッフ育成,${result.category},${activeTab === 'beginner' ? '初心者用' : 'エキスパート用'}`}
              />
            </div>
          )}

          <div
            style={{
              maxHeight: 500,
              overflowY: 'auto',
              padding: 14,
              background: 'var(--bg-primary)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 13,
              lineHeight: 1.75,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            <ContentBody status={tabStatus} content={tabContent} />
          </div>
        </>
      )}
    </div>
  );
}

// ================== メインページ ==================

export default function StaffTrainingPage() {
  const [topicInputs, setTopicInputs] = useState<TopicInput[]>([
    { topic: '', category: '皮膚疾患' },
  ]);
  const [results, setResults] = useState<TopicResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  // 結果の表示モード（タブ切替 / 左右並列）
  const [displayMode, setDisplayMode] = useState<'tabs' | 'sideBySide'>('tabs');
  // 一括ライブラリ保存
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSaveStatus, setBulkSaveStatus] = useState<{ done: number; total: number } | null>(null);

  const addTopic = () => {
    if (topicInputs.length >= 10) return;
    setTopicInputs((prev) => [...prev, { topic: '', category: '皮膚疾患' }]);
  };

  // 指定件数をまとめて追加（10件上限を超えない範囲で追加）
  const addMultipleTopics = (count: number) => {
    setTopicInputs((prev) => {
      const remaining = 10 - prev.length;
      if (remaining <= 0) return prev;
      const addCount = Math.min(count, remaining);
      const newTopics: TopicInput[] = Array.from({ length: addCount }, () => ({
        topic: '',
        category: '皮膚疾患',
      }));
      return [...prev, ...newTopics];
    });
  };

  // 現在の件数を10件まで埋める
  const fillToMax = () => {
    setTopicInputs((prev) => {
      const remaining = 10 - prev.length;
      if (remaining <= 0) return prev;
      const newTopics: TopicInput[] = Array.from({ length: remaining }, () => ({
        topic: '',
        category: '皮膚疾患',
      }));
      return [...prev, ...newTopics];
    });
  };

  const removeTopic = (i: number) => {
    setTopicInputs((prev) =>
      prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev,
    );
  };

  const updateTopic = (
    i: number,
    key: 'topic' | 'category',
    value: string,
  ) => {
    setTopicInputs((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)),
    );
  };

  const setAllCategory = (category: string) => {
    setTopicInputs((prev) => prev.map((t) => ({ ...t, category })));
  };

  const handleSseEvent = (event: SseEvent) => {
    const idx = event.index ?? -1;
    if (event.type === 'topic_start') {
      setCurrentIndex(idx);
    } else if (event.type === 'beginner_start' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, beginnerStatus: 'generating' } : r,
        ),
      );
    } else if (event.type === 'beginner_done' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                beginnerContent: event.content || '',
                beginnerStatus: 'done',
              }
            : r,
        ),
      );
    } else if (event.type === 'beginner_error' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, beginnerStatus: 'error' } : r,
        ),
      );
    } else if (event.type === 'expert_start' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, expertStatus: 'generating' } : r,
        ),
      );
    } else if (event.type === 'expert_done' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                expertContent: event.content || '',
                expertStatus: 'done',
              }
            : r,
        ),
      );
    } else if (event.type === 'expert_error' && idx >= 0) {
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, expertStatus: 'error' } : r,
        ),
      );
    } else if (event.type === 'error') {
      alert(`生成エラー: ${event.error || '不明なエラー'}`);
    }
  };

  const handleGenerate = async () => {
    const validTopics = topicInputs.filter((t) => t.topic.trim());
    if (validTopics.length === 0) {
      alert('トピックを1つ以上入力してください');
      return;
    }

    setLoading(true);
    setCurrentIndex(0);
    setResults(
      validTopics.map((t) => ({
        topic: t.topic,
        category: t.category,
        beginnerContent: '',
        expertContent: '',
        beginnerStatus: 'pending',
        expertStatus: 'pending',
      })),
    );

    try {
      const res = await fetch('/api/staff-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: validTopics,
          model: getSavedModel(),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`生成リクエスト失敗: ${errText.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            handleSseEvent(JSON.parse(json) as SseEvent);
          } catch {}
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`エラー: ${msg}`);
    } finally {
      setLoading(false);
      setCurrentIndex(-1);
    }
  };

  const handleDownloadAll = () => {
    if (results.length === 0) return;
    const date = yyyymmdd();
    const allContent = results
      .map(
        (r) => `# ${r.topic}（${r.category}）

## 📘 初心者用（1000字以内）

${r.beginnerContent || '（未生成）'}

---

## 📕 エキスパート用（2000字以内）

${r.expertContent || '（未生成）'}

===================================================
`,
      )
      .join('\n\n');

    const blob = new Blob([allContent], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      sanitizeFilename(`スタッフ育成資料まとめ_${results.length}件_${date}`) +
      '.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ライブラリへ一括保存（基本資料 + エキスパート用の両方をPOST）
  const handleBulkSave = async () => {
    const doneResults = results.filter(
      (r) => r.beginnerStatus === 'done' && r.expertStatus === 'done',
    );

    if (doneResults.length === 0) {
      alert('保存対象がありません（両レベルとも生成完了している必要があります）');
      return;
    }

    if (
      !confirm(
        `${doneResults.length} トピック × 2レベル = ${doneResults.length * 2} 件をライブラリに保存します。よろしいですか？`,
      )
    ) {
      return;
    }

    setBulkSaving(true);
    setBulkSaveStatus({ done: 0, total: doneResults.length * 2 });

    let savedCount = 0;
    let errorCount = 0;

    for (const r of doneResults) {
      // 基本資料（初心者用）
      try {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'staff-training',
            title: `${r.topic}(基本資料)`,
            content: r.beginnerContent,
            metadata: {
              category: r.category,
              level: 'beginner',
              savedAt: new Date().toISOString(),
            },
            tags: `スタッフ育成,${r.category},基本資料`,
            group_name: 'スタッフ育成資料',
          }),
        });
        if (res.ok) savedCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
      setBulkSaveStatus((prev) =>
        prev ? { ...prev, done: prev.done + 1 } : null,
      );

      // エキスパート用
      try {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'staff-training',
            title: `${r.topic}(エキスパート用)`,
            content: r.expertContent,
            metadata: {
              category: r.category,
              level: 'expert',
              savedAt: new Date().toISOString(),
            },
            tags: `スタッフ育成,${r.category},エキスパート用`,
            group_name: 'スタッフ育成資料',
          }),
        });
        if (res.ok) savedCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
      setBulkSaveStatus((prev) =>
        prev ? { ...prev, done: prev.done + 1 } : null,
      );
    }

    setBulkSaving(false);

    if (errorCount === 0) {
      alert(
        `✅ ${savedCount} 件すべてライブラリに保存しました。\nサイドバーの「✍️ スタッフ育成ライブラリ」から確認できます。`,
      );
    } else {
      alert(`保存完了: ${savedCount} 件成功 / ${errorCount} 件エラー`);
    }
  };

  const allDone =
    results.length > 0 &&
    results.every(
      (r) =>
        (r.beginnerStatus === 'done' || r.beginnerStatus === 'error') &&
        (r.expertStatus === 'done' || r.expertStatus === 'error'),
    );

  // 一括保存可能なトピック数（両レベル done）
  const bulkSavableCount = results.filter(
    (r) => r.beginnerStatus === 'done' && r.expertStatus === 'done',
  ).length;

  // ================== スタイル ==================
  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    minWidth: 0,
  };

  const selectStyle: React.CSSProperties = {
    padding: '10px 12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    cursor: 'pointer',
    flexShrink: 0,
  };

  const removeBtnStyle: React.CSSProperties = {
    padding: '0 12px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-muted)',
    fontSize: 16,
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: 6,
          }}
        >
          📚 スタッフ育成資料生成
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          医療クリニック向けの教育資料を、
          <strong style={{ color: '#6c63ff' }}>初心者用（1000字以内）</strong>
          と
          <strong style={{ color: '#8b5cf6' }}>エキスパート用（2000字以内）</strong>
          の2レベルで一括生成します。最大10トピック対応。
        </p>
      </div>

      {/* カテゴリ一括設定 */}
      <div style={sectionStyle}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginTop: 0,
            marginBottom: 10,
          }}
        >
          📂 カテゴリで一括設定
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setAllCategory(c)}
              style={{
                padding: '7px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* トピック入力 */}
      <div style={sectionStyle}>
        {/* 見出し + 追加ボタン群（PC: 横並び / モバイル: 折り返し） */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            📝 トピック入力（最大10件）
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button
              onClick={addTopic}
              disabled={loading || topicInputs.length >= 10}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                color:
                  topicInputs.length >= 10
                    ? 'var(--text-muted)'
                    : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  loading || topicInputs.length >= 10
                    ? 'not-allowed'
                    : 'pointer',
                opacity: topicInputs.length >= 10 ? 0.5 : 1,
              }}
            >
              + 1件
            </button>
            <button
              onClick={() => addMultipleTopics(3)}
              disabled={loading || topicInputs.length >= 10}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                color:
                  topicInputs.length >= 10
                    ? 'var(--text-muted)'
                    : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  loading || topicInputs.length >= 10
                    ? 'not-allowed'
                    : 'pointer',
                opacity: topicInputs.length >= 10 ? 0.5 : 1,
              }}
            >
              + 3件
            </button>
            <button
              onClick={() => addMultipleTopics(5)}
              disabled={loading || topicInputs.length >= 10}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                color:
                  topicInputs.length >= 10
                    ? 'var(--text-muted)'
                    : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  loading || topicInputs.length >= 10
                    ? 'not-allowed'
                    : 'pointer',
                opacity: topicInputs.length >= 10 ? 0.5 : 1,
              }}
            >
              + 5件
            </button>
            <button
              onClick={fillToMax}
              disabled={loading || topicInputs.length >= 10}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                color:
                  topicInputs.length >= 10
                    ? 'var(--text-muted)'
                    : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  loading || topicInputs.length >= 10
                    ? 'not-allowed'
                    : 'pointer',
                opacity: topicInputs.length >= 10 ? 0.5 : 1,
              }}
            >
              + 10件まで
            </button>
          </div>
        </div>

        {topicInputs.map((t, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                minWidth: 22,
                fontWeight: 700,
              }}
            >
              {i + 1}.
            </span>
            <input
              value={t.topic}
              onChange={(e) => updateTopic(i, 'topic', e.target.value)}
              placeholder="例: アトピー性皮膚炎の基礎、ハイドラフェイシャル機器の特徴..."
              style={inputStyle}
              disabled={loading}
            />
            <select
              value={t.category}
              onChange={(e) => updateTopic(i, 'category', e.target.value)}
              style={selectStyle}
              disabled={loading}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {topicInputs.length > 1 && (
              <button
                onClick={() => removeTopic(i)}
                style={removeBtnStyle}
                disabled={loading}
                aria-label="削除"
              >
                ✕
              </button>
            )}
          </div>
        ))}

      </div>

      {/* 実行ボタン */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 22px',
            background: loading
              ? 'var(--bg-secondary)'
              : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: loading ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? `🌀 生成中... (${Math.max(currentIndex + 1, 1)}/${results.length || topicInputs.length})`
            : '🚀 育成資料を一括生成'}
        </button>
      </div>

      {/* 結果表示 */}
      {results.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              📊 生成結果（{results.length}件）
            </h2>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {/* ライブラリへ一括保存 */}
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || bulkSavableCount === 0}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    bulkSaving || bulkSavableCount === 0
                      ? 'var(--bg-secondary)'
                      : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color:
                    bulkSaving || bulkSavableCount === 0
                      ? 'var(--text-muted)'
                      : '#fff',
                  fontWeight: 700,
                  cursor: bulkSaving
                    ? 'wait'
                    : bulkSavableCount === 0
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: 13,
                  opacity: bulkSavableCount === 0 && !bulkSaving ? 0.6 : 1,
                }}
                title={
                  bulkSavableCount === 0
                    ? '両レベルとも生成完了したトピックがありません'
                    : `${bulkSavableCount}トピック × 2レベル = ${bulkSavableCount * 2}件を保存`
                }
              >
                {bulkSaving && bulkSaveStatus
                  ? `🔄 保存中... ${bulkSaveStatus.done}/${bulkSaveStatus.total}`
                  : '✍️ すべてライブラリに一括保存'}
              </button>

              {allDone && (
                <button
                  onClick={handleDownloadAll}
                  style={{
                    padding: '8px 16px',
                    background:
                      'linear-gradient(135deg, #1D9E75, #00d4b8)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📥 全資料をMDで一括ダウンロード
                </button>
              )}
            </div>
          </div>

          {/* 表示モード切替トグル */}
          <div
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              🎚 表示モード:
            </span>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {(
                [
                  { id: 'tabs', label: '📑 タブ切替' },
                  { id: 'sideBySide', label: '🔀 左右並列' },
                ] as const
              ).map((m) => {
                const active = displayMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setDisplayMode(m.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 99,
                      border: active
                        ? '1px solid transparent'
                        : '1px solid var(--border)',
                      background: active
                        ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                        : 'var(--bg-primary)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {results.map((r, i) => (
            <TopicResultCard key={i} result={r} displayMode={displayMode} />
          ))}
        </div>
      )}
    </div>
  );
}
