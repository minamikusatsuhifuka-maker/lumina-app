'use client';

import { useEffect, useState } from 'react';

interface StudioProgress {
  business: { totalProjects: number; activeProjects: number };
  hr: { totalMembers: number };
  medical: { totalDocs: number; drafts: number };
  kindle: { totalBooks: number };
  research: {
    savedItems: number;
    knowledgeNodes: number;
    glossaryTerms: number;
  };
}

export default function StudioProgressCards() {
  const [studioProgress, setStudioProgress] = useState<StudioProgress | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/progress');
        if (!res.ok) return;
        const data = (await res.json()) as StudioProgress;
        if (!cancelled) setStudioProgress(data);
      } catch {
        /* skip */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!studioProgress) return null;

  const cards = [
    {
      href: '/dashboard/business-studio',
      icon: '💰',
      value: studioProgress.business.totalProjects,
      label: '収益化プロジェクト',
      color: '#4f46e5',
      bgColor: 'rgba(79,70,229,0.04)',
      borderColor: 'rgba(79,70,229,0.2)',
      sub:
        studioProgress.business.activeProjects > 0
          ? `${studioProgress.business.activeProjects}件進行中`
          : null,
    },
    {
      href: '/dashboard/hr-studio',
      icon: '🌱',
      value: studioProgress.hr.totalMembers,
      label: '育成メンバー',
      color: '#059669',
      bgColor: 'rgba(5,150,105,0.04)',
      borderColor: 'rgba(5,150,105,0.2)',
      sub: null,
    },
    {
      href: '/dashboard/medical-studio',
      icon: '🏥',
      value: studioProgress.medical.totalDocs,
      label: '作成した文書',
      color: '#dc2626',
      bgColor: 'rgba(220,38,38,0.04)',
      borderColor: 'rgba(220,38,38,0.2)',
      sub:
        studioProgress.medical.drafts > 0
          ? `${studioProgress.medical.drafts}件下書き`
          : null,
    },
    {
      href: '/dashboard/text-analysis',
      icon: '📝',
      value: studioProgress.research.savedItems,
      label: 'テキスト分析保存数',
      color: '#d97706',
      bgColor: 'rgba(217,119,6,0.04)',
      borderColor: 'rgba(217,119,6,0.2)',
      sub: null,
    },
    {
      href: '/dashboard/knowledge-tree',
      icon: '🌳',
      value: studioProgress.research.knowledgeNodes,
      label: '知識ノード',
      color: '#10b981',
      bgColor: 'rgba(16,185,129,0.04)',
      borderColor: 'rgba(16,185,129,0.2)',
      sub: null,
    },
    {
      href: '/dashboard/research-glossary',
      icon: '📚',
      value: studioProgress.research.glossaryTerms,
      label: '習得した用語',
      color: '#8b5cf6',
      bgColor: 'rgba(139,92,246,0.04)',
      borderColor: 'rgba(139,92,246,0.2)',
      sub: null,
    },
  ];

  return (
    <div style={{ marginTop: 16, marginBottom: 28 }}>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 10,
        }}
      >
        🚀 スタジオ進捗
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <a
            key={c.href + c.label}
            href={c.href}
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: `1px solid ${c.borderColor}`,
                background: c.bgColor,
                cursor: 'pointer',
                transition: 'border-color 0.2s, transform 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = c.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  c.borderColor;
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: c.color,
                }}
              >
                {c.value.toLocaleString()}
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              >
                {c.label}
              </div>
              {c.sub && (
                <div
                  style={{
                    fontSize: 11,
                    color: c.color,
                    marginTop: 4,
                  }}
                >
                  {c.sub}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
