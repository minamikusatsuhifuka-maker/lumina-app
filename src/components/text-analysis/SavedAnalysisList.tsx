'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import JSZip from 'jszip';
import {
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';

export interface AnalysisRecord {
  id: number;
  user_id: string;
  file_name: string | null;
  auto_title: string | null;
  analysis_type: string;
  analysis_label: string;
  content: string;
  tags: string[] | null;
  folder: string | null;
  favorite: boolean;
  locked: boolean;
  char_count: number;
  created_at: string;
  updated_at: string;
  // 生成AIモデル（保存時に記録されていれば。旧データは undefined）
  model?: AIModel;
  // 元の入力テキストの有無・文字数（一覧APIが返す。input_text本体は展開時に単体取得）
  has_input?: boolean;
  input_char_count?: number;
}

const FOLDER_PALETTE = [
  '#3b82f6',
  '#1D9E75',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#10b981',
];

function getFolderColor(folder: string, allFolders: string[]): string {
  const idx = allFolders.indexOf(folder);
  return idx >= 0
    ? FOLDER_PALETTE[idx % FOLDER_PALETTE.length]
    : '#6b7280';
}

interface Props {
  records: AnalysisRecord[];
  onRecordsChange: (records: AnalysisRecord[]) => void;
  onSelectForCross?: (
    articles: { id: number; title: string; content: string; category?: string }[],
  ) => void;
  highlightId?: number | null;
  onHighlightClear?: () => void;
}

interface AutoCategorizeResult {
  categories?: Array<{
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    item_ids?: number[];
  }>;
  summary?: string;
  updatedCount?: number;
  totalItems?: number;
}

export default function SavedAnalysisList({
  records,
  onRecordsChange,
  onSelectForCross,
  highlightId,
  onHighlightClear,
}: Props) {
  const { showToast } = useToast();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // カテゴリ概覧の開閉（デフォルト閉。開閉状態は localStorage で記憶）
  const [showCategoryGrid, setShowCategoryGrid] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ta_category_open');
      if (saved !== null) setShowCategoryGrid(saved === '1');
      // saved が null（初回）なら false=折りたたみのまま
    } catch {
      /* localStorage 不可環境では既定値（閉）のまま */
    }
  }, []);
  const toggleCategoryGrid = () => {
    setShowCategoryGrid((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ta_category_open', next ? '1' : '0');
      } catch {
        /* 保存失敗は無視（開閉自体は機能する） */
      }
      return next;
    });
  };
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 「入力付き」仮想フィルタ（実フォルダは作らない＝auto-categorize対策）
  const [inputOnly, setInputOnly] = useState(false);
  // 「お気に入り」絞り込み（inputOnly と AND）
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // 展開時に単体取得した元入力のキャッシュ（再展開では再取得しない）
  const [loadedInputTexts, setLoadedInputTexts] = useState<Record<number, string>>({});
  const [inputTextLoading, setInputTextLoading] = useState<Record<number, boolean>>({});
  // 「📥 元の入力テキスト」の折りたたみ状態（デフォルト閉）とコピー中ID
  const [inputTextOpen, setInputTextOpen] = useState<Record<number, boolean>>({});
  const [copyingInputId, setCopyingInputId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // 保存済み分析の編集（タイトル+本文。同時編集は1件のみ）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // MDダウンロード中のID（タイトル生成中の同時押し防止）
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // 選択項目の一括MDダウンロード（ZIP）中フラグ（二度押し防止）
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [categorizationResult, setCategorizationResult] =
    useState<AutoCategorizeResult | null>(null);

  // AIで保存済み全件を自動カテゴライズする
  const handleAutoCategorize = async () => {
    if (records.length === 0) {
      showToast('保存済みテキストがありません', 'error');
      return;
    }
    const ok = window.confirm(
      `${records.length}件のテキストをAIが自動カテゴライズします。\n既存のカテゴリは上書きされます。よろしいですか？`,
    );
    if (!ok) return;

    setIsAutoCategorizing(true);
    setCategorizationResult(null);
    try {
      const res = await fetch('/api/text-analysis/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'categorize' }),
      });
      const data = (await res.json()) as AutoCategorizeResult & { error?: string };
      if (!res.ok) {
        showToast(data.error ?? '自動カテゴライズに失敗しました', 'error');
        return;
      }
      setCategorizationResult(data);
      showToast(
        `${data.updatedCount ?? 0}件を${data.categories?.length ?? 0}カテゴリに分類しました`,
        'success',
      );
      // 保存一覧をリロード
      try {
        const refreshed = await fetch('/api/text-analysis/saves');
        if (refreshed.ok) {
          const list = await refreshed.json();
          if (Array.isArray(list)) onRecordsChange(list);
        }
      } catch {
        /* skip */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '通信エラー';
      showToast(message, 'error');
    } finally {
      setIsAutoCategorizing(false);
    }
  };

  const handleCopy = async (id: number, text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedId(id);
      showToast('コピーしました', 'success');
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } else {
      showToast('コピーできませんでした。手動で選択してコピーしてください。', 'error');
    }
  };

  // 個別レコードを .md ファイルとしてダウンロード（AIタイトル生成 + モデル表記付き）
  const handleDownloadMd = async (record: AnalysisRecord) => {
    if (downloadingId !== null) return; // 同時押し防止
    setDownloadingId(record.id);
    try {
      const label =
        record.analysis_label || record.analysis_type || '分析結果';
      const fallback = record.auto_title || record.file_name || label;
      const autoTitle = await generateTitleWithTimeout(
        record.content,
        label,
        fallback,
      );
      const safeTitle = sanitizeFilename(autoTitle);
      // モデル情報があれば生成AI行を追加（旧データは undefined → 出力なし）
      const modelLine = record.model
        ? `> 生成AI: ${getModelIcon(record.model)} ${getModelLabel(record.model)}\n\n---\n\n`
        : '';
      const mdContent = `# ${autoTitle}\n\n${modelLine}${record.content}`;

      triggerDownload(`${safeTitle}_${yyyymmdd()}.md`, mdContent, 'text/markdown;charset=utf-8');
      showToast('MDファイルをダウンロードしました', 'success');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // 選択中の各レコードを個別の .md にして JSZip で1つのZIPにまとめてダウンロード。
  // MD整形は単体DL（handleDownloadMd）と同じ「# タイトル + 生成AI行 + 本文」を流用。
  // 件数が多いと重いため、ファイル名は AIタイトル生成は行わず既存の auto_title/file_name を使う。
  // 本文(content)は一覧APIが返すため records から取得（単体取得は不要）。
  const handleBulkDownload = async () => {
    if (bulkDownloading || selectedIds.size === 0) return;
    setBulkDownloading(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const ids = Array.from(selectedIds);
      let added = 0;

      for (const id of ids) {
        const rec = records.find((r) => r.id === id);
        if (!rec) continue;

        const label = rec.analysis_label || rec.analysis_type || '分析結果';
        const title = rec.auto_title || rec.file_name || label;
        // モデル情報があれば生成AI行を追加（旧データは undefined → 出力なし）
        const modelLine = rec.model
          ? `> 生成AI: ${getModelIcon(rec.model)} ${getModelLabel(rec.model)}\n\n---\n\n`
          : '';
        const md = `# ${title}\n\n${modelLine}${rec.content ?? ''}`;

        // ファイル名（サニタイズ + 同名タイトルの重複は連番で回避）
        const base = sanitizeFilename(title) || `analysis_${id}`;
        let name = `${base}.md`;
        let i = 2;
        while (usedNames.has(name)) {
          name = `${base}_${i}.md`;
          i++;
        }
        usedNames.add(name);

        zip.file(name, md);
        added++;
      }

      if (added === 0) {
        showToast('ダウンロード対象が見つかりませんでした', 'error');
        return;
      }

      // triggerDownload(v25) は文字列専用でBlob非対応のため、ZIPはここで直接DLする
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `text-analysis_${yyyymmdd()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast(`${added}件をZIPでダウンロードしました`, 'success');
    } catch (e) {
      console.error('[bulk-download]', e);
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    const newName = editingValue.trim();
    if (!newName || newName === oldName) {
      setEditingCategory(null);
      return;
    }
    setIsRenaming(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_folder', oldName, newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error ?? '変更できませんでした');
        return;
      }
      onRecordsChange(
        records.map((r) => (r.folder === oldName ? { ...r, folder: newName } : r)),
      );
      if (activeFolder === oldName) setActiveFolder(newName);
      showToast(`カテゴリ名を「${newName}」に変更しました`, 'success');
    } catch {
      showToast('変更に失敗しました', 'error');
    } finally {
      setIsRenaming(false);
      setEditingCategory(null);
    }
  };

  // 元の入力テキストを単体取得してキャッシュし、本文を返す（取得済みならそれを返す）
  const fetchInputText = async (id: number): Promise<string> => {
    if (loadedInputTexts[id] !== undefined) return loadedInputTexts[id];
    setInputTextLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}&withInput=1`);
      const data = await res.json();
      const text = typeof data?.input_text === 'string' ? data.input_text : '';
      setLoadedInputTexts((prev) => ({ ...prev, [id]: text }));
      return text;
    } catch {
      setLoadedInputTexts((prev) => ({ ...prev, [id]: '' }));
      return '';
    } finally {
      setInputTextLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 「📥 元の入力テキスト」の折りたたみトグル（開く時に未取得なら遅延取得）
  const toggleInputText = (id: number) => {
    setInputTextOpen((prev) => {
      const opening = !prev[id];
      if (opening && loadedInputTexts[id] === undefined) {
        void fetchInputText(id);
      }
      return { ...prev, [id]: opening };
    });
  };

  // 元の入力テキストをコピー（未取得なら取得してからコピー。copyToClipboard共通util）
  const copyInputText = async (id: number) => {
    if (copyingInputId === id) return; // 二度押し防止
    setCopyingInputId(id);
    try {
      const text = await fetchInputText(id);
      if (!text) {
        showToast('入力テキストがありません', 'error');
        return;
      }
      const ok = await copyToClipboard(text);
      showToast(
        ok ? '✅ 入力テキストをコピーしました' : '❌ コピーに失敗しました',
        ok ? 'success' : 'error',
      );
    } finally {
      setCopyingInputId(null);
    }
  };

  // カード本体の全文表示トグル（入力テキストの取得はここではしない＝v35で遅延化）
  const handleToggleExpand = (record: AnalysisRecord) => {
    setExpandedId(expandedId === record.id ? null : record.id);
  };

  const uniqueFolders = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.folder && r.folder.trim()) set.add(r.folder);
    });
    return Array.from(set);
  }, [records]);

  const visibleRecords = useMemo(() => {
    let list = records;
    if (activeFolder !== null) {
      list = list.filter((r) => (r.folder ?? '') === activeFolder);
    }
    if (inputOnly) {
      list = list.filter((r) => r.has_input === true);
    }
    if (favoriteOnly) {
      list = list.filter((r) => r.favorite === true);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          (r.auto_title ?? r.file_name ?? '').toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q),
      );
    }
    return list;
  }, [records, activeFolder, inputOnly, favoriteOnly, searchTerm]);

  // 表示中レコードから分析タイプ別の件数とラベルを動的に抽出
  const typeStats = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of visibleRecords) {
      const type = r.analysis_type;
      const existing = map.get(type);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(type, {
          label: r.analysis_label || type,
          count: 1,
        });
      }
    }
    return Array.from(map.entries()).map(([type, info]) => ({ type, ...info }));
  }, [visibleRecords]);

  const handleSelectByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return;
    const allSelected = targetIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      targetIds.forEach((id) => next.delete(id));
    } else {
      targetIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const isAllSelectedByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return false;
    return targetIds.every((id) => selectedIds.has(id));
  };

  const handleSelectAllVisible = () => {
    const allIds = visibleRecords.map((r) => r.id);
    if (allIds.length === 0) return;
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  };

  const handleBulkMove = async (folder: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_folder', ids, folder }),
      });
      if (!res.ok) throw new Error('一括移動に失敗しました');
      onRecordsChange(
        records.map((r) => (selectedIds.has(r.id) ? { ...r, folder } : r)),
      );
      setSelectedIds(new Set());
      showToast(
        `${ids.length}件を「${folder || '未分類'}」に移動しました`,
        'success',
      );
    } catch {
      showToast('一括移動に失敗しました', 'error');
    }
  };

  const handleToggleFavorite = async (id: number) => {
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite', id }),
      });
      if (!res.ok) throw new Error();
      onRecordsChange(
        records.map((r) =>
          r.id === id ? { ...r, favorite: !r.favorite } : r,
        ),
      );
    } catch {
      showToast('更新に失敗しました', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この保存を削除しますか？')) return;
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      onRecordsChange(records.filter((r) => r.id !== id));
      showToast('削除しました', 'success');
    } catch {
      showToast('削除に失敗しました', 'error');
    }
  };

  // 「✏️ 編集」押下 → 現在のタイトル/本文を編集 state にコピーして編集モードへ
  const startEdit = (record: AnalysisRecord) => {
    setExpandedId(record.id); // 編集UIは展開ビュー内に出るので展開も保証
    setEditingId(record.id);
    setEditTitle(record.auto_title || record.file_name || '');
    setEditContent(record.content);
  };

  // 編集内容を保存（PATCH action=update。タイトル+本文のみ、input_text は不変）
  const saveEdit = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      showToast('タイトルと本文は空にできません', 'error');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          title: editTitle.trim(),
          content: editContent.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      // ローカル state を楽観的更新（タイトル両カラム・本文・文字数も更新）
      const newTitle = editTitle.trim();
      const newContent = editContent.trim();
      onRecordsChange(
        records.map((r) =>
          r.id === id
            ? {
                ...r,
                auto_title: newTitle,
                file_name: newTitle,
                content: newContent,
                char_count: newContent.length,
              }
            : r,
        ),
      );
      setEditingId(null);
      showToast('✅ 更新しました', 'success');
    } catch {
      // 失敗時は編集モードを維持（入力内容を失わない）
      showToast('❌ 更新に失敗しました', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .category-card:hover .category-edit-btn { opacity: 1 !important; }
        /* カテゴリ概覧グリッド: 画面幅に応じて列数を自動調整（PCは多列、コンパクト1行表示） */
        .category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }
        /* スマホ(≤640px)は確実に2列 */
        @media (max-width: 640px) {
          .category-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      {/* カテゴリ概覧ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: -8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          📂 カテゴリ概覧
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* AI自動カテゴライズ */}
          <button
            type="button"
            onClick={handleAutoCategorize}
            disabled={isAutoCategorizing || records.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: isAutoCategorizing
                ? '#9ca3af'
                : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor:
                isAutoCategorizing || records.length === 0
                  ? 'not-allowed'
                  : 'pointer',
              opacity: records.length === 0 ? 0.4 : 1,
            }}
            title="AIが全保存テキストを分析して最適なカテゴリへ自動分類します"
          >
            {isAutoCategorizing ? '🤖 カテゴライズ中...' : '🤖 AIが自動カテゴライズ'}
          </button>
          <button
            type="button"
            onClick={toggleCategoryGrid}
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showCategoryGrid ? '▲ 折りたたむ' : '▼ 展開'}
          </button>
        </div>
      </div>

      {/* カテゴライズ結果バナー */}
      {categorizationResult && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(79,70,229,0.08)',
            border: '1px solid rgba(79,70,229,0.2)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#4f46e5',
                marginBottom: 2,
              }}
            >
              ✅ {categorizationResult.updatedCount ?? 0}件を{' '}
              {categorizationResult.categories?.length ?? 0}カテゴリに自動分類しました
            </div>
            {categorizationResult.summary && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {categorizationResult.summary}
              </p>
            )}
            {categorizationResult.categories &&
              categorizationResult.categories.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {categorizationResult.categories.map((cat) => (
                    <span
                      key={cat.name}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 9px',
                        borderRadius: 12,
                        fontSize: 11,
                        background: `${cat.color ?? '#4f46e5'}20`,
                        color: cat.color ?? '#4f46e5',
                        border: `1px solid ${cat.color ?? '#4f46e5'}40`,
                      }}
                    >
                      <span>{cat.icon ?? '📁'}</span>
                      <span>{cat.name}</span>
                      <span style={{ opacity: 0.8, fontSize: 10 }}>
                        ({cat.item_ids?.length ?? 0})
                      </span>
                    </span>
                  ))}
                </div>
              )}
          </div>
          <button
            type="button"
            onClick={() => setCategorizationResult(null)}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {showCategoryGrid && (
        <div className="category-grid">
          {/* すべて */}
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            style={categoryCardStyle(activeFolder === null)}
          >
            <span style={{ fontSize: 15 }}>📂</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                flex: 1,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              すべて
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              {records.length}
            </span>
          </button>

          {uniqueFolders.map((folder) => {
            const count = records.filter((r) => r.folder === folder).length;
            const color = getFolderColor(folder, uniqueFolders);
            const active = activeFolder === folder;
            const isEditing = editingCategory === folder;
            const canRename = folder !== '横断まとめ';
            return (
              <div
                key={folder}
                onClick={() => {
                  if (!isEditing) setActiveFolder(folder);
                }}
                className="category-card"
                style={{
                  ...categoryCardStyle(active),
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: color,
                  }}
                />
                <span style={{ fontSize: 15, paddingLeft: 6, flexShrink: 0 }}>📁</span>
                {isEditing ? (
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(folder);
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      onBlur={() => handleRenameCategory(folder)}
                      disabled={isRenaming}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${color}`,
                        borderRadius: 4,
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        flex: 1,
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {folder}
                    </span>
                    {canRename && (
                      <button
                        type="button"
                        className="category-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(folder);
                          setEditingValue(folder);
                        }}
                        title="カテゴリ名を変更"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          fontSize: 11,
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.15s',
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        ✏️
                      </button>
                    )}
                  </>
                )}
                <span
                  style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 検索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 タイトル・本文で検索"
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
        />
        <button
          type="button"
          onClick={() => setInputOnly((v) => !v)}
          title="元の入力テキストが保存されている分析だけを表示"
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: 8,
            cursor: 'pointer',
            border: `1px solid ${inputOnly ? 'var(--accent)' : 'var(--border)'}`,
            background: inputOnly ? 'var(--accent)' : 'transparent',
            color: inputOnly ? '#fff' : 'var(--text-secondary)',
          }}
        >
          📥 入力付き
        </button>
        <button
          type="button"
          onClick={() => setFavoriteOnly((v) => !v)}
          title="お気に入り登録した分析だけを表示"
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: 8,
            cursor: 'pointer',
            border: `1px solid ${favoriteOnly ? '#f59e0b' : 'var(--border)'}`,
            background: favoriteOnly ? '#f59e0b' : 'transparent',
            color: favoriteOnly ? '#fff' : 'var(--text-secondary)',
          }}
        >
          ⭐ お気に入り
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {visibleRecords.length}件 / 全{records.length}件
        </span>
      </div>

      {/* 一括移動パネル */}
      {selectedIds.size > 0 && (
        <div
          style={{
            border: '2px solid var(--accent)',
            background: 'rgba(108,99,255,0.08)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              📋 {selectedIds.size}件を選択中
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'var(--bg-card)',
                border: '1px solid var(--accent)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              ✕ 選択をすべて解除
            </button>
          </div>
          {/* 分析タイプ別一括選択 */}
          {typeStats.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                🏷 タイプ別一括選択
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {typeStats.map((stat) => {
                  const allSelected = isAllSelectedByType(stat.type);
                  return (
                    <button
                      key={stat.type}
                      type="button"
                      onClick={() => handleSelectByType(stat.type)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${allSelected ? '#9333ea' : 'var(--border)'}`,
                        background: allSelected ? '#9333ea' : 'var(--bg-card)',
                        color: allSelected ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{allSelected ? '✅' : '☐'}</span>
                      <span>{stat.label}</span>
                      <span
                        style={{
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: allSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                          color: allSelected ? '#fff' : 'var(--text-muted)',
                        }}
                      >
                        {stat.count}
                      </span>
                    </button>
                  );
                })}
                {visibleRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${
                        visibleRecords.every((r) => selectedIds.has(r.id))
                          ? 'var(--text-primary)'
                          : 'var(--border)'
                      }`,
                      background: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--text-primary)'
                        : 'var(--bg-card)',
                      color: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--bg-primary)'
                        : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>📋</span>
                    <span>表示中を全選択</span>
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {visibleRecords.length}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            📁 カテゴリに移動
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueFolders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => handleBulkMove(folder)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {folder}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const name = prompt('新しいカテゴリ名');
                if (!name?.trim()) return;
                await handleBulkMove(name.trim());
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px dashed var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              + 新規カテゴリ
            </button>
            <button
              type="button"
              onClick={() => handleBulkMove('')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              未分類に戻す
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              marginTop: 6,
            }}
          >
            {/* 選択項目の一括MDダウンロード（ZIP） */}
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={bulkDownloading || selectedIds.size === 0}
              style={{
                padding: '10px 22px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                background:
                  bulkDownloading || selectedIds.size === 0
                    ? 'var(--border)'
                    : '#0ea5e9',
                color: '#fff',
                cursor:
                  bulkDownloading || selectedIds.size === 0
                    ? 'not-allowed'
                    : 'pointer',
                boxShadow:
                  bulkDownloading || selectedIds.size === 0
                    ? 'none'
                    : '0 4px 12px rgba(14,165,233,0.3)',
              }}
            >
              {bulkDownloading
                ? '⏳ 生成中...'
                : `📥 選択した${selectedIds.size}件をMDダウンロード`}
            </button>

            {selectedIds.size >= 2 && onSelectForCross && (
              <button
                type="button"
                onClick={() => {
                  const articles = records
                    .filter((r) => selectedIds.has(r.id))
                    .map((r) => ({
                      id: r.id,
                      title: r.auto_title ?? r.file_name ?? '無題',
                      content: r.content,
                      category: r.folder ?? undefined,
                    }));
                  onSelectForCross(articles);
                }}
                style={{
                  padding: '10px 22px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  background: '#9333ea',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(147,51,234,0.3)',
                }}
              >
                🔀 選択した{selectedIds.size}件を横断分析する
              </button>
            )}
          </div>
        </div>
      )}

      {/* 一覧 */}
      {visibleRecords.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-muted)',
            fontSize: 13,
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          保存された分析結果はまだありません
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {visibleRecords.map((record) => {
            const title =
              record.auto_title || record.file_name || '無題';
            const checked = selectedIds.has(record.id);
            const expanded = expandedId === record.id;
            const folderColor = record.folder
              ? getFolderColor(record.folder, uniqueFolders)
              : null;
            const highlighted = highlightId === record.id;
            return (
              <div
                key={record.id}
                id={`article-${record.id}`}
                onClick={() => {
                  if (highlighted) onHighlightClear?.();
                }}
                style={{
                  background: highlighted ? 'rgba(147,51,234,0.08)' : 'var(--bg-card)',
                  border: `1px solid ${
                    highlighted
                      ? '#9333ea'
                      : checked
                        ? 'var(--accent)'
                        : 'var(--border)'
                  }`,
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: highlighted ? '0 0 0 3px rgba(147,51,234,0.25)' : undefined,
                  transition: 'all 0.2s',
                  // お気に入りは金色の左ボーダー+淡アンバー背景で一目で区別
                  // （ハイライト/選択中はそちらの強調を優先）
                  ...(record.favorite && !highlighted
                    ? {
                        borderLeft: '4px solid #f59e0b',
                        background: checked
                          ? 'rgba(108,99,255,0.08)'
                          : 'rgba(245,158,11,0.08)',
                      }
                    : {}),
                }}
              >
                {highlighted && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#9333ea',
                    }}
                  >
                    <span>📎 横断まとめで使用した記事</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHighlightClear?.();
                      }}
                      style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        color: '#9333ea',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(record.id)) next.delete(record.id);
                        else next.add(record.id);
                        return next;
                      });
                    }}
                    style={{ accentColor: 'var(--accent)', marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(108,99,255,0.15)',
                          color: 'var(--accent)',
                        }}
                      >
                        {record.analysis_label}
                      </span>
                      {record.folder && folderColor && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 999,
                            color: '#fff',
                            background: folderColor,
                            fontWeight: 500,
                          }}
                        >
                          📁 {record.folder}
                        </span>
                      )}
                      {record.favorite && (
                        <span
                          style={{
                            fontSize: 18,
                            lineHeight: 1,
                            filter: 'drop-shadow(0 1px 1px rgba(245,158,11,0.4))',
                          }}
                          title="お気に入り"
                        >
                          ⭐
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginBottom: 6,
                      }}
                    >
                      {new Date(record.created_at).toLocaleString('ja-JP')} ・
                      {record.char_count?.toLocaleString() ?? 0}文字
                    </div>
                    {/* ── アクションバー（タイトル直下に配置） ── */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(record)}
                        style={listBtnStyle()}
                      >
                        {expanded ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(record.id, record.content)}
                        style={{
                          ...listBtnStyle(),
                          background:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.12)'
                              : listBtnStyle().background,
                          borderColor:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.4)'
                              : 'var(--border)',
                          color: copiedId === record.id ? '#16a34a' : 'var(--text-secondary)',
                        }}
                      >
                        {copiedId === record.id ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadMd(record)}
                        disabled={downloadingId === record.id}
                        style={{
                          ...listBtnStyle(),
                          cursor:
                            downloadingId === record.id ? 'not-allowed' : 'pointer',
                          opacity: downloadingId === record.id ? 0.6 : 1,
                        }}
                      >
                        {downloadingId === record.id
                          ? '⏳ タイトル生成中...'
                          : '📥 MD'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(record.id)}
                        style={
                          record.favorite
                            ? {
                                ...listBtnStyle(),
                                background: '#fef3c7',
                                border: '1px solid #f59e0b',
                                color: '#b45309',
                                fontWeight: 700,
                              }
                            : listBtnStyle()
                        }
                      >
                        {record.favorite ? '⭐ 解除' : '☆ お気に入り'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          editingId === record.id
                            ? setEditingId(null)
                            : startEdit(record)
                        }
                        style={{
                          ...listBtnStyle(),
                          background:
                            editingId === record.id
                              ? 'rgba(108,99,255,0.12)'
                              : listBtnStyle().background,
                          borderColor:
                            editingId === record.id
                              ? 'var(--accent)'
                              : 'var(--border)',
                          color:
                            editingId === record.id
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {editingId === record.id ? '✏️ 編集中' : '✏️ 編集'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        style={{
                          ...listBtnStyle(),
                          color: '#ef4444',
                          marginLeft: 'auto',
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>
                    {expanded ? (
                      <div
                        style={{
                          padding: 10,
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          maxHeight: 400,
                          overflowY: 'auto',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          position: 'relative',
                        }}
                      >
                        {/* 展開時のみ右上 sticky な閉じるボタン */}
                        <div
                          style={{
                            position: 'sticky',
                            top: 4,
                            float: 'right',
                            zIndex: 5,
                            marginLeft: 'auto',
                            marginBottom: -28,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 11,
                              fontWeight: 500,
                              background: 'rgba(255, 255, 255, 0.92)',
                              color: '#374151',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                              backdropFilter: 'blur(4px)',
                              WebkitBackdropFilter: 'blur(4px)',
                              whiteSpace: 'nowrap',
                            }}
                            title="このアイテムを閉じる"
                          >
                            ▲ 閉じる
                          </button>
                        </div>
                        {/* 編集モード: タイトルinput + 本文textarea（生Markdown）。
                            通常時: 保存済み結果を Markdown リッチ描画 */}
                        {editingId === record.id ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="タイトル"
                              style={{
                                width: '100%',
                                fontSize: 16,
                                fontWeight: 700,
                                padding: 8,
                                marginBottom: 8,
                                boxSizing: 'border-box',
                                background: 'var(--input-bg, var(--bg-primary))',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                              }}
                            />
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              placeholder="本文（Markdown）"
                              style={{
                                width: '100%',
                                minHeight: 300,
                                fontSize: 14,
                                lineHeight: 1.6,
                                padding: 10,
                                boxSizing: 'border-box',
                                background: 'var(--input-bg, var(--bg-primary))',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                              }}
                            />
                            <div
                              style={{ display: 'flex', gap: 8, marginTop: 8 }}
                            >
                              <button
                                type="button"
                                onClick={() => saveEdit(record.id)}
                                disabled={editSaving}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  border: 'none',
                                  background: editSaving
                                    ? '#9ca3af'
                                    : 'var(--accent)',
                                  color: '#fff',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {editSaving ? '⏳ 保存中...' : '💾 保存'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={editSaving}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: 13,
                                  fontWeight: 500,
                                  borderRadius: 8,
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg-card)',
                                  color: 'var(--text-secondary)',
                                  cursor: editSaving ? 'not-allowed' : 'pointer',
                                }}
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="markdown-body"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(record.content) }}
                          />
                        )}
                        {/* 📥 元の入力テキスト（紐付け表示）。入力はユーザーの生テキストなので
                            renderMarkdown には流さず pre-wrap の生表示にする */}
                        {record.has_input && (
                          <div
                            style={{
                              marginTop: 12,
                              borderTop: '1px dashed var(--border)',
                              paddingTop: 10,
                            }}
                          >
                            {/* 見出し行: 文字数 + 表示トグル + コピー（デフォルト折りたたみ） */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: inputTextOpen[record.id] ? 6 : 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                📥 元の入力テキスト（{(record.input_char_count ?? 0).toLocaleString()}文字）
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleInputText(record.id)}
                                style={listBtnStyle()}
                              >
                                {inputTextOpen[record.id] ? '▲ 閉じる' : '▼ 表示'}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyInputText(record.id)}
                                disabled={copyingInputId === record.id}
                                style={{
                                  ...listBtnStyle(),
                                  cursor:
                                    copyingInputId === record.id
                                      ? 'not-allowed'
                                      : 'pointer',
                                  opacity: copyingInputId === record.id ? 0.6 : 1,
                                }}
                              >
                                {copyingInputId === record.id ? '⏳ 取得中...' : '📋 コピー'}
                              </button>
                            </div>
                            {inputTextOpen[record.id] &&
                              (inputTextLoading[record.id] ? (
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  読み込み中...
                                </div>
                              ) : (
                                <div
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                                    padding: 10,
                                    borderRadius: 8,
                                    maxHeight: 300,
                                    overflowY: 'auto',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {loadedInputTexts[record.id] ||
                                    '（入力テキストを取得できませんでした）'}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {record.content}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function categoryCardStyle(active: boolean): React.CSSProperties {
  // 1行コンパクト表示: アイコン・名前・件数を横並びに詰める
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(108,99,255,0.08)' : 'var(--bg-card)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: 0,
  };
}

function listBtnStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

