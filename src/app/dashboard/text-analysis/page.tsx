'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TextAnalysisPanel from '@/components/text-analysis/TextAnalysisPanel';
import SavedAnalysisList, {
  AnalysisRecord,
} from '@/components/text-analysis/SavedAnalysisList';
import CrossAnalysisPanel, {
  CrossArticle,
} from '@/components/text-analysis/CrossAnalysisPanel';
import UrlBatchAnalysisPanel from '@/components/text-analysis/UrlBatchAnalysisPanel';

type TabType = 'analyze' | 'saved' | 'cross' | 'url';

export default function TextAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      }
    >
      <TextAnalysisPageInner />
    </Suspense>
  );
}

function TextAnalysisPageInner() {
  const searchParams = useSearchParams();
  // クエリパラメータ ?tab=saved 等から初期タブを取得（不正値はanalyzeにフォールバック）
  const initialTab: TabType = (() => {
    const t = searchParams?.get('tab');
    if (t === 'saved' || t === 'analyze' || t === 'cross' || t === 'url') {
      return t;
    }
    return 'analyze';
  })();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>(initialTab);
  const [crossSelected, setCrossSelected] = useState<CrossArticle[]>([]);
  const [highlightArticleId, setHighlightArticleId] = useState<number | null>(null);
  // ディープリサーチからの引き継ぎテキスト
  const [initialText, setInitialText] = useState('');
  const [initialTopic, setInitialTopic] = useState('');

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

  // ディープリサーチからの引き継ぎを確認しsessionStorageから自動読み込み
  useEffect(() => {
    const fromDeepResearch =
      new URLSearchParams(window.location.search).get('from') === 'deepresearch';
    if (!fromDeepResearch) return;

    const savedText = sessionStorage.getItem('textAnalysisInput');
    const savedTopic = sessionStorage.getItem('textAnalysisTopic');

    if (savedText) {
      setInitialText(savedText);
      setInitialTopic(savedTopic ?? '');
      // 使用済みのsessionStorageをクリア
      sessionStorage.removeItem('textAnalysisInput');
      sessionStorage.removeItem('textAnalysisTopic');
      // 分析実行タブを表示
      setTab('analyze');
      // 通知（読み込み完了）
      setTimeout(() => {
        alert(
          '✅ ディープリサーチの結果を読み込みました。\n分析タイプを選択して「分析実行」ボタンを押してください。',
        );
      }, 500);
    }
  }, []);

  const handleSaved = (saved: AnalysisRecord) => {
    // POST応答は RETURNING * で input_text 本体を含む。一覧stateには本体を持たず
    // has_input/文字数だけ持たせて、展開時に単体取得する方式（一覧APIと整合）。
    const { input_text, ...rest } = saved as AnalysisRecord & {
      input_text?: string | null;
    };
    const normalized: AnalysisRecord = {
      ...rest,
      has_input: !!input_text,
      input_char_count: input_text ? input_text.length : 0,
    };
    setRecords((prev) => [normalized, ...prev]);
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
          { key: 'url' as const, label: '🌐 URL一括分析', count: undefined, color: '#16a34a' },
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
        <TextAnalysisPanel
          onSaved={handleSaved}
          initialText={initialText}
          initialTopic={initialTopic}
          onInitialTextConsumed={() => {
            setInitialText('');
            setInitialTopic('');
          }}
        />
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
      <div style={{ display: tab === 'url' ? 'block' : 'none' }}>
        <UrlBatchAnalysisPanel />
      </div>
    </div>
  );
}
