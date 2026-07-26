'use client';

// 180: note記事まとめ生成の選択UI 共通部品（コピペ実装しない＝集約方針）。
// - BundleSelectToggleButton: フィルタバーに置く「☑ 選択」/「✕ 選択をやめる」トグル
// - BundleSelectCheckbox: 選択モード中にカードへ出すチェックボックス（上限超過は onLimit で通知）
// 🧠AI参照素材（ContextLibraryPanel）と 🗂テキスト分析（SavedAnalysisList）の両方から使う。

import { MAX_BUNDLE_SOURCES, BUNDLE_SOURCE_META, type BundleSource } from '@/lib/note-bundle';
import { useNoteBundleSelection } from './useNoteBundleSelection';

// 188: note記事群生成（179）の唯一の入口。フィルタ系ボタンと見分けがつくよう
// 主ボタン系グラデーションの塗り＋機能が伝わる文言にする（機能・状態切替は無変更）。
export function BundleSelectToggleButton() {
  const { selectMode, setSelectMode } = useNoteBundleSelection();
  return (
    <button
      type="button"
      onClick={() => setSelectMode(!selectMode)}
      title="複数の資料を選択して、まとめて note 記事にします（🧠/🗂をまたいで選択できます）"
      style={
        selectMode
          ? {
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid var(--accent)',
              background: 'var(--accent-soft)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }
          : {
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(139,92,246,0.35)',
            }
      }
    >
      {selectMode ? '✕ 選択をやめる' : '📝 記事にまとめる資料を選ぶ'}
    </button>
  );
}

export function BundleSelectCheckbox({
  source,
  id,
  topic,
  onLimit,
}: {
  source: BundleSource;
  id: number;
  topic: string;
  onLimit: (message: string) => void;
}) {
  const { isSelected, toggle } = useNoteBundleSelection();
  const meta = BUNDLE_SOURCE_META[source];
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', paddingTop: 2 }}
      title={`note記事にまとめる資料として選択（${meta.icon} ${meta.label}）`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={isSelected(source, id)}
        onChange={() => {
          const result = toggle({ source, id, topic });
          if (result === 'limit') {
            onLimit(`選択できるのは最大${MAX_BUNDLE_SOURCES}件です（🧠/🗂合計）`);
          }
        }}
        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
      />
    </label>
  );
}
