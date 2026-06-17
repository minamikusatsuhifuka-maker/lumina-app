'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  candidate_dates: unknown;
  finalized_date: string | null;
  created_at: string;
  participant_count: number;
  responded_count: number;
}

export const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '下書き', color: '#7878a0', bg: 'rgba(120,120,160,0.15)' },
  collecting: { label: '収集中', color: '#378ADD', bg: 'rgba(55,138,221,0.15)' },
  ready: { label: '確定待ち', color: '#EF9F27', bg: 'rgba(239,159,39,0.15)' },
  finalized: { label: '確定', color: '#1D9E75', bg: 'rgba(29,158,117,0.15)' },
  notified: { label: '通知済み', color: '#00d4b8', bg: 'rgba(0,212,184,0.15)' },
  cancelled: { label: '中止', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.draft;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>
      {s.label}
    </span>
  );
}

export default function SchedulingListPage() {
  const { showToast } = useToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // 作成フォーム
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'multi' | 'one_on_one'>('multi');
  const [dateInput, setDateInput] = useState('');
  const [candidateDates, setCandidateDates] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scheduling/events');
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const addDate = () => {
    if (!dateInput) return;
    setCandidateDates((prev) => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
    setDateInput('');
  };

  const create = async () => {
    if (!title.trim()) {
      showToast('タイトルを入力してください', 'warning');
      return;
    }
    if (candidateDates.length === 0) {
      showToast('候補日を1つ以上追加してください', 'warning');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/scheduling/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, type, candidate_dates: candidateDates }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '作成に失敗しました');
      }
      showToast('イベントを作成しました', 'success');
      setTitle('');
      setDescription('');
      setCandidateDates([]);
      setType('multi');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🗓️ 日程調整</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
        イベントを作成・公開し、参加者のNG日を集めて最適日を算出・確定します。
      </p>

      {/* 作成フォーム */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>新規イベント作成</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル（例: 院内ミーティング）" style={input} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="説明（任意）" rows={2} style={{ ...input, marginTop: 10, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {(['multi', 'one_on_one'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: type === t ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: type === t ? 'var(--accent-soft)' : 'var(--bg-primary)',
              color: type === t ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              {t === 'multi' ? '複数名で調整' : '1対1'}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>候補日（検討する日付）</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={addDate} style={btnSecondary}>追加</button>
          </div>
          {candidateDates.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {candidateDates.map((d) => (
                <span key={d} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16, background: 'var(--accent-soft)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {d}
                  <button onClick={() => setCandidateDates((prev) => prev.filter((x) => x !== d))} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <button onClick={create} disabled={creating} style={{ ...btnPrimary, marginTop: 14 }}>
          {creating ? '作成中...' : 'イベントを作成'}
        </button>
      </div>

      {/* 一覧 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>イベント一覧</div>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>読み込み中...</p>
        ) : events.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>まだイベントがありません。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((e) => (
              <Link key={e.id} href={`/dashboard/scheduling/${e.id}`} style={{ ...card, marginBottom: 0, textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{e.title}</div>
                  <StatusBadge status={e.status} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {e.type === 'one_on_one' ? '1対1' : '複数名'} ・ 参加 {e.participant_count}名 / 回答 {e.responded_count}名
                  {e.finalized_date && ` ・ 確定: ${String(e.finalized_date).slice(0, 10)}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16,
};
const input: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff', fontSize: 14, fontWeight: 700,
};
const btnSecondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
};
