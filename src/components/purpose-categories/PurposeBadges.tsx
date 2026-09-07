'use client';

// 297: カードに出す「所属用途カテゴリ」のバッジ。複数所属ならその数だけ並ぶ。
// ⭐マイフォルダのバッジ（金色 📂）と見分けられるよう、青緑の 🎯 で統一する。
// 299 §3: コンパクト密度でも出す（用途は日常的に付け替える情報＝開かずに分かる価値がある。マイフォルダは従来どおり隠す）。
//   コンパクトは「バッジ行＋タイトル行」だけの設計（292/295）なので、compact では上限件数を超えた分を「+N」1つに畳む
//   （名前はツールチップ・data-purpose-badge-more）。detail は従来どおり全部並べる。

import type { PurposeCategory } from '@/lib/purpose-categories';
import { PURPOSE_BADGE_STYLE, PURPOSE_COMPACT_MAX_BADGES } from './purposeStyles';

interface Props {
  categoryIds: number[] | undefined;
  categories: PurposeCategory[];
  /** 299: コンパクト密度（上限を超えた分を +N に畳む）。既定 false＝従来どおり全部並べる */
  compact?: boolean;
}

export default function PurposeBadges({ categoryIds, categories, compact = false }: Props) {
  if (!categoryIds || categoryIds.length === 0) return null;
  const names = categories.filter((c) => categoryIds.includes(c.id));
  if (names.length === 0) return null;
  const shown = compact && names.length > PURPOSE_COMPACT_MAX_BADGES ? names.slice(0, PURPOSE_COMPACT_MAX_BADGES) : names;
  const rest = names.slice(shown.length);
  return (
    <>
      {shown.map((c) => (
        <span key={c.id} data-purpose-badge={c.id} title={c.name} style={PURPOSE_BADGE_STYLE}>
          🎯 {c.name}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          data-purpose-badge-more={rest.length}
          title={`ほか${rest.length}件の用途: ${rest.map((c) => c.name).join('、')}`}
          style={{ ...PURPOSE_BADGE_STYLE, cursor: 'help' }}
        >
          🎯 +{rest.length}
        </span>
      )}
    </>
  );
}
