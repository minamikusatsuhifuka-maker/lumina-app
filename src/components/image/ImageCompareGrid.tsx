'use client';

// 複数モデルの生成結果を横並びで比較するグリッド（171）。image-gen と EyecatchModal で共用。
// 各カード: モデル名・所要時間・サイズ・プレビュー・PNG DL・🖼️ギャラリー保存（165再利用・model記録）
//           失敗したモデルはエラー表示、生成中は個別ローディング。狭幅は自動で縦積み（grid auto-fill）。

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { saveImageToGallery } from '@/lib/gallery-client';
import { IMAGE_MODELS, type ImageModelKey } from '@/lib/image-providers';

// 画面が持つ1モデル分の状態（生成中/成功/失敗）
export interface ModelSlot {
  model: ImageModelKey;
  status: 'loading' | 'ok' | 'error';
  base64?: string;
  mimeType?: string;
  sizeLabel?: string;
  elapsedMs?: number;
  error?: string;
}

function modelLabel(key: ImageModelKey): string {
  return IMAGE_MODELS.find((m) => m.key === key)?.label ?? key;
}

function ResultCard({
  slot,
  prompt,
  saveTitle,
}: {
  slot: ModelSlot;
  prompt: string;
  saveTitle?: string;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const download = () => {
    if (!slot.base64) return;
    const a = document.createElement('a');
    a.href = `data:${slot.mimeType || 'image/png'};base64,${slot.base64}`;
    a.download = `${(saveTitle || modelLabel(slot.model)).slice(0, 40)}.png`;
    a.click();
  };

  const save = async () => {
    if (!slot.base64 || saving) return;
    setSaving(true);
    try {
      await saveImageToGallery({
        imageBase64: slot.base64,
        prompt,
        settings: { size: slot.sizeLabel, model: modelLabel(slot.model) },
        title: saveTitle,
      });
      setSaved(true);
      showToast('🖼️ ギャラリーに保存しました', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{modelLabel(slot.model)}</span>
        {slot.status === 'ok' && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {slot.sizeLabel} ・ {((slot.elapsedMs ?? 0) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {slot.status === 'loading' ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 10px',
            }}
          />
          生成中...
        </div>
      ) : slot.status === 'error' ? (
        <div style={{ padding: 20, fontSize: 12, color: '#e05a5a', lineHeight: 1.6 }}>
          ⚠️ 生成に失敗しました
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{slot.error}</div>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${slot.mimeType || 'image/png'};base64,${slot.base64}`}
            alt={modelLabel(slot.model)}
            style={{ width: '100%', display: 'block', background: 'var(--bg-primary)' }}
          />
          <div style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={download}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ⬇ PNG
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || saved}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#1D9E75',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: saving || saved ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '保存中...' : saved ? '保存済み ✓' : '🖼️ ギャラリー保存'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ImageCompareGrid({
  slots,
  prompt,
  saveTitle,
}: {
  slots: ModelSlot[];
  prompt: string;
  saveTitle?: string;
}) {
  if (slots.length === 0) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12,
      }}
    >
      {slots.map((s) => (
        <ResultCard key={s.model} slot={s} prompt={prompt} saveTitle={saveTitle} />
      ))}
    </div>
  );
}
