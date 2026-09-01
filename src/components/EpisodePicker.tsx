'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281 §6-1: 📔 エピソード記録を「素材として選ぶ」共通部品
//
// 置く先: ①ペルソナ別note記事・②分割記事化（発信ハブ）・269 Kindle→note多軸展開（KindleRemixTab）。
// Kindleウィザードは①素材タブに「📔エピソード記録」が並ぶ（ep-N名前空間）ので、この部品は使わない。
//
// - **手動選択**のみ（自動サジェストはしない・§6-1）
// - 選んだ id を親へ返すだけ。本文はサーバ側が owner 検証つきで取得する（一覧本文非返却の流儀）
// - 記録が0件でも部品は消さず、📔エピソード記録への導線を出す（R-34：どこで書けるかが分かる）
// - 取得失敗は「選べない」だけで、生成そのものは妨げない（R-39）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';
import { EPISODE_SELECT_MAX, episodeDisplayTitle, type EpisodeRecord } from '@/lib/episodes';

interface EpisodePickerProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** 実行中などで触らせたくないとき */
  disabled?: boolean;
  /** data-属性の識別子（E2Eで置き場所ごとに判定する） */
  scope: string;
}

export default function EpisodePicker({ selectedIds, onChange, disabled, scope }: EpisodePickerProps) {
  const [items, setItems] = useState<EpisodeRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/episodes?limit=100');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items?: EpisodeRecord[] };
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: number) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((v) => v !== id));
      return;
    }
    if (selectedIds.length >= EPISODE_SELECT_MAX) return;
    onChange([...selectedIds, id]);
  };

  const count = selectedIds.length;

  return (
    <div
      data-episode-picker={scope}
      style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: 'var(--bg-primary)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-episode-picker-toggle
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, padding: 0 }}
        >
          {open ? '▼' : '▶'} 📔 自分のエピソードを素材にする
        </button>
        <span data-episode-picker-count style={{ fontSize: 11, color: count > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          {count > 0 ? `選択中: ${count}件` : '未選択（任意）'}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>記録どおりに使います（脚色しません・R-75）</span>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {status === 'loading' && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>読み込み中…</div>}
          {status === 'failed' && (
            <div data-episode-picker-error style={{ fontSize: 12, color: '#ef4444' }}>
              エピソード記録の一覧を取得できませんでした。エピソード無しでも生成できます。
            </div>
          )}
          {status === 'ready' && items.length === 0 && (
            <div data-episode-picker-empty style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              まだ記録がありません。
              <a href="/dashboard/episodes" style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>📔 エピソード記録で書く</a>
            </div>
          )}
          {status === 'ready' && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {items.map((ep) => {
                const checked = selectedIds.includes(ep.id);
                return (
                  <label
                    key={ep.id}
                    data-episode-picker-item={ep.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', padding: '4px 6px', borderRadius: 6, background: checked ? 'rgba(108,99,255,0.08)' : 'transparent' }}
                  >
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(ep.id)} style={{ marginTop: 2 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{episodeDisplayTitle(ep)}</span>
                      {ep.period && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{ep.period}</span>}
                      {ep.tags.length > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>#{ep.tags.join(' #')}</span>}
                    </span>
                  </label>
                );
              })}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>最大{EPISODE_SELECT_MAX}件</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
