'use client';

import { useEffect, useState, useMemo } from 'react';
import FeatureDefaultContextSelector, { FEATURE_OPTIONS } from '@/components/FeatureDefaultContextSelector';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { triggerDownload } from '@/lib/download';
import { markdownToReadableText } from '@/lib/markdownToText';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';

type ContextSave = {
  id: number;
  topic: string;
  context_text: string;
  research_text: string | null;
  tags: string[] | null;
  created_at: string;
  is_favorite?: boolean;
};

// 生成元（どのメニューで作られたか）をタグからベストエフォート推定して人間可読ラベルに。
// context_saves は概ね「ディープリサーチ → コンテキスト最適化 → 保存」由来。batch タグがあればバッチ実行。
function originLabel(tags: string[] | null): { icon: string; label: string } {
  const ts = tags ?? [];
  if (ts.some((t) => t.startsWith('batch:'))) return { icon: '📚', label: 'ディープリサーチ（バッチ）' };
  return { icon: '🔭', label: 'ディープリサーチ' };
}

export default function ContextLibraryPanel() {
  const [items, setItems] = useState<ContextSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  // お気に入り絞り込み（コンテキストライブラリ内で完結＝テキスト分析とは別管理）
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // 下部アクション（文章作成へ〜要約・詳細）のアコーディオン開閉。カードごと・既定は閉（誤発火防止）。
  const [actionsOpen, setActionsOpen] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // テキスト/MD ダウンロード中のID（タイトル生成中の同時押し防止。txt/MD共用）
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // カード編集（タイトル=topic + 本文=context_text。同時編集は1件のみ）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // 全画面リーダーで表示中のアイテム（null=非表示）
  const [readerItem, setReaderItem] = useState<ContextSave | null>(null);
  // contextSaveId -> 登録済み機能キー配列 のマップ
  const [defaultMap, setDefaultMap] = useState<Record<number, string[]>>({});
  // 要約・詳細ボタンの処理中／完了状態
  const [processingId, setProcessingId] = useState<{ id: number; mode: 'summary' | 'detail' } | null>(null);
  const [processedId, setProcessedId] = useState<{ id: number; mode: 'summary' | 'detail' } | null>(null);
  const [toast, setToast] = useState<string>('');

  // URLパラメータから batchId を取得
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const batch = params.get('batch');
      if (batch) {
        setTagFilter(`batch:${batch}`);
        setBatchFilter(batch);
      }
    } catch {}
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/context-saves?limit=100');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch {
      // 取得失敗時は空配列のまま
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  // items 取得後、各カードに対する「デフォルト登録機能マップ」を一括取得
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      const map: Record<number, string[]> = {};
      await Promise.all(items.map(async (it) => {
        try {
          const res = await fetch(`/api/feature-default-contexts/by-context-save?contextSaveId=${it.id}`);
          if (res.ok) {
            const data = await res.json();
            map[it.id] = data.featureKeys ?? [];
          }
        } catch {
          map[it.id] = [];
        }
      }));
      if (!cancelled) setDefaultMap(map);
    })();
    return () => { cancelled = true; };
  }, [items]);

  // タグ一覧を集計
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => (it.tags || []).forEach(t => set.add(t)));
    return Array.from(set);
  }, [items]);

  // フィルター適用
  const filtered = useMemo(() => {
    return items.filter(it => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.topic.toLowerCase().includes(q) && !it.context_text.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
      if (favoriteOnly && !it.is_favorite) return false;
      return true;
    });
  }, [items, search, tagFilter, favoriteOnly]);

  const handleCopy = async (item: ContextSave) => {
    try {
      // コピー内容にも LaTeX 正規化を適用（テキスト分析側と挙動を揃える）
      await copyToClipboard(sanitizeLatex(item.context_text));
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  // 一時トースト表示の共通ヘルパー
  const flashToast = (msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // .txt ダウンロード（テキスト分析 handleDownloadTxt 流用。context_saves 対象）。
  // AIタイトル生成 + Markdown記号を除去した読みやすいプレーンテキストで書き出す。
  const handleDownloadTxt = async (item: ContextSave) => {
    if (downloadingId !== null) return; // 同時押し防止（MDと共用）
    setDownloadingId(item.id);
    try {
      const label = 'コンテキスト';
      const fallback = item.topic || label;
      const autoTitle = await generateTitleWithTimeout(item.context_text, label, fallback);
      const safeTitle = sanitizeFilename(autoTitle);
      const txtContent = `${autoTitle}\n\n${sanitizeLatex(item.context_text)}`;
      triggerDownload(
        `${safeTitle}_${yyyymmdd()}.txt`,
        markdownToReadableText(txtContent),
        'text/plain;charset=utf-8',
      );
      flashToast('✅ テキストファイルをダウンロードしました');
    } catch {
      flashToast('❌ ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  // .md ダウンロード（テキスト分析 handleDownloadMd 流用。context_saves 対象）。
  const handleDownloadMd = async (item: ContextSave) => {
    if (downloadingId !== null) return; // 同時押し防止（txtと共用）
    setDownloadingId(item.id);
    try {
      const label = 'コンテキスト';
      const fallback = item.topic || label;
      const autoTitle = await generateTitleWithTimeout(item.context_text, label, fallback);
      const safeTitle = sanitizeFilename(autoTitle);
      const mdContent = `# ${autoTitle}\n\n${sanitizeLatex(item.context_text)}`;
      triggerDownload(
        `${safeTitle}_${yyyymmdd()}.md`,
        mdContent,
        'text/markdown;charset=utf-8',
      );
      flashToast('✅ MDファイルをダウンロードしました');
    } catch {
      flashToast('❌ ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  // 「✏️ 編集」: 現在の topic/context_text を編集 state にコピーして編集モードへ（展開も保証）
  const startEdit = (item: ContextSave) => {
    setExpandedId(item.id);
    setEditingId(item.id);
    setEditTitle(item.topic || '');
    setEditContent(item.context_text);
  };

  // 編集内容を保存（PATCH action=update。topic + context_text のみ更新）
  const saveEdit = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      flashToast('❌ タイトルと本文は空にできません');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/context-saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          topic: editTitle.trim(),
          contextText: editContent.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const newTopic = editTitle.trim();
      const newContent = editContent.trim();
      setItems(prev =>
        prev.map(it => (it.id === id ? { ...it, topic: newTopic, context_text: newContent } : it)),
      );
      setEditingId(null);
      flashToast('✅ 更新しました');
    } catch {
      // 失敗時は編集モードを維持（入力内容を失わない）
      flashToast('❌ 更新に失敗しました', 4000);
    } finally {
      setEditSaving(false);
    }
  };

  // お気に入りトグル（楽観更新 → 失敗時ロールバック）。コンテキストライブラリ専用。
  const handleToggleFavorite = async (item: ContextSave) => {
    const next = !item.is_favorite;
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, is_favorite: next } : it));
    try {
      const res = await fetch('/api/context-saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite', id: item.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, is_favorite: !next } : it));
      setToast('❌ お気に入りの更新に失敗しました');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('このコンテキストを削除しますか？')) return;
    try {
      const res = await fetch(`/api/context-saves?id=${id}`, { method: 'DELETE' });
      if (res.ok) setItems(prev => prev.filter(it => it.id !== id));
    } catch {}
  };

  // 要約／詳細生成 → text_analysis_saves に保存
  const handleSummarize = async (item: ContextSave, mode: 'summary' | 'detail') => {
    if (processingId) return; // 多重押下防止
    setProcessingId({ id: item.id, mode });

    try {
      // 1) AI生成
      const genRes = await fetch('/api/context-library/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          title: item.topic ?? '無題',
          content: item.context_text ?? '',
          tags: item.tags ?? [],
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error ?? `生成に失敗しました (HTTP ${genRes.status})`);
      }

      const genData = await genRes.json();
      const generated: string = genData.generated;

      // 2) 保存（text_analysis_saves）
      const label = mode === 'summary' ? '要約' : '詳細';
      const analysisLabel = mode === 'summary' ? '要約・概要' : '詳細解説';
      const folder = mode === 'summary' ? 'コンテキスト要約' : 'コンテキスト詳細';

      const saveRes = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${item.topic ?? '無題'} - ${label}`,
          content: generated,
          analysisType: mode,
          analysisLabel,
          folder,
          tags: ['コンテキスト由来', ...(item.tags ?? [])],
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.error ?? `保存に失敗しました (HTTP ${saveRes.status})`);
      }

      // 3) 完了表示
      setProcessedId({ id: item.id, mode });
      setToast(`✅ テキスト分析・カテゴライズに「${label}」として保存しました`);
      setTimeout(() => {
        setProcessedId(null);
        setToast('');
      }, 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast(`❌ ${message}`);
      setTimeout(() => setToast(''), 4000);
    } finally {
      setProcessingId(null);
    }
  };

  const goToTool = (item: ContextSave, tool: 'write' | 'sns-post' | 'lp' | 'materials') => {
    try {
      sessionStorage.setItem('lumina_context_text', item.context_text);
      sessionStorage.setItem('lumina_context_topic', item.topic);
    } catch {}
    const toolPath: Record<typeof tool, string> = {
      'write': '/dashboard/write',
      'sns-post': '/dashboard/sns-post',
      'lp': '/dashboard/lp-generator',
      'materials': '/dashboard/materials',
    };
    window.location.href = `${toolPath[tool]}?contextId=${item.id}`;
  };

  const fmtDate = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return s;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🧠 コンテキストライブラリ</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>AIに読み込ませるコンテキストを管理します。文章作成・SNS投稿・LP作成・資料作成にワンクリックで活用できます。</p>
      </div>

      {batchFilter && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,184,0.12))',
          border: '1px solid var(--border-accent)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap' as const,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            🏷️ バッチジョブ #{batchFilter} の結果のみ表示中
          </div>
          <button
            onClick={() => { setBatchFilter(null); setTagFilter(''); }}
            style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            ✕ フィルター解除
          </button>
        </div>
      )}

      {/* 検索・フィルターバー */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap' as const,
        alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="🔍 トピック名・内容で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">🏷️ すべてのタグ</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setFavoriteOnly(v => !v)}
          title="お気に入り登録したコンテキストだけを表示"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${favoriteOnly ? '#f59e0b' : 'var(--border)'}`,
            background: favoriteOnly ? '#f59e0b' : 'transparent',
            color: favoriteOnly ? '#fff' : 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⭐ お気に入り
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} / {items.length} 件
        </span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
            {items.length === 0 ? 'まだ保存されたコンテキストはありません' : '条件に一致するコンテキストがありません'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            ディープリサーチ実行後、「🧠 コンテキストとして最適化」→「💾 保存」でこちらに追加されます。
          </div>
        </div>
      )}

      {/* 要約・詳細生成のトースト表示 */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2937',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 8,
          fontSize: 14,
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {filtered.map(item => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              style={{
                background: item.is_favorite
                  ? 'rgba(245,158,11,0.08)'
                  : 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
                border: '1px solid var(--border)',
                // お気に入りは金色の左ボーダーで一目で区別
                ...(item.is_favorite ? { borderLeft: '4px solid #f59e0b' } : {}),
                borderRadius: 14,
                padding: 18,
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 8, flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.topic}
                  </div>
                  {/* 生成元バッジ（どのメニューから作られたか） */}
                  <div style={{ marginBottom: 4 }}>
                    {(() => {
                      const o = originLabel(item.tags);
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 10px', borderRadius: 10 }}>
                          生成元: {o.icon} {o.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    📅 {fmtDate(item.created_at)}
                    {item.tags && item.tags.length > 0 && (
                      <span style={{ marginLeft: 12 }}>
                        {item.tags.map(t => (
                          <span key={t} style={{ background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 10, marginRight: 4, color: 'var(--text-secondary)' }}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 本文プレビューは非表示（A）。閲覧は「▼全文表示」/「⛶全画面」に集約。 */}

              {/* 登録済み機能のバッジ */}
              {(defaultMap[item.id]?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>📌 デフォルト登録中:</span>
                  {(defaultMap[item.id] ?? []).map(key => {
                    const f = FEATURE_OPTIONS.find(o => o.key === key);
                    if (!f) return null;
                    return (
                      <span key={key} style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>
                        {f.icon} {f.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* ── 共通操作バー（テキスト分析 SavedAnalysisList と並び・見た目・ラベルを完全統一）──
                  ▼全文表示 / ⛶全画面 / 📋コピー / ⬇テキスト / 📥MD / ☆お気に入り / ✏編集 / 🗑削除(右端)。
                  flex-wrap で自然に2行になる（テキスト分析と同一実装）。 */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  style={cardActionBtnStyle()}
                >
                  {expanded ? '▲ 閉じる' : '▼ 全文表示'}
                </button>
                <button
                  onClick={() => setReaderItem(item)}
                  title="全画面のリーダー表示で読む"
                  style={cardActionBtnStyle()}
                >
                  ⛶ 全画面
                </button>
                <button
                  onClick={() => handleCopy(item)}
                  style={{
                    ...cardActionBtnStyle(),
                    ...(copiedId === item.id
                      ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' }
                      : {}),
                  }}
                >
                  {copiedId === item.id ? '✅ コピー済み' : '📋 コピー'}
                </button>
                <button
                  onClick={() => handleDownloadTxt(item)}
                  disabled={downloadingId === item.id}
                  style={{
                    ...cardActionBtnStyle(),
                    cursor: downloadingId === item.id ? 'not-allowed' : 'pointer',
                    opacity: downloadingId === item.id ? 0.6 : 1,
                  }}
                >
                  {downloadingId === item.id ? '⏳ タイトル生成中...' : '⬇ テキスト'}
                </button>
                <button
                  onClick={() => handleDownloadMd(item)}
                  disabled={downloadingId === item.id}
                  style={{
                    ...cardActionBtnStyle(),
                    cursor: downloadingId === item.id ? 'not-allowed' : 'pointer',
                    opacity: downloadingId === item.id ? 0.6 : 1,
                  }}
                >
                  {downloadingId === item.id ? '⏳ タイトル生成中...' : '📥 MD'}
                </button>
                <button
                  onClick={() => handleToggleFavorite(item)}
                  title={item.is_favorite ? 'お気に入りを解除' : 'お気に入りに登録'}
                  style={
                    item.is_favorite
                      ? { ...cardActionBtnStyle(), background: '#fef3c7', border: '1px solid #f59e0b', color: '#b45309', fontWeight: 700 }
                      : cardActionBtnStyle()
                  }
                >
                  {item.is_favorite ? '⭐ 解除' : '☆ お気に入り'}
                </button>
                <button
                  onClick={() =>
                    editingId === item.id ? setEditingId(null) : startEdit(item)
                  }
                  style={{
                    ...cardActionBtnStyle(),
                    ...(editingId === item.id
                      ? { background: 'rgba(108,99,255,0.12)', borderColor: 'var(--accent)', color: 'var(--accent)' }
                      : {}),
                  }}
                >
                  {editingId === item.id ? '✏️ 編集中' : '✏️ 編集'}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{ ...cardActionBtnStyle(), color: '#ef4444', marginLeft: 'auto' }}
                >
                  🗑 削除
                </button>
              </div>

              {/* 全文表示（カード内インライン展開）。編集モード時は topic/本文の編集フォーム。 */}
              {expanded && (
                <div
                  style={{
                    marginTop: 12,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  {editingId === item.id ? (
                    <div>
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
                          background: 'var(--bg-secondary)',
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
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={editSaving}
                          style={{
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: 'none',
                            background: editSaving ? '#9ca3af' : 'var(--accent)',
                            color: '#fff',
                            cursor: editSaving ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {editSaving ? '⏳ 保存中...' : '💾 保存'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={editSaving}
                          style={{
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 500,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            cursor: editSaving ? 'not-allowed' : 'pointer',
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 本文(AI生成Markdown)は共通レンダラで見出し・太字・箇条書きを描画（生記号を出さない）
                    <div
                      className="markdown-body"
                      style={{
                        maxHeight: 600,
                        overflowY: 'auto',
                        color: 'var(--text-primary)',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        lineHeight: 1.75,
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(item.context_text) }}
                    />
                  )}
                </div>
              )}

              {/* ── コンテキスト固有のアクション（活用する）。テキスト分析には無い別枠。── */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center', marginTop: 8 }}>
                {/* 活用する：下部アクションのアコーディオン開閉（既定閉・誤発火防止） */}
                <button
                  onClick={() => setActionsOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  title="文章作成・SNS投稿・LP作成・資料作成・要約・詳細を表示"
                  aria-expanded={!!actionsOpen[item.id]}
                  style={{
                    ...cardActionBtnStyle(),
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--border-accent)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                  }}
                >
                  {actionsOpen[item.id] ? '▲ 活用する' : '▼ 活用する'}
                </button>
                <FeatureDefaultContextSelector
                  contextSaveId={item.id}
                  initialRegistered={defaultMap[item.id] ?? []}
                  onChange={(keys) => setDefaultMap(prev => ({ ...prev, [item.id]: keys }))}
                />
              </div>

              {/* ── 下部アクション（アコーディオン格納・既定折りたたみ）──
                  「活用する」展開時のみ表示。各ボタンの機能・遷移・生成は無変更。 */}
              {actionsOpen[item.id] && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap' as const,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed var(--border)',
                  }}
                >
                  <button
                    onClick={() => goToTool(item, 'write')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✍️ 文章作成へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'sns-post')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📱 SNS投稿へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'lp')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📄 LP作成へ
                  </button>
                  <button
                    onClick={() => goToTool(item, 'materials')}
                    style={{ padding: '8px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    📊 資料作成へ
                  </button>
                  {/* 要約・詳細生成ボタン（AI生成 → text_analysis_saves へ保存） */}
                  <button
                    onClick={() => handleSummarize(item, 'summary')}
                    disabled={processingId !== null}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #a78bfa',
                      background: processingId?.id === item.id && processingId.mode === 'summary'
                        ? '#6b7280'
                        : (processedId?.id === item.id && processedId.mode === 'summary' ? '#10b981' : '#8b5cf6'),
                      color: '#fff',
                      cursor: processingId ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {processingId?.id === item.id && processingId.mode === 'summary'
                      ? '⏳ 生成中...'
                      : processedId?.id === item.id && processedId.mode === 'summary'
                      ? '✅ 保存済'
                      : '📝 要約'}
                  </button>
                  <button
                    onClick={() => handleSummarize(item, 'detail')}
                    disabled={processingId !== null}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #60a5fa',
                      background: processingId?.id === item.id && processingId.mode === 'detail'
                        ? '#6b7280'
                        : (processedId?.id === item.id && processedId.mode === 'detail' ? '#10b981' : '#3b82f6'),
                      color: '#fff',
                      cursor: processingId ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {processingId?.id === item.id && processingId.mode === 'detail'
                      ? '⏳ 生成中...'
                      : processedId?.id === item.id && processedId.mode === 'detail'
                      ? '✅ 保存済'
                      : '📖 詳細'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 全画面リーダー（コンテキスト本文を読み物表示） */}
      <FullscreenReader
        open={readerItem !== null}
        title={readerItem?.topic ?? '無題'}
        content={readerItem?.context_text ?? ''}
        onClose={() => setReaderItem(null)}
      />
    </div>
  );
}
