'use client';

import { useEffect, useState } from 'react';
import TextAnalysisPanel from '@/components/text-analysis/TextAnalysisPanel';
import SavedAnalysisList, {
  AnalysisRecord,
} from '@/components/text-analysis/SavedAnalysisList';
import CrossAnalysisPanel, {
  CrossArticle,
} from '@/components/text-analysis/CrossAnalysisPanel';

type TabType = 'analyze' | 'saved' | 'cross';

export default function TextAnalysisPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>('analyze');
  const [crossSelected, setCrossSelected] = useState<CrossArticle[]>([]);
  const [highlightArticleId, setHighlightArticleId] = useState<number | null>(null);

  const handleViewArticle = (articleId: number) => {
    setHighlightArticleId(articleId);
    setTab('saved');
    setTimeout(() => {
      const el = document.getElementById(`article-${articleId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const reloadRecords = async () => {
    try {
      const res = await fetch('/api/text-analysis/saves');
      if (res.ok) {
        const data = await res.json();
        setRecords(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/text-analysis/saves');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setRecords(Array.isArray(data) ? data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaved = (saved: AnalysisRecord) => {
    setRecords((prev) => [saved, ...prev]);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 4,
          }}
        >
          📝 テキスト分析・カテゴライズ
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          テキストを複数の観点で同時に分析・保存・カテゴリ管理ができます
        </p>
      </div>

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {[
          { key: 'analyze' as const, label: '🚀 分析実行', count: undefined, color: 'var(--accent)' },
          { key: 'saved' as const, label: '🗂 保存一覧', count: records.length, color: 'var(--accent)' },
          { key: 'cross' as const, label: '🔀 横断分析', count: undefined, color: '#9333ea' },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
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
              {typeof t.count === 'number' && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  ({t.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* display:noneで状態を維持しつつ切り替え */}
      <div style={{ display: tab === 'analyze' ? 'block' : 'none' }}>
        <TextAnalysisPanel onSaved={handleSaved} />
      </div>
      <div style={{ display: tab === 'saved' ? 'block' : 'none' }}>
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--text-muted)',
            }}
          >
            読み込み中...
          </div>
        ) : (
          <SavedAnalysisList
            records={records}
            onRecordsChange={setRecords}
            onSelectForCross={(articles) => {
              setCrossSelected(articles);
              setTab('cross');
            }}
            highlightId={highlightArticleId}
            onHighlightClear={() => setHighlightArticleId(null)}
          />
        )}
      </div>
      <div style={{ display: tab === 'cross' ? 'block' : 'none' }}>
        <CrossAnalysisPanel
          selectedArticles={crossSelected}
          onArticlesChange={setCrossSelected}
          onSaved={reloadRecords}
          onJumpToSaves={() => setTab('saved')}
          onViewArticle={handleViewArticle}
        />
      </div>
    </div>
  );
}
