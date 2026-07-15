'use client';

// アイキャッチ生成モーダル（166→171でマルチモデル化）。note/SNS/LP の3画面で共用（コピペしない）。
// 流れ: 本文からプロンプトをAI起案（人間確認型・編集可）→ モデルを選んで生成（複数なら同時比較）→
//        各カードから PNG DL / 🖼️ ギャラリー保存（165の /api/gallery を再利用・model記録）。
// 画像生成コア・医療広告の既存ガードには手を入れない（呼び出すだけ）。

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ImageModelSelector } from '@/components/image/ImageModelSelector';
import { ImageCompareGrid } from '@/components/image/ImageCompareGrid';
import { useMultiImageGen } from '@/lib/useMultiImageGen';
import {
  ASPECT_OPTIONS,
  DEFAULT_MODELS,
  type ImageAspect,
  type ImageModelKey,
  type ImageQuality,
} from '@/lib/image-providers';

export type EyecatchKind = 'note' | 'sns' | 'lp';

// 用途ごとの既定比率（note/LP=横長・SNS=正方形）
const DEFAULT_ASPECT: Record<EyecatchKind, ImageAspect> = {
  note: 'landscape',
  sns: 'square',
  lp: 'landscape',
};

const QUALITY_OPTIONS = [
  { value: 'high', label: '高品質（high）' },
  { value: 'medium', label: '標準（medium）' },
  { value: 'low', label: '軽量（low）' },
];

export function EyecatchModal({
  open,
  onClose,
  sourceTitle,
  sourceText,
  sourceKind,
}: {
  open: boolean;
  onClose: () => void;
  sourceTitle?: string;
  sourceText: string;
  sourceKind: EyecatchKind;
}) {
  const { showToast } = useToast();
  const [draftingPrompt, setDraftingPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<ImageAspect>(DEFAULT_ASPECT[sourceKind]);
  const [quality, setQuality] = useState<ImageQuality>('medium');
  const [models, setModels] = useState<ImageModelKey[]>(DEFAULT_MODELS);

  // 複数モデルの並列生成（個別ローディング・部分成功・各カードから保存）
  const { slots, generating, run, reset } = useMultiImageGen();

  // 開いた初回だけ自動起案する（開くたびに上書きしない）
  const draftedRef = useRef(false);

  // AIにアイキャッチ用プロンプトを起案させる（編集可能な状態で提示＝人間確認型）
  const draftPrompt = async () => {
    if (draftingPrompt) return;
    setDraftingPrompt(true);
    try {
      const res = await fetch('/api/eyecatch/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText, sourceTitle, kind: sourceKind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'プロンプトの起案に失敗しました');
      }
      setPrompt(data.prompt);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '起案に失敗しました', 'error');
    } finally {
      setDraftingPrompt(false);
    }
  };

  useEffect(() => {
    if (open && !draftedRef.current && sourceText.trim()) {
      draftedRef.current = true;
      draftPrompt();
    }
    if (!open) {
      // 閉じたら次に開いたとき再起案できるようリセット
      draftedRef.current = false;
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 生成（選択モデルを並列生成）
  const generate = () => {
    if (!prompt.trim() || generating || models.length === 0) return;
    run(prompt, models, aspect, quality);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-700">
            🎨 アイキャッチを生成
            {sourceTitle && (
              <span className="truncate text-xs font-normal text-gray-400">{sourceTitle}</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* 本体 */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* プロンプト起案（編集可能・人間確認型） */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">
                画像プロンプト（AIの起案・編集できます）
              </label>
              <button
                onClick={draftPrompt}
                disabled={draftingPrompt}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                {draftingPrompt ? '起案中...' : '🔄 起案し直す'}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={draftingPrompt ? '本文からプロンプトを起案しています...' : '生成したい画像を説明してください'}
              rows={5}
              className="w-full resize-y rounded-lg border border-gray-200 p-3 text-sm text-gray-700 outline-none focus:border-[#378ADD]"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
              ※ 画像内に文字は入れません。実在の人物・症例写真的表現・効果効能の訴求は避けた起案にしています。生成前に内容をご確認ください。
            </p>
          </div>

          {/* モデル選択（複数可・最低1つ） */}
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600">
              モデル（複数選ぶと同時生成して比較）
            </div>
            <ImageModelSelector selected={models} onChange={setModels} disabled={generating} />
          </div>

          {/* 比率・品質 */}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              比率
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as ImageAspect)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
              >
                {ASPECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              品質（GPT Image 2 のみ）
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as ImageQuality)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
              >
                {QUALITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={generate}
            disabled={!prompt.trim() || generating || models.length === 0}
            className="rounded-lg bg-gradient-to-r from-[#6c63ff] to-[#8b5cf6] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {generating ? '生成中...' : `🎨 生成（${models.length}枚）`}
          </button>

          {/* 生成結果（モデルごとに比較・各カードから保存） */}
          {slots.length > 0 && (
            <div className="space-y-2">
              <ImageCompareGrid
                slots={slots}
                prompt={prompt}
                saveTitle={sourceTitle ? `アイキャッチ: ${sourceTitle}` : undefined}
              />
              <p className="text-[11px] leading-relaxed text-gray-400">
                ⚠️ 広告・院内掲示・Web等に使う場合は医療広告ガイドライン（誇大表現・ビフォーアフター規制等）への適合をご確認ください。
              </p>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
