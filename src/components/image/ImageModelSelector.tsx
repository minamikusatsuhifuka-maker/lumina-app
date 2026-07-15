'use client';

// 画像生成モデルの複数選択トグル（171）。image-gen と EyecatchModal で共用（コピペしない）。
// 最低1つは選択必須（全解除させない）。選択数と概算コストの目安を静的定数から表示する。

import {
  IMAGE_MODELS,
  type ImageModelKey,
} from '@/lib/image-providers';

export function ImageModelSelector({
  selected,
  onChange,
  disabled,
}: {
  selected: ImageModelKey[];
  onChange: (next: ImageModelKey[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: ImageModelKey) => {
    if (selected.includes(key)) {
      // 最後の1つは外させない
      if (selected.length === 1) return;
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {IMAGE_MODELS.map((m) => {
          const active = selected.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              disabled={disabled}
              title={`${m.note}／コスト目安：${m.approxCost}`}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-soft, rgba(108,99,255,0.12))' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                fontSize: 12,
                lineHeight: 1.4,
                minWidth: 140,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {active ? '✓ ' : ''}
                {m.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.note}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.approxCost}</div>
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
        {selected.length}モデル同時＝{selected.length}枚生成します（選択数だけ課金されます）。
      </p>
    </div>
  );
}
