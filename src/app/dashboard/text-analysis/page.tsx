'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TextAnalysisPanel from '@/components/text-analysis/TextAnalysisPanel';
import SavedAnalysisList from '@/components/text-analysis/SavedAnalysisList';
import CrossAnalysisPanel, {
  CrossArticle,
} from '@/components/text-analysis/CrossAnalysisPanel';
import UrlBatchAnalysisPanel from '@/components/text-analysis/UrlBatchAnalysisPanel';
import NoteBundleDock from '@/components/note-bundle/NoteBundleDock';

type TabType = 'analyze' | 'saved' | 'cross' | 'url';

// 332【C】: 狭幅では出さず `title` に載せる（文言はここが唯一の正）
const PAGE_DESCRIPTION = 'テキストを複数の観点で同時に分析・保存・カテゴリ管理ができます';

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
  // 194: 一覧のフェッチは SavedAnalysisList が自律で行う（本文非返却＋30件ページング）。
  // ページ側は「全件数（タブバッジ用）」と「再読込トリガ」だけを持つ
  const [savedTotal, setSavedTotal] = useState(0);
  const [savedReloadKey, setSavedReloadKey] = useState(0);
  const [tab, setTab] = useState<TabType>(initialTab);
  const [crossSelected, setCrossSelected] = useState<CrossArticle[]>([]);
  const [highlightArticleId, setHighlightArticleId] = useState<number | null>(null);
  // ディープリサーチからの引き継ぎテキスト
  const [initialText, setInitialText] = useState('');
  const [initialTopic, setInitialTopic] = useState('');
  // 311: マンダラからの発注（保存時に保存APIがマスへ紐づける付帯情報）
  const [initialMandala, setInitialMandala] = useState<Record<string, unknown> | null>(null);

  const handleViewArticle = (articleId: number) => {
    setHighlightArticleId(articleId);
    setTab('saved');
    setTimeout(() => {
      const el = document.getElementById(`article-${articleId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  // 194: 保存後の一覧更新は reloadKey で SavedAnalysisList に1ページ目から取り直させる
  const reloadRecords = () => setSavedReloadKey((k) => k + 1);

  // ディープリサーチからの引き継ぎを確認しsessionStorageから自動読み込み
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from');
    const fromDeepResearch = from === 'deepresearch';
    // 311: マンダラからの発注も同じ handoff（sessionStorage）。付帯情報 mandala を保存APIへ渡す
    const fromMandala = from === 'mandala';
    if (!fromDeepResearch && !fromMandala) return;

    const savedText = sessionStorage.getItem('textAnalysisInput');
    const savedTopic = sessionStorage.getItem('textAnalysisTopic');
    const savedMandala = sessionStorage.getItem('textAnalysisMandala');

    if (savedText) {
      setInitialText(savedText);
      setInitialTopic(savedTopic ?? '');
      if (fromMandala && savedMandala) {
        try {
          setInitialMandala(JSON.parse(savedMandala) as Record<string, unknown>);
        } catch {
          setInitialMandala(null);
        }
      }
      // 使用済みのsessionStorageをクリア
      sessionStorage.removeItem('textAnalysisInput');
      sessionStorage.removeItem('textAnalysisTopic');
      sessionStorage.removeItem('textAnalysisMandala');
      // 分析実行タブを表示
      setTab('analyze');
      // 通知（読み込み完了）
      setTimeout(() => {
        alert(
          fromMandala
            ? '✅ マンダラの発注文を読み込みました。\n分析タイプを選択して「分析実行」ボタンを押してください。保存すると元のマスに自動で紐づきます。'
            : '✅ ディープリサーチの結果を読み込みました。\n分析タイプを選択して「分析実行」ボタンを押してください。',
        );
      }, 500);
    }
  }, []);

  // 保存一覧メニュー（/dashboard/saved）からの横断分析選択を受け取る（sessionStorage handoff）。
  // 214案④: 本ページ滞在中にnote選択カートのモーダルから渡されるケース（同一ルートへの
  // router.push＝再マウントされない）にも対応するため、マウント時だけでなく
  // クエリ変化（?tab=cross）でも再読込する（キーは読み取り後に削除＝再実行しても冪等）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('lumina_cross_selected');
      if (raw) {
        const arr = JSON.parse(raw);
        sessionStorage.removeItem('lumina_cross_selected');
        if (Array.isArray(arr) && arr.length > 0) {
          setCrossSelected(arr as CrossArticle[]);
          setTab('cross');
        }
      }
    } catch {}
  }, [searchParams]);

  // 194: 保存直後は一覧を1ページ目から取り直す（created_at DESC のため新規保存が先頭に来る）
  const handleSaved = () => reloadRecords();

  return (
    <div data-ta-page>
      {/* 332【C】: 上部の整理。タイトルと説明を1行にまとめ、狭幅では説明を省いて `title` に逃がす
          （省略の判断は画面幅なので CSS 側に置く・R-131。全文は300の即時ツールチップが出す・R-110）。
          🔤文字サイズ・☀️テーマ・🔔通知・モデル切替は共通ヘッダ（dashboard/layout.tsx）で、本便では触らない */}
      <style>{`
        .ta-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin-bottom: 8px; }
        .ta-head h1 { font-size: 17px; font-weight: 700; line-height: 1.2; margin: 0; color: var(--text-primary); white-space: nowrap; }
        .ta-head-desc { margin: 0; font-size: 12px; line-height: 1.2; color: var(--text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* 狭幅では説明を出さない（タイトルの title に同じ文言が入っている） */
        @media (max-width: 720px) { .ta-head-desc { display: none; } }
        /* タブは折り返さず横スクロール（折り返すと帯が倍になり、上部がまた伸びる） */
        .ta-tabs { display: flex; gap: 4px; margin-bottom: 8px; border-bottom: 1px solid var(--border); flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
        .ta-tabs::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="ta-head" title={PAGE_DESCRIPTION}>
        <h1>📝 テキスト分析・カテゴライズ</h1>
        <p className="ta-head-desc">{PAGE_DESCRIPTION}</p>
      </div>

      {/* タブ */}
      <div className="ta-tabs" data-ta-tabs>
        {[
          { key: 'analyze' as const, label: '🚀 分析実行', count: undefined, color: 'var(--accent)' },
          { key: 'saved' as const, label: '🗂 保存一覧', count: savedTotal, color: 'var(--accent)' },
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
                // 332【C】: 高さを詰める（上下の余白と文字を1段小さく）。並び・文言・色は不変
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? t.color : 'transparent'}`,
                color: active ? t.color : 'var(--text-muted)',
                fontSize: 12,
                lineHeight: 1.3,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                marginBottom: -1,
                flexShrink: 0,
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
          mandala={initialMandala}
          onInitialTextConsumed={() => {
            setInitialText('');
            setInitialTopic('');
          }}
        />
      </div>
      <div style={{ display: tab === 'saved' ? 'block' : 'none' }}>
        <SavedAnalysisList
          onSelectForCross={(articles) => {
            setCrossSelected(articles);
            setTab('cross');
          }}
          highlightId={highlightArticleId}
          onHighlightClear={() => setHighlightArticleId(null)}
          onAllTotalChange={setSavedTotal}
          reloadKey={savedReloadKey}
        />
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

      {/* note記事まとめの選択中バー＋生成モーダル（180）。タブコンテナの外に1回だけマウント */}
      <NoteBundleDock />
    </div>
  );
}
