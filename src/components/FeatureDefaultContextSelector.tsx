'use client';

import { useEffect, useState } from 'react';

// 機能別デフォルト背景情報セレクタ
// コンテキストライブラリの各カードに置く「📌 デフォルト設定」ボタン＋ドロップダウン
// クリックで10機能のチェックボックスが出てきて、登録／解除を切り替えられる

export const FEATURE_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'write', label: '文章作成', icon: '✍️' },
  { key: 'lp-generator', label: 'LP自動生成', icon: '📄' },
  { key: 'kindle', label: 'Kindle書籍生成', icon: '📚' },
  { key: 'hr-studio', label: '人材育成スタジオ', icon: '🌱' },
  { key: 'email-generator', label: 'ステップメール', icon: '📧' },
  { key: 'copy-generator', label: 'コピー生成', icon: '💬' },
  { key: 'medical-studio', label: '医療文書スタジオ', icon: '🏥' },
  { key: 'business-studio', label: '収益化スタジオ', icon: '💰' },
  { key: 'nexus', label: 'nexusブランドスタジオ', icon: '🌐' },
  { key: 'hp-generator', label: 'HP生成', icon: '🏠' },
];

interface Props {
  contextSaveId: number;
  // 親側で全カードまとめて取得した「登録済みマップ」を渡したい場合に使う
  initialRegistered?: string[];
  onChange?: (registered: string[]) => void;
}

export default function FeatureDefaultContextSelector({
  contextSaveId,
  initialRegistered,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState<string[]>(initialRegistered ?? []);
  const [pending, setPending] = useState<string[]>(initialRegistered ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 開いた瞬間に最新の登録状態を取得（initialRegistered が無い場合）
  useEffect(() => {
    if (!open) return;
    if (initialRegistered !== undefined) {
      setRegistered(initialRegistered);
      setPending(initialRegistered);
      return;
    }
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadState = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feature-default-contexts/by-context-save?contextSaveId=${contextSaveId}`);
      if (!res.ok) return;
      const data = await res.json();
      const keys = data.featureKeys ?? [];
      setRegistered(keys);
      setPending(keys);
    } catch {
      // 無視
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) => {
    setPending((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const toAdd = pending.filter((k) => !registered.includes(k));
      const toRemove = registered.filter((k) => !pending.includes(k));

      for (const featureKey of toAdd) {
        await fetch('/api/feature-default-contexts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureKey, contextSaveId }),
        });
      }
      for (const featureKey of toRemove) {
        await fetch(
          `/api/feature-default-contexts?featureKey=${encodeURIComponent(featureKey)}&contextSaveId=${contextSaveId}`,
          { method: 'DELETE' }
        );
      }

      setRegistered(pending);
      onChange?.(pending);
      setToast(
        toAdd.length > 0
          ? `✅ ${toAdd.length}機能のデフォルトに追加しました`
          : toRemove.length > 0
          ? `✅ ${toRemove.length}機能のデフォルトから外しました`
          : '変更なし'
      );
      setTimeout(() => setToast(null), 2500);
      setOpen(false);
    } catch {
      setToast('❌ 保存に失敗しました');
      setTimeout(() => setToast(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  const badgeCount = registered.length;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '6px 12px',
          background: badgeCount > 0 ? 'rgba(108,99,255,0.15)' : 'var(--bg-secondary)',
          border: `1px solid ${badgeCount > 0 ? 'var(--border-accent)' : 'var(--border)'}`,
          color: badgeCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        📌 デフォルト設定
        {badgeCount > 0 && (
          <span
            style={{
              background: 'var(--accent, #6c63ff)',
              color: '#fff',
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 10,
            }}
          >
            {badgeCount}
          </span>
        )}
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 50,
            width: 280,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            📌 このコンテキストをどの機能の
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            デフォルトコンテキストにしますか？
          </div>

          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
              読み込み中...
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {FEATURE_OPTIONS.map((f) => {
                const checked = pending.includes(f.key);
                const wasRegistered = registered.includes(f.key);
                return (
                  <label
                    key={f.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: checked ? 'rgba(108,99,255,0.08)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(f.key)}
                      style={{ accentColor: '#6c63ff' }}
                    />
                    <span style={{ fontSize: 13 }}>{f.icon}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                      {f.label}
                    </span>
                    {wasRegistered && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>登録済</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <button
              type="button"
              onClick={() => { setOpen(false); setPending(registered); }}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: '6px 14px',
                background: 'var(--accent, #6c63ff)',
                border: '1px solid var(--accent, #6c63ff)',
                color: '#fff',
                borderRadius: 6,
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 12,
                fontWeight: 700,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? '保存中...' : '💾 保存'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#111827',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
