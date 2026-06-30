'use client';

import { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';

// ─── 型定義 ───
interface AuditItem {
  key: string;
  label: string;
  category: string;
  group: 'auto' | 'manual';
  status: 'pass' | 'warn' | 'fail' | 'todo' | 'na' | 'done';
  detail: string;
  advice: string;
}
interface Thresholds {
  minReviews: number;
  minRating: number;
  reviewFreshnessDays: number;
  minPhotos: number;
  postFreshnessDays: number;
  minReplyRate: number;
}
interface TodoEntry {
  label: string;
  advice: string;
  priority: 'high' | 'medium';
}
interface AuditResponse {
  place: {
    name: string;
    rating: number;
    totalReviews: number;
    address: string;
    phone: string;
    website: string;
    mapsUrl: string;
    openingHours: string[];
  };
  thresholds: Thresholds;
  auto: AuditItem[];
  manual: AuditItem[];
  score: { total: number; passed: number; counted: number };
  todos: TodoEntry[];
  error?: string;
}
interface AdCheck {
  status?: 'ok' | 'warn';
  findings?: string[];
}
interface PostDraft {
  style: string;
  text: string;
  ad_check?: AdCheck;
}
interface SavedDraft {
  id: number;
  theme: string | null;
  body: string;
  ad_check: AdCheck | null;
  created_at: string;
}
interface PostTheme {
  id: number;
  label: string;
  description: string | null;
  sort_order: number;
}

// ─── 表示ヘルパー ───
const STATUS_VIEW: Record<AuditItem['status'], { label: string; color: string; bg: string }> = {
  pass: { label: '◎ 達成', color: '#15803d', bg: '#dcfce7' },
  done: { label: '◎ 対応済み', color: '#15803d', bg: '#dcfce7' },
  warn: { label: '△ 要確認', color: '#b45309', bg: '#fef3c7' },
  fail: { label: '✕ 未達', color: '#b91c1c', bg: '#fee2e2' },
  todo: { label: '未対応', color: '#475569', bg: '#e2e8f0' },
  na: { label: '対象外', color: '#64748b', bg: '#f1f5f9' },
};

const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; step?: number }[] = [
  { key: 'minReviews', label: '口コミ件数の目標' },
  { key: 'minRating', label: '星評価の目標', step: 0.1 },
  { key: 'reviewFreshnessDays', label: '口コミ鮮度（日以内）' },
  { key: 'minPhotos', label: '写真枚数の目標' },
  { key: 'postFreshnessDays', label: '投稿頻度（日以内）' },
  { key: 'minReplyRate', label: '口コミ返信率（%）' },
];

const MANUAL_STATUS_OPTS: { value: AuditItem['status']; label: string }[] = [
  { value: 'todo', label: '未対応' },
  { value: 'done', label: '対応済み' },
  { value: 'na', label: '対象外' },
];

export default function MeoPage() {
  const [tab, setTab] = useState<'checker' | 'post'>('checker');

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>📍 MEO対策（Googleビジネスプロフィール）</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
        Googleマップ・ローカル集患の最適化。診断→やること→投稿まで。自動投稿はせず、院長確認のうえ手動で反映します。
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        <TabButton active={tab === 'checker'} onClick={() => setTab('checker')}>
          ① GBP最適化チェッカー
        </TabButton>
        <TabButton active={tab === 'post'} onClick={() => setTab('post')}>
          ② GBP投稿下書き
        </TabButton>
      </div>

      {tab === 'checker' ? <CheckerTab /> : <PostTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: 15,
        fontWeight: active ? 700 : 500,
        color: active ? '#0f766e' : '#64748b',
        borderBottom: active ? '2px solid #0f766e' : '2px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────── ① チェッカー ───────────────────────
function CheckerTab() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/meo/gbp-audit');
      const json: AuditResponse = await res.json();
      if (!res.ok) {
        setError(json.error || '診断の取得に失敗しました');
      } else {
        setData(json);
        setThresholds(json.thresholds);
      }
    } catch {
      setError('診断の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveThresholds = async () => {
    if (!thresholds) return;
    setSavingThresholds(true);
    try {
      await fetch('/api/meo/gbp-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds }),
      });
      await load();
    } finally {
      setSavingThresholds(false);
    }
  };

  const updateManual = async (itemKey: string, status: AuditItem['status'], note: string) => {
    // 楽観的更新
    setData((prev) =>
      prev
        ? { ...prev, manual: prev.manual.map((m) => (m.key === itemKey ? { ...m, status } : m)) }
        : prev,
    );
    await fetch('/api/meo/gbp-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemKey, status, note }),
    });
    await load();
  };

  if (loading) return <p style={{ color: '#64748b' }}>診断中…</p>;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      {/* 店舗サマリ＋スコア */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 320px' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{data.place.name}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{data.place.address}</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>
            ⭐ {data.place.rating.toFixed(1)}（{data.place.totalReviews}件） / ☎ {data.place.phone || '—'}
          </div>
          {data.place.mapsUrl && (
            <a href={data.place.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0f766e' }}>
              Googleマップで開く ↗
            </a>
          )}
        </div>
        <div style={{ ...card, width: 200, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>総合スコア</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor(data.score.total) }}>{data.score.total}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {data.score.passed}/{data.score.counted} 項目達成
          </div>
        </div>
      </div>

      {/* やることリスト */}
      {data.todos.length > 0 && (
        <div style={{ ...card, marginBottom: 20, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📝 やることリスト（優先順）</div>
          {data.todos.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'baseline' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: t.priority === 'high' ? '#b91c1c' : '#b45309',
                  minWidth: 36,
                }}
              >
                {t.priority === 'high' ? '優先' : '推奨'}
              </span>
              <span style={{ fontSize: 14 }}>
                <strong>{t.label}</strong>：{t.advice}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 自動診断 */}
      <SectionTitle>🤖 自動診断（Places APIから取得）</SectionTitle>
      {data.auto.map((it) => (
        <ItemRow key={it.key} item={it} />
      ))}

      {/* 手入力チェック */}
      <SectionTitle>✍️ 手入力チェック（GBP管理画面で確認）</SectionTitle>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: -6, marginBottom: 10 }}>
        ※ 写真枚数・カテゴリ・属性・投稿頻度・返信率は API で自動取得できないため、確認のうえ状態を記録してください。
      </p>
      {data.manual.map((it) => (
        <ManualRow key={it.key} item={it} onSave={updateManual} />
      ))}

      {/* しきい値編集 */}
      {thresholds && (
        <div style={{ ...card, marginTop: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>⚙️ 合否しきい値（編集可）</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {THRESHOLD_FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: 13, color: '#475569' }}>
                {f.label}
                <input
                  type="number"
                  step={f.step || 1}
                  value={thresholds[f.key]}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, [f.key]: Number(e.target.value) })
                  }
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
          <button onClick={saveThresholds} disabled={savingThresholds} style={primaryBtn}>
            {savingThresholds ? '保存中…' : 'しきい値を保存して再診断'}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: AuditItem }) {
  const v = STATUS_VIEW[item.status];
  return (
    <div style={{ ...card, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{item.label}</div>
        <span style={{ ...badge, color: v.color, background: v.bg }}>{v.label}</span>
      </div>
      <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{item.detail}</div>
      {item.status !== 'pass' && item.status !== 'done' && item.status !== 'na' && (
        <div style={{ fontSize: 12, color: '#0f766e', marginTop: 4 }}>💡 {item.advice}</div>
      )}
    </div>
  );
}

function ManualRow({
  item,
  onSave,
}: {
  item: AuditItem;
  onSave: (key: string, status: AuditItem['status'], note: string) => void;
}) {
  const v = STATUS_VIEW[item.status];
  // detail 末尾の「（メモ: ...）」から既存メモを復元
  const m = item.detail.match(/（メモ: (.*)）$/);
  const [note, setNote] = useState(m ? m[1] : '');
  return (
    <div style={{ ...card, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{item.label}</div>
        <span style={{ ...badge, color: v.color, background: v.bg }}>{v.label}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{item.detail.replace(/（メモ: .*）$/, '')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={item.status === 'pass' || item.status === 'warn' || item.status === 'fail' ? 'todo' : item.status}
          onChange={(e) => onSave(item.key, e.target.value as AuditItem['status'], note)}
          style={{ ...inputStyle, width: 'auto', marginTop: 0 }}
        >
          {MANUAL_STATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          placeholder="メモ（任意）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onSave(item.key, item.status === 'pass' || item.status === 'warn' || item.status === 'fail' ? 'todo' : item.status, note)}
          style={{ ...inputStyle, flex: 1, minWidth: 160, marginTop: 0 }}
        />
      </div>
      {item.status !== 'done' && item.status !== 'na' && (
        <div style={{ fontSize: 12, color: '#0f766e', marginTop: 6 }}>💡 {item.advice}</div>
      )}
    </div>
  );
}

// ─────────────────────── ② 投稿下書き ───────────────────────
function PostTab() {
  const [themes, setThemes] = useState<PostTheme[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState('');
  const [drafts, setDrafts] = useState<PostDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedDraft[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  const selectedTheme = themes.find((t) => t.id === selectedId) || null;

  const loadThemes = useCallback(async () => {
    try {
      const res = await fetch('/api/meo/gbp-themes');
      const json = await res.json();
      if (res.ok) {
        const list: PostTheme[] = json.themes || [];
        setThemes(list);
        setSelectedId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null));
      }
    } catch {
      /* noop */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/meo/gbp-post-drafts');
      const json = await res.json();
      if (res.ok) setHistory(json.drafts || []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadThemes();
    loadHistory();
  }, [loadThemes, loadHistory]);

  const generate = async () => {
    setLoading(true);
    setError('');
    setDrafts([]);
    try {
      const res = await fetch('/api/meo/gbp-post-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeLabel: selectedTheme?.label ?? '',
          themeDescription: selectedTheme?.description ?? '',
          details,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || '生成に失敗しました');
      else setDrafts(json.drafts || []);
    } catch {
      setError('生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const save = async (d: PostDraft) => {
    await fetch('/api/meo/gbp-post-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: selectedTheme?.label ?? null,
        body: d.text,
        adCheck: d.ad_check ?? null,
      }),
    });
    await loadHistory();
  };

  const remove = async (id: number) => {
    await fetch('/api/meo/gbp-post-drafts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadHistory();
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>投稿テーマ</label>
          <button onClick={() => setManageOpen((v) => !v)} style={{ ...smallBtn, padding: '4px 10px' }}>
            {manageOpen ? '閉じる' : 'テーマを編集'}
          </button>
        </div>
        <select
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          style={inputStyle}
        >
          {themes.length === 0 && <option value="">読み込み中…</option>}
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {selectedTheme?.description && (
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{selectedTheme.description}</p>
        )}

        {manageOpen && <ThemeManager themes={themes} onChange={loadThemes} />}

        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 12, display: 'block' }}>
          補足情報（任意）
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="例）8/12〜8/15は夏季休診。花粉飛散がピークなので早めの受診を促したい 等"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <button onClick={generate} disabled={loading || !selectedTheme} style={primaryBtn}>
          {loading ? '生成中…' : '投稿下書きを3案生成'}
        </button>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          ※ 自動投稿はしません。生成→医療広告チェックを確認→コピーしてGBPに手動投稿してください。
        </p>
      </div>

      {error && <ErrorBox message={error} onRetry={generate} />}

      {drafts.map((d, i) => (
        <div key={i} style={{ ...card, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{d.style || `案${i + 1}`}</span>
            <AdCheckBadge adCheck={d.ad_check} />
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>{d.text}</div>
          {d.ad_check?.status === 'warn' && d.ad_check.findings && d.ad_check.findings.length > 0 && (
            <ul style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>
              {d.ad_check.findings.map((f, j) => (
                <li key={j}>{f}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => copyToClipboard(d.text)} style={smallBtn}>
              コピー
            </button>
            <button onClick={() => save(d)} style={smallBtn}>
              履歴に保存
            </button>
          </div>
        </div>
      ))}

      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionTitle>🗂 保存した下書き</SectionTitle>
          {history.map((h) => (
            <div key={h.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  {h.theme || '—'} ・ {new Date(h.created_at).toLocaleString('ja-JP')}
                </span>
                <AdCheckBadge adCheck={h.ad_check ?? undefined} />
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 6, lineHeight: 1.7 }}>{h.body}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => copyToClipboard(h.body)} style={smallBtn}>
                  コピー
                </button>
                <button onClick={() => remove(h.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// テーマの追加・編集・削除（院長が編集可。ハードコードにしない）
function ThemeManager({ themes, onChange }: { themes: PostTheme[]; onChange: () => void }) {
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const upsert = async (payload: { id?: number; label: string; description: string }) => {
    if (!payload.label.trim()) return;
    await fetch('/api/meo/gbp-themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await onChange();
  };

  const remove = async (id: number) => {
    await fetch('/api/meo/gbp-themes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await onChange();
  };

  return (
    <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>テーマの管理</div>
      {themes.map((t) => (
        <ThemeRow key={t.id} theme={t} onSave={upsert} onDelete={remove} />
      ))}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #cbd5e1' }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>新しいテーマを追加</div>
        <input
          placeholder="テーマ名（例: 帯状疱疹の注意喚起）"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          style={{ ...inputStyle, marginTop: 0 }}
        />
        <input
          placeholder="説明（このテーマで何を伝えるか・任意）"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          style={inputStyle}
        />
        <button
          onClick={async () => {
            await upsert({ label: newLabel, description: newDesc });
            setNewLabel('');
            setNewDesc('');
          }}
          style={{ ...smallBtn, marginTop: 8 }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

function ThemeRow({
  theme,
  onSave,
  onDelete,
}: {
  theme: PostTheme;
  onSave: (p: { id: number; label: string; description: string }) => void;
  onDelete: (id: number) => void;
}) {
  const [label, setLabel] = useState(theme.label);
  const [desc, setDesc] = useState(theme.description ?? '');
  const dirty = label !== theme.label || desc !== (theme.description ?? '');
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: '1 1 160px' }} />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="説明（任意）"
        style={{ ...inputStyle, marginTop: 0, flex: '2 1 220px' }}
      />
      <button
        onClick={() => onSave({ id: theme.id, label, description: desc })}
        disabled={!dirty || !label.trim()}
        style={{ ...smallBtn, opacity: dirty && label.trim() ? 1 : 0.5 }}
      >
        保存
      </button>
      <button onClick={() => onDelete(theme.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
        削除
      </button>
    </div>
  );
}

function AdCheckBadge({ adCheck }: { adCheck?: AdCheck }) {
  if (!adCheck) return null;
  const warn = adCheck.status === 'warn';
  return (
    <span style={{ ...badge, color: warn ? '#b45309' : '#15803d', background: warn ? '#fef3c7' : '#dcfce7' }}>
      医療広告 {warn ? '△ 要確認' : '◎ OK'}
    </span>
  );
}

// ─── 共通パーツ・スタイル ───
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 10px' }}>{children}</h2>;
}
function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ ...card, background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c' }}>
      {message}
      <button onClick={onRetry} style={{ ...smallBtn, marginLeft: 12 }}>
        再試行
      </button>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 14,
};
const badge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  marginTop: 4,
  boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 18px',
  background: '#0f766e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};

function scoreColor(n: number): string {
  if (n >= 80) return '#15803d';
  if (n >= 50) return '#b45309';
  return '#b91c1c';
}
