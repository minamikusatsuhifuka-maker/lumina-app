'use client';

// 249: カードに出す「所属マイフォルダ」のバッジ。複数所属ならその数だけ並ぶ。
// 自動カテゴリのバッジ（📁・多色）と並んでも区別できるよう、金色の 📂 で統一する。

import type { CustomFolder } from './useCustomFolders';
import { FOLDER_BADGE_STYLE } from './folderStyles';

interface Props {
  folderIds: number[] | undefined;
  folders: CustomFolder[];
}

export default function FolderBadges({ folderIds, folders }: Props) {
  if (!folderIds || folderIds.length === 0) return null;
  // フォルダ一覧の並び順で出す（画面上のフォルダの並びと見え方をそろえる）
  const names = folders.filter((f) => folderIds.includes(f.id));
  if (names.length === 0) return null;
  return (
    <>
      {names.map((f) => (
        <span key={f.id} data-folder-badge={f.id} style={FOLDER_BADGE_STYLE}>
          📂 {f.name}
        </span>
      ))}
    </>
  );
}
