'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '下書き', color: '#7878a0', bg: 'rgba(120,120,160,0.15)' },
  collecting: { label: '収集中', color: '#378ADD', bg: 'rgba(55,138,221,0.15)' },
  ready: { label: '確定待ち', color: '#EF9F27', bg: 'rgba(239,159,39,0.15)' },
  finalized: { label: '確定', color: '#1D9E75', bg: 'rgba(29,158,117,0.15)' },
  notified: { label: '通知済み', color: '#00d4b8', bg: 'rgba(0,212,184,0.15)' },
  cancelled: { label: '中止', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

interface RankedDay { date: string; availableCount: number; ngCount: number; rank: number; reason: string }
interface ComputeResult { verifiedCount: number; summary: string; aiUsed: boolean; ranked: RankedDay[]; allAvailable: string[] }
interface TimeSlot { start: string; end: string }
interface Participant { id: number; email: string; email_verified_at: string | null; responded_at: string | null; ng_dates: string[]; selected_slot: TimeSlot | null }
interface EventDetail {
  id: string; title: string; description: string | null; type: string; status: string;
  candidate_dates: string[]; time_slots: TimeSlot[]; finalized_date: string | null; compute_result: ComputeResult | null;
}

function slotText(s: TimeSlot): string {
  return `${s.start.replace('T', ' ')}〜${s.end.split('T')[1]}`;
}

export default function SchedulingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { showToast } = useToast();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ngSummary, setNgSummary] = useState<{ ng_date: string; ng_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notifyResult, setNotifyResult] = useState<{ sent: number; failed: number; recipients: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scheduling/events/${id}`);
      if (!res.ok) {
        showToast('イベントが見つかりません', 'error');
        return;
      }
      const data = await res.json();
      setEvent(data.event);
      setParticipants(Array.isArray(data.participants) ? data.participants : []);
      setNgSummary(Array.isArray(data.ngSummary) ? data.ngSummary : []);
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/scheduling/${id}` : `/scheduling/${id}`;

  const act = async (path: string, body?: Record<string, unknown>, label?: string) => {
    setBusy(label || path);
    try {
      const res = await fetch(`/api/scheduling/events/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || '処理に失敗しました', 'error');
        return null;
      }
      return data;
    } finally {
      setBusy('');
    }
  };

  const publish = async () => {
    const r = await act('publish');
    if (r) {
      showToast('公開しました。URLを参加者に共有してください', 'success');
      load();
    }
  };
  const compute = async () => {
    const r = await act('compute');
    if (r) {
      showToast(r.aiUsed ? 'AIが候補をランク付けしました' : '候補を算出しました', 'success');
      load();
    }
  };
  const finalize = async (date: string) => {
    const r = await act('finalize', { date }, `finalize:${date}`);
    if (r) {
      setNotifyResult({ sent: r.sent, failed: r.failed, recipients: r.recipients });
      showToast(`確定しました（送信 ${r.sent}/${r.recipients}名）`, 'success');
      load();
    }
  };
  const finalizeSlot = async (slotStart: string) => {
    const r = await act('finalize', { slotStart }, `finalize:${slotStart}`);
    if (r) {
      setNotifyResult({ sent: r.sent, failed: r.failed, recipients: r.recipients });
      showToast(`確定しました（送信 ${r.sent}/${r.recipients}名）`, 'success');
      load();
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      showToast('公開URLをコピーしました', 'success');
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  };

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>読み込み中...</p>;
  if (!event) return <p style={{ color: 'var(--text-muted)' }}>イベントが見つかりません。</p>;

  const s = STATUS[event.status] ?? STATUS.draft;
  const respondedCount = participants.filter((p) => p.responded_at).length;
  const result = event.compute_result;

  return (
    <div>
      <Link href="/dashboard/scheduling" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>← 一覧へ戻る</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{event.title}</h1>
        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>{s.label}</span>
      </div>
      {event.description && <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{event.description}</p>}

      {/* 公開（draft）or 公開URL */}
      <div style={card}>
        {event.status === 'draft' ? (
          <div>
            <div style={sectionTitle}>公開</div>
            {event.type === 'one_on_one' && (event.time_slots ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {event.time_slots.map((s) => (
                  <span key={s.start} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16, background: 'var(--accent-soft)', color: 'var(--text-primary)' }}>{slotText(s)}</span>
                ))}
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              {event.type === 'one_on_one'
                ? '公開すると相手が時間枠を選べるようになります（status: 収集中）。'
                : '公開すると参加者がNG日を回答できるようになります（status: 収集中）。'}
            </p>
            <button onClick={publish} disabled={busy === 'publish'} style={btnPrimary}>
              {busy === 'publish' ? '公開中...' : 'このイベントを公開する'}
            </button>
          </div>
        ) : (
          <div>
            <div style={sectionTitle}>公開URL</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input readOnly value={publicUrl} style={{ ...input, flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
              <button onClick={copyUrl} style={btnSecondary}>📋 コピー</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>このURLを参加者に共有してください。</p>
          </div>
        )}
      </div>

      {/* 回答状況 */}
      {event.status !== 'draft' && (
        <div style={card}>
          <div style={sectionTitle}>回答状況</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
            参加者 {participants.length}名 / 回答済み {respondedCount}名（本人確認済み {participants.filter((p) => p.email_verified_at).length}名）
          </div>
          {ngSummary.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ngSummary.map((n) => (
                <span key={n.ng_date} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  {String(n.ng_date).slice(0, 10)}: NG {n.ng_count}名
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1対1: 時間枠と選択状況（collecting）*/}
      {event.type === 'one_on_one' && event.status === 'collecting' && (
        <div style={card}>
          <div style={sectionTitle}>面談枠の確定</div>
          {(() => {
            const selectedStarts = new Set(
              participants.map((p) => p.selected_slot?.start).filter(Boolean) as string[]
            );
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(event.time_slots ?? []).map((s) => {
                  const chosen = selectedStarts.has(s.start);
                  return (
                    <div key={s.start} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{slotText(s)}</span>
                        {chosen && <span style={{ fontSize: 12, color: '#6c63ff', marginLeft: 8 }}>← 相手が選択</span>}
                      </div>
                      <button onClick={() => finalizeSlot(s.start)} disabled={busy === `finalize:${s.start}`} style={btnConfirm}>
                        {busy === `finalize:${s.start}` ? '確定中...' : 'この枠で確定'}
                      </button>
                    </div>
                  );
                })}
                {(event.time_slots ?? []).length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>枠がありません。</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* 算出（collecting・複数名のみ）*/}
      {event.type === 'multi' && event.status === 'collecting' && (
        <div style={card}>
          <div style={sectionTitle}>最適日の算出</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>集まったNG日から、全員が参加できる候補日を算出します。</p>
          <button onClick={compute} disabled={busy === 'compute'} style={btnPrimary}>
            {busy === 'compute' ? '算出中...' : '🤖 最適日を算出する'}
          </button>
        </div>
      )}

      {/* 候補・確定（ready）*/}
      {event.status === 'ready' && result && (
        <div style={card}>
          <div style={sectionTitle}>候補日（参加可能順）</div>
          {result.summary && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{result.summary}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.ranked.map((r) => (
              <div key={r.date} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{r.date}</span>
                    <span style={{ fontSize: 12, color: r.ngCount === 0 ? '#1D9E75' : 'var(--text-muted)', marginLeft: 8 }}>
                      参加可能 {r.availableCount}/{result.verifiedCount}名{r.ngCount === 0 ? '（全員可）' : `（NG ${r.ngCount}名）`}
                    </span>
                  </div>
                  <button onClick={() => finalize(r.date)} disabled={busy === `finalize:${r.date}`} style={btnConfirm}>
                    {busy === `finalize:${r.date}` ? '確定中...' : 'この日で確定'}
                  </button>
                </div>
                {r.reason && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{r.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 確定済み（finalized/notified）*/}
      {(event.status === 'finalized' || event.status === 'notified') && (
        <div style={card}>
          <div style={sectionTitle}>確定</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1D9E75' }}>📅 {event.finalized_date ? String(event.finalized_date).slice(0, 10) : '—'} に確定</p>
          {notifyResult && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
              確定メール送信: {notifyResult.sent}/{notifyResult.recipients}名{notifyResult.failed > 0 && `（失敗 ${notifyResult.failed}名）`}
            </p>
          )}
          {event.status === 'notified' && !notifyResult && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>全参加者に確定メールを送信済みです。</p>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 10 };
const input: React.CSSProperties = { padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff', fontSize: 14, fontWeight: 700 };
const btnSecondary: React.CSSProperties = { padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' };
const btnConfirm: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' };
