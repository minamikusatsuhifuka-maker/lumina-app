'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Briefing {
  greeting: string;
  insights: string[];
  recommendedActions: { action: string; reason: string; href: string }[];
  focusTopic: string;
}

export function BriefingSection() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/briefing');
        if (res.ok) {
          const data = await res.json();
          setBriefing(data);
        }
      } catch {} finally {
        setLoading(false);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={{
        marginBottom: 20, padding: '16px 20px', borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card))',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>☀️ ブリーフィング生成中...</span>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div style={{
      marginBottom: 20, padding: '16px 20px', borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card))',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>☀️ 今日のAIブリーフィング</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{briefing.greeting}</p>

          {briefing.focusTopic && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              fontSize: 12, fontWeight: 600, marginBottom: 10,
            }}>
              🎯 今日のフォーカス：{briefing.focusTopic}
            </div>
          )}

          {briefing.insights && briefing.insights.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {briefing.insights.map((insight, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>💡 {insight}</p>
              ))}
            </div>
          )}

          {briefing.recommendedActions && briefing.recommendedActions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {briefing.recommendedActions.map((a, i) => (
                <Link key={i} href={a.href} style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', textDecoration: 'none',
                  transition: 'background 0.15s',
                }}>
                  → {a.action}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
