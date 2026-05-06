'use client';

import { useEffect, useState } from 'react';
import TextAnalysisPanel from '@/components/text-analysis/TextAnalysisPanel';
import SavedAnalysisList, {
  AnalysisRecord,
} from '@/components/text-analysis/SavedAnalysisList';

export default function TextAnalysisPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'analyze' | 'saved'>('analyze');

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
          { key: 'analyze' as const, label: '🚀 分析実行', count: undefined },
          {
            key: 'saved' as const,
            label: '💾 保存一覧',
            count: records.length,
          },
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
                borderBottom: `2px solid ${
                  active ? 'var(--accent)' : 'transparent'
                }`,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
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

      {tab === 'analyze' ? (
        <TextAnalysisPanel onSaved={handleSaved} />
      ) : loading ? (
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
        <SavedAnalysisList records={records} onRecordsChange={setRecords} />
      )}
    </div>
  );
}
