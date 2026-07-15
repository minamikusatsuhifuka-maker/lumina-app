'use client';

// 複数モデルの画像生成フック（171）。image-gen と EyecatchModal で共用（コピペしない）。
// モデルごとに個別リクエストして並列実行し、1つ終わったら先に表示する（全部揃うまで待たせない）。
// 各リクエストは /api/image-gen/multi（単一モデルでも動く）を叩き、結果を該当スロットへ反映する。

import { useState } from 'react';
import type { ModelSlot } from '@/components/image/ImageCompareGrid';
import type { ImageAspect, ImageModelKey, ImageQuality } from '@/lib/image-providers';

export function useMultiImageGen() {
  const [slots, setSlots] = useState<ModelSlot[]>([]);
  const [generating, setGenerating] = useState(false);

  const run = async (
    prompt: string,
    models: ImageModelKey[],
    aspect: ImageAspect,
    quality: ImageQuality,
  ) => {
    if (!prompt.trim() || models.length === 0) return;
    setGenerating(true);
    // まず全モデルを loading で並べる（個別ローディング表示）
    setSlots(models.map((model) => ({ model, status: 'loading' as const })));

    await Promise.all(
      models.map(async (model) => {
        try {
          const res = await fetch('/api/image-gen/multi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, models: [model], aspect, quality }),
          });
          const data = await res.json().catch(() => ({}));
          const r = data?.results?.[0];
          setSlots((prev) =>
            prev.map((s) => {
              if (s.model !== model) return s;
              if (r?.ok) {
                return {
                  model,
                  status: 'ok',
                  base64: r.base64,
                  mimeType: r.mimeType,
                  sizeLabel: r.sizeLabel,
                  elapsedMs: r.elapsedMs,
                };
              }
              return {
                model,
                status: 'error',
                error: r?.error || data?.error || '生成に失敗しました',
              };
            }),
          );
        } catch (e) {
          setSlots((prev) =>
            prev.map((s) =>
              s.model === model
                ? { model, status: 'error', error: e instanceof Error ? e.message : '通信に失敗しました' }
                : s,
            ),
          );
        }
      }),
    );
    setGenerating(false);
  };

  const reset = () => setSlots([]);

  return { slots, generating, run, reset };
}
