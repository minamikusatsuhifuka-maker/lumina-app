'use client';

// アイキャッチ生成モーダル（166）。note/SNS/LP の3画面で共用（コピペしない）。
// 流れ: 本文からプロンプトをAI起案（人間確認型・編集可）→ 既存の /api/image-gen で生成 →
//        PNG DL / 🖼️ ギャラリー保存（165の /api/gallery を再利用）。保存後もモーダルは閉じない（161方針）。
// 画像生成コア・医療広告の既存ガードには手を入れない（呼び出すだけ）。

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { saveImageToGallery } from '@/lib/gallery-client';

export type EyecatchKind = 'note' | 'sns' | 'lp';

// 用途ごとの既定サイズ（既存 image-gen が受け付ける値のみ）
const DEFAULT_SIZE: Record<EyecatchKind, string> = {
  note: '1536x1024',
  sns: '1024x1024',
  lp: '1536x1024',
};

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '正方形（1024×1024）' },
  { value: '1536x1024', label: '横長（1536×1024）' },
  { value: '1024x1536', label: '縦長（1024×1536）' },
];

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
  const [size, setSize] = useState(DEFAULT_SIZE[sourceKind]);
  const [quality, setQuality] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [error, setError] = useState('');
  const [savingGallery, setSavingGallery] = useState(false);
  const [savedGallery, setSavedGallery] = useState(false);

  // 開いた初回だけ自動起案する（開くたびに上書きしない）
  const draftedRef = useRef(false);

  // AIにアイキャッチ用プロンプトを起案させる（編集可能な状態で提示＝人間確認型）
  const draftPrompt = async () => {
    if (draftingPrompt) return;
    setDraftingPrompt(true);
    setError('');
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 生成（既存の画像生成APIをそのまま呼ぶ）
  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError('');
    setImage(null);
    setSavedGallery(false);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size, quality }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '画像生成に失敗しました');
      }
      setImage(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像生成に失敗しました');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  };

  const downloadPng = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = `data:${image.mimeType};base64,${image.base64}`;
    a.download = `eyecatch_${(sourceTitle || sourceKind).slice(0, 30)}.png`;
    a.click();
  };

  // ギャラリー保存（165の経路を再利用）。保存後もモーダルは閉じない。
  const saveToGallery = async () => {
    if (!image || savingGallery) return;
    setSavingGallery(true);
    try {
      await saveImageToGallery({
        imageBase64: image.base64,
        prompt,
        settings: { size, quality },
        title: sourceTitle ? `アイキャッチ: ${sourceTitle}` : undefined,
      });
      setSavedGallery(true);
      showToast('🖼️ ギャラリーに保存しました', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setSavingGallery(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-700">
            🎨 アイキャッチを生成
            {sourceTitle && (
              <span className="truncate text-xs font-normal text-gray-400">
                {sourceTitle}
              </span>
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

          {/* サイズ・品質 */}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              サイズ
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700"
              >
                {SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              品質
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
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
            disabled={!prompt.trim() || generating}
            className="rounded-lg bg-gradient-to-r from-[#6c63ff] to-[#8b5cf6] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {generating ? `生成中... ${elapsed}s` : image ? '🔄 別案を生成' : '🎨 生成'}
          </button>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* 生成結果 */}
          {image && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${image.mimeType};base64,${image.base64}`}
                alt="アイキャッチ"
                className="w-full rounded-lg border border-gray-200"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={downloadPng}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  ⬇ PNGダウンロード
                </button>
                <button
                  onClick={saveToGallery}
                  disabled={savingGallery || savedGallery}
                  className="rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F6E56] disabled:opacity-60"
                >
                  {savingGallery
                    ? '保存中...'
                    : savedGallery
                      ? '保存済み ✓'
                      : '🖼️ ギャラリーに保存'}
                </button>
              </div>
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
