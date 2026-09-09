'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ — 一覧（§3-2）
//
// - 一覧APIは本文を含まない軽い形（§4-3⑥）。名前は中央マスのタイトル（§3-5・空なら「（無題）」）
// - 更新日時は JST（R-86・lib/jst.ts）。埋まっているマス数は「5/9」
// - 削除は確認1回（R-56・mandalaDeleteConfirmMessage）。文言に埋まっているマス数とリンク済み件数を出す
// - 新規作成の二重発火は ref で閉じる（R-87）。作成できたらそのチャートへ移動する
// - 308: 「＋ 新しいマンダラ」の隣に型の選択（既定＝空のマンダラ・不変）。「有料note記事の型」は作成時にだけ適用。
//   カードに「📈 n」（反応記録のあるマス数・一覧APIの軽い形）。0件なら出さない（§7）
// - AI 不使用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { jstDateTimeString } from '@/lib/jst';
import {
  MANDALA_DEPTH1_COUNT,
  chartDisplayTitle,
  mandalaDeleteConfirmMessage,
  type MandalaChartSummary,
} from '@/lib/mandala-shared';
import { MANDALA_PRESETS, MANDALA_PRESET_KEYS, isMandalaPresetKey, type MandalaPresetKey } from '@/lib/mandala-presets';

const ACCENT = '#6c63ff';

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};
const btn: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export default function MandalaListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<MandalaChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false); // R-87
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 308 §2-2: 作成時の型。'' ＝空のマンダラ（既定・不変）
  const [newPreset, setNewPreset] = useState<'' | MandalaPresetKey>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mandala', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { items?: MandalaChartSummary[]; error?: string };
      if (!res.ok || !Array.isArray(json.items)) throw new Error(json.error || `一覧の取得に失敗しました（${res.status}）`);
      setItems(json.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (creatingRef.current) return; // R-87: 同期的に閉じる
    creatingRef.current = true;
    setCreating(true);
    try {
      // 308: 型を選んだときだけ body を送る（既定は従来どおり body なし＝空のマンダラ・R-88）
      const res = await fetch(
        '/api/mandala',
        newPreset ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: newPreset }) } : { method: 'POST' },
      );
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error || `作成に失敗しました（${res.status}）`);
      router.push(`/dashboard/mandala/${json.id}`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '作成に失敗しました', 'error');
      creatingRef.current = false;
      setCreating(false);
    }
    // 成功時は遷移するので解放しない（戻ってきたときは再マウント＝初期値に戻る）
  };

  const remove = async (item: MandalaChartSummary) => {
    // R-56: 確認はこの1回だけ。件数（埋まっているマス・リンク）を明示する
    if (!window.confirm(mandalaDeleteConfirmMessage(item.title, item.filled_count, item.link_count, item.child_count))) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/mandala?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `削除に失敗しました（${res.status}）`);
      showToast(`「${chartDisplayTitle(item.title)}」を削除しました`, 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🔲 マンダラ</h1>
        <span style={{ flex: 1 }} />
        {/* 308 §2-2: 型の選択（既定＝空のマンダラ）。ボタンの挙動は選択に従う */}
        <select
          data-mandala-new-preset
          value={newPreset}
          onChange={(e) => setNewPreset(isMandalaPresetKey(e.target.value) ? e.target.value : '')}
          title={newPreset ? MANDALA_PRESETS[newPreset].description : '空の9マスで作成します'}
          style={{ ...btn, padding: '6px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">空のマンダラ（既定）</option>
          {MANDALA_PRESET_KEYS.map((k) => (
            <option key={k} value={k}>
              {MANDALA_PRESETS[k].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-mandala-new
          onClick={() => void create()}
          disabled={creating}
          style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff', opacity: creating ? 0.6 : 1 }}
        >
          {creating ? '⏳ 作成中…' : '＋ 新しいマンダラ'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
        中央にテーマ、周囲の8マスに展開して思考を整理します。マスを押すと長文を書けて、全画面で読み書きできます。
        中央マスのタイトルがそのままマンダラの名前になります。
      </p>

      {error && (
        <div data-mandala-list-error style={{ ...card, borderColor: '#B91C1C', color: '#B91C1C', marginBottom: 12 }}>
          ⚠️ {error}
          <div>
            <button type="button" onClick={() => void load()} style={btn}>
              再試行
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>読み込み中…</div>
      ) : items.length === 0 ? (
        <div data-mandala-list-empty style={{ ...card, alignItems: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
          まだマンダラがありません。「＋ 新しいマンダラ」から作成してください。
        </div>
      ) : (
        <div data-mandala-list style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {items.map((item) => {
            const title = chartDisplayTitle(item.title);
            return (
              <div key={item.id} data-mandala-card={item.id} style={card}>
                {/* 読む領域＝そのままチャートへのリンク（操作ボタンは外側・R-81） */}
                <Link
                  href={`/dashboard/mandala/${item.id}`}
                  data-mandala-open={item.id}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
                >
                  <div
                    data-mandala-card-title
                    title={title}
                    style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: item.title.trim() ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  >
                    {title}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span
                      data-mandala-filled={item.filled_count}
                      title="埋まっているマス数"
                      style={{ fontWeight: 700, color: item.filled_count > 0 ? ACCENT : 'var(--text-muted)' }}
                    >
                      {item.filled_count}/{MANDALA_DEPTH1_COUNT} マス
                    </span>
                    <span data-mandala-links={item.link_count} title="関連記事・エピソードのリンク件数">
                      🔗 {item.link_count}件
                    </span>
                    {/* 302 §5: 一次情報あり n/m（一覧APIが軽い形のまま数えて返す） */}
                    {/* 308 §3-3: 反応記録のあるマス数（0件なら出さない） */}
                    {item.reaction_count > 0 && (
                      <span data-mandala-reactions={item.reaction_count} title="反応記録（アクセス・スキ・共有・購入）があるマス数" style={{ color: '#1D9E75', fontWeight: 700 }}>
                        📈 {item.reaction_count}
                      </span>
                    )}
                    {item.preset && (
                      <span data-mandala-card-preset={item.preset} title="作成時の型" style={{ color: 'var(--text-muted)' }}>
                        {isMandalaPresetKey(item.preset) ? MANDALA_PRESETS[item.preset].label : item.preset}
                      </span>
                    )}
                    <span
                      data-mandala-primary={item.primary_count}
                      data-mandala-primary-total={item.filled_count}
                      title="一次情報（📔エピソード記録）のリンクが1件以上あるマス数／埋まっているマス数"
                      style={{ color: item.primary_count > 0 ? '#B45309' : 'var(--text-muted)' }}
                    >
                      📔 {item.primary_count}/{item.filled_count}
                    </span>
                  </div>
                  <div data-mandala-updated style={{ fontSize: 11, color: 'var(--text-muted)' }} title="更新日時（日本時間）">
                    更新 {jstDateTimeString(item.updated_at)}
                  </div>
                </Link>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Link href={`/dashboard/mandala/${item.id}`} style={{ ...btn, textDecoration: 'none', borderColor: ACCENT, color: ACCENT }}>
                    開く
                  </Link>
                  <button
                    type="button"
                    data-mandala-delete={item.id}
                    onClick={() => void remove(item)}
                    disabled={deletingId === item.id}
                    title="削除（元に戻せません）"
                    style={{ ...btn, color: '#B91C1C', opacity: deletingId === item.id ? 0.5 : 1 }}
                  >
                    🗑 削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
