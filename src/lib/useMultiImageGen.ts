'use client';

// 複数モデルの画像生成フック（171→185で複数枚対応）。image-gen と EyecatchModal で共用（コピペしない）。
// 「モデル×枚数」のスロットごとに個別リクエストして並列実行し、1つ終わったら先に表示する
// （全部揃うまで待たせない・1枚失敗しても他は使える＝部分成功）。
// 185: 複数枚は candidateCount 等の1リクエスト複数枚でなく「同一プロンプトの並列リクエスト」方式。
//      個別ローディング・部分成功の要件は1リクエスト方式では満たせないため（採用理由）。

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
    // 1モデルあたりの枚数（185）。既存呼び出しは未指定=1枚で挙動不変
    count = 1,
  ) => {
    if (!prompt.trim() || models.length === 0) return;
    const n = Math.max(1, Math.floor(count));
    setGenerating(true);

    // まず「モデル×枚数」の全スロットを loading で並べる（個別ローディング表示）
    const plan: ModelSlot[] = models.flatMap((model) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${model}-${i + 1}`,
        model,
        status: 'loading' as const,
        indexLabel: n > 1 ? `${i + 1}/${n}` : undefined,
      })),
    );
    setSlots(plan);

    await Promise.all(
      plan.map(async (slot) => {
        try {
          const res = await fetch('/api/image-gen/multi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, models: [slot.model], aspect, quality }),
          });
          const data = await res.json().catch(() => ({}));
          const r = data?.results?.[0];
          setSlots((prev) =>
            prev.map((s) => {
              if (s.id !== slot.id) return s;
              if (r?.ok) {
                return {
                  ...s,
                  status: 'ok',
                  base64: r.base64,
                  mimeType: r.mimeType,
                  sizeLabel: r.sizeLabel,
                  elapsedMs: r.elapsedMs,
                };
              }
              return { ...s, status: 'error', error: r?.error || data?.error || '生成に失敗しました' };
            }),
          );
        } catch (e) {
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id
                ? { ...s, status: 'error', error: e instanceof Error ? e.message : '通信に失敗しました' }
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
