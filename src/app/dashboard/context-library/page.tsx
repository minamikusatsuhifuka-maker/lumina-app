import ContextLibraryPanel from '@/components/context-library/ContextLibraryPanel';
import NoteBundleDock from '@/components/note-bundle/NoteBundleDock';

// 実体は ContextLibraryPanel に集約（保存一覧メニュー /dashboard/saved からも再利用）。
// NoteBundleDock = note記事まとめの選択中バー＋生成モーダル（ページ直下に1回マウント・180）
export default function ContextLibraryPage() {
  return (
    <>
      <ContextLibraryPanel />
      <NoteBundleDock />
    </>
  );
}
