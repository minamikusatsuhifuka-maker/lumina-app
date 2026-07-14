'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SavedAnalysisList, { AnalysisRecord } from '@/components/text-analysis/SavedAnalysisList';
import ContextLibraryPanel from '@/components/context-library/ContextLibraryPanel';
import ProofreadSavedList from '@/components/proofread/ProofreadSavedList';

type SubTab = 'text' | 'context' | 'proofread';

// 独立メニュー「保存一覧」。テキスト分析の保存物（text_analysis_saves）と
// コンテキストライブラリ（context_saves）、校正の前後比較（proofread_saves）を
// 1か所で行き来できるサブタブ構成。
// ※別テーブルのためサブタブ方式（spec §3-2）。既存コンポーネントを再利用（作り直さない）。
export default function SavedPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>読み込み中...</div>}
    >
      <SavedPageInner />
    </Suspense>
  );
}

function SavedPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams?.get('tab');
  const initialSub: SubTab =
    tabParam === 'context' || tabParam === 'proofread' ? tabParam : 'text';
  const [sub, setSub] = useState<SubTab>(initialSub);

  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  // 横断分析へ：選択を sessionStorage で受け渡し、テキスト分析の横断タブへ遷移
  // （横断分析は text-analysis ページに集約されているため。deepresearch handoff と同方式）
  const handleSelectForCross = (
    articles: { id: number; title: string; content: string; category?: string }[],
  ) => {
    try {
      sessionStorage.setItem('lumina_cross_selected', JSON.stringify(articles));
    } catch {}
    router.push('/dashboard/text-analysis?tab=cross');
  };

  const TABS: { key: SubTab; label: string }[] = [
    { key: 'text', label: '🗂 テキスト分析' },
    { key: 'context', label: '🧠 コンテキストライブラリ' },
    { key: 'proofread', label: '🔎 校正' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          🗃 保存一覧
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          保存したテキスト分析とコンテキストライブラリをまとめて管理できます
        </p>
      </div>

      {/* サブタブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => {
          const active = sub === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSub(t.key)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
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

      {/* テキスト分析の保存物（display:noneで状態維持） */}
      <div style={{ display: sub === 'text' ? 'block' : 'none' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
        ) : (
          <SavedAnalysisList
            records={records}
            onRecordsChange={setRecords}
            onSelectForCross={handleSelectForCross}
          />
        )}
      </div>

      {/* コンテキストライブラリ（既存パネルを再利用） */}
      <div style={{ display: sub === 'context' ? 'block' : 'none' }}>
        <ContextLibraryPanel />
      </div>

      {/* 校正の前後比較（proofread_saves・開くと赤/緑ハイライトで再現） */}
      {sub === 'proofread' && <ProofreadSavedList />}
    </div>
  );
}
