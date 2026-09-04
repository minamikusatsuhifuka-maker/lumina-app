'use client';

// 297: カードに出す「所属用途カテゴリ」のバッジ。複数所属ならその数だけ並ぶ。
// ⭐マイフォルダのバッジ（金色 📂）と見分けられるよう、青緑の 🎯 で統一する。

import type { PurposeCategory } from '@/lib/purpose-categories';
import { PURPOSE_BADGE_STYLE } from './purposeStyles';

interface Props {
  categoryIds: number[] | undefined;
  categories: PurposeCategory[];
}

export default function PurposeBadges({ categoryIds, categories }: Props) {
  if (!categoryIds || categoryIds.length === 0) return null;
  const names = categories.filter((c) => categoryIds.includes(c.id));
  if (names.length === 0) return null;
  return (
    <>
      {names.map((c) => (
        <span key={c.id} data-purpose-badge={c.id} style={PURPOSE_BADGE_STYLE}>
          🎯 {c.name}
        </span>
      ))}
    </>
  );
}
