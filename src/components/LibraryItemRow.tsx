'use client';

import { useState } from 'react';

const CATEGORY_CONFIG: Record<string, { icon: string; badgeBg: string; badgeColor: string }> = {
  'Intelligence Hub':   { icon: '🧠', badgeBg: 'rgba(108,99,255,0.1)',  badgeColor: '#6c63ff' },
  'Web情報収集':         { icon: '🌐', badgeBg: 'rgba(34,197,94,0.1)',   badgeColor: '#22c55e' },
  'Web調査':            { icon: '🌐', badgeBg: 'rgba(34,197,94,0.1)',   badgeColor: '#22c55e' },
  'WEB調査':            { icon: '🌐', badgeBg: 'rgba(34,197,94,0.1)',   badgeColor: '#22c55e' },
  'note検索':           { icon: '📓', badgeBg: 'rgba(99,102,241,0.1)',  badgeColor: '#6366f1' },
  'ディープリサーチ':     { icon: '🔭', badgeBg: 'rgba(139,92,246,0.1)',  badgeColor: '#8b5cf6' },
  '文献検索':           { icon: '🔬', badgeBg: 'rgba(20,184,166,0.1)',  badgeColor: '#14b8a6' },
  '定期アラート':       { icon: '🔔', badgeBg: 'rgba(248,113,113,0.1)', badgeColor: '#f87171' },
  'アラート':           { icon: '🔔', badgeBg: 'rgba(248,113,113,0.1)', badgeColor: '#f87171' },
  'AI分析エンジン':     { icon: '🧩', badgeBg: 'rgba(249,115,22,0.1)',  badgeColor: '#f97316' },
  '分析':               { icon: '🧩', badgeBg: 'rgba(249,115,22,0.1)',  badgeColor: '#f97316' },
  '経営インテリジェンス': { icon: '💼', badgeBg: 'rgba(245,158,11,0.1)',  badgeColor: '#f59e0b' },
  '経営':               { icon: '💼', badgeBg: 'rgba(245,158,11,0.1)',  badgeColor: '#f59e0b' },
  '経営戦略':           { icon: '💼', badgeBg: 'rgba(245,158,11,0.1)',  badgeColor: '#f59e0b' },
  '業界レポート':       { icon: '📊', badgeBg: 'rgba(59,130,246,0.1)',  badgeColor: '#3b82f6' },
  'AIペルソナ':         { icon: '🤖', badgeBg: 'rgba(0,212,184,0.1)',   badgeColor: '#00d4b8' },
  'ブレスト':           { icon: '💡', badgeBg: 'rgba(234,179,8,0.1)',   badgeColor: '#eab308' },
  '文章作成':           { icon: '✍️', badgeBg: 'rgba(99,102,241,0.1)',  badgeColor: '#6366f1' },
  '議事録整理':         { icon: '📝', badgeBg: 'rgba(168,162,158,0.1)', badgeColor: '#a8a29e' },
  'Gensparkへ出力':     { icon: '🎯', badgeBg: 'rgba(236,72,153,0.1)', badgeColor: '#ec4899' },
  'ワークフロー':       { icon: '⚡', badgeBg: 'rgba(234,179,8,0.1)',   badgeColor: '#eab308' },
  '統合レポート':       { icon: '🔗', badgeBg: 'rgba(108,99,255,0.1)', badgeColor: '#6c63ff' },
  'バズりパターン辞書': { icon: '📖', badgeBg: 'rgba(245,158,11,0.1)',  badgeColor: '#f59e0b' },
  'スタッフ育成資料':   { icon: '📚', badgeBg: 'rgba(168,85,247,0.1)',  badgeColor: '#a855f7' },
  'バズり分析':         { icon: '📊', badgeBg: 'rgba(236,72,153,0.1)',  badgeColor: '#ec4899' },
};

// metadata は TEXT 格納（JSON.stringify）または既にパース済みオブジェクトのどちらでも対応
function parseMetadata(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

// 既存呼び出し側との互換性のため、未使用 props も受け取れる形のままにする
interface Props {
  item: any;
  openMenuId?: string | null;
  setOpenMenuId?: (id: string | null) => void;
  mergeMode: boolean;
  selected: boolean;
  onSelectToggle: (id: string, checked: boolean) => void;
  onFavoriteToggle: (item: any) => void;
  onDelete: (id: string) => void;
  onEdit?: (item: any) => void;
  onExportTxt?: (item: any) => void;
  onExportMd: (item: any) => void;
  onExportPdf?: (item: any) => void;
  onUseInWrite?: (item: any) => void;
  onStartTagEdit?: (item: any) => void;
  onExpandToggle: (id: string) => void;
  isExpanded: boolean;
  onMoveToFolder?: (item: any) => void;
  // AIタグクリック→検索欄に流す（オプション）
  onTagClick?: (tag: string) => void;
}

export function LibraryItemRow({
  item,
  mergeMode,
  selected,
  onSelectToggle,
  onFavoriteToggle,
  onDelete,
  onExportMd,
  onExpandToggle,
  isExpanded,
  onTagClick,
}: Props) {
  const meta = parseMetadata(item.metadata);
  const subCategory: string | undefined = typeof meta?.subCategory === 'string' ? meta.subCategory : undefined;
  const aiTags: string[] = Array.isArray(meta?.tags)
    ? meta.tags.filter((t: any): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  // 分類失敗情報（subCategory が無く、かつ classifyError がある場合のみ表示）
  const classifyError: string | undefined =
    typeof meta?.classifyError === 'string' && meta.classifyError.trim().length > 0
      ? meta.classifyError
      : undefined;
  const classifyErrorDetail: string | undefined =
    typeof meta?.classifyErrorDetail === 'string' ? meta.classifyErrorDetail : undefined;
  const classifyAttempts: number | undefined =
    typeof meta?.classifyAttempts === 'number' ? meta.classifyAttempts : undefined;
  const hasClassifyError = !!classifyError && !subCategory;
  const [copied, setCopied] = useState(false);

  const groupName = item.group_name || '未分類';
  const config = CATEGORY_CONFIG[groupName] ?? {
    icon: '📄',
    badgeBg: 'rgba(156,163,175,0.1)',
    badgeColor: '#9ca3af',
  };

  const content = item.content || '';
  const charCount = content.length;
  const previewText = content.slice(0, 180);

  const tagsArr: string[] = Array.isArray(item.tags)
    ? item.tags
    : typeof item.tags === 'string'
      ? item.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  const createdDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'numeric', day: 'numeric',
      })
    : '';

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: selected
          ? '2px solid var(--accent)'
          : item.is_favorite
            ? '1px solid rgba(245,166,35,0.4)'
            : '1px solid var(--border)',
        transition: 'border-color 0.15s',
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        {mergeMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectToggle(item.id, e.target.checked)}
            style={{ marginTop: 4, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
          />
        )}
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
            background: config.badgeBg,
          }}
        >
          {config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {item.is_favorite ? (
              <span style={{ color: '#f5a623', fontSize: 13 }}>★</span>
            ) : null}
            <strong
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
              }}
            >
              {item.title || '(無題)'}
            </strong>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                background: config.badgeBg,
                color: config.badgeColor,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {groupName}
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {createdDate && <span>{createdDate}</span>}
            <span>・</span>
            <span>{charCount.toLocaleString()}文字</span>
            {item.folder_name && (
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: 10,
                  background: 'rgba(108,99,255,0.08)',
                  color: '#6c63ff',
                  fontSize: 10,
                }}
              >
                📁 {item.folder_name}
              </span>
            )}
            {tagsArr.slice(0, 5).map((t) => (
              <span
                key={t}
                style={{
                  padding: '1px 8px',
                  borderRadius: 10,
                  background: config.badgeBg,
                  color: config.badgeColor,
                  fontSize: 10,
                }}
              >
                #{t}
              </span>
            ))}
          </div>

          {/* AI 自動分類: サブカテゴリ + AIタグ / または分類失敗バッジ */}
          {(subCategory || aiTags.length > 0 || hasClassifyError) && (
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {subCategory ? (
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 12,
                    background: 'rgba(139,92,246,0.12)',
                    color: '#8b5cf6',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                  title="AIが付与したサブカテゴリ"
                >
                  🏷 {subCategory}
                </span>
              ) : hasClassifyError ? (
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.12)',
                    color: '#dc2626',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'help',
                  }}
                  title={classifyErrorDetail || classifyError}
                >
                  🚫 {classifyError}
                  {classifyAttempts && classifyAttempts > 1 ? ` (${classifyAttempts}回試行)` : ''}
                </span>
              ) : null}
              {aiTags.slice(0, 6).map((t, idx) => (
                <span
                  key={`ai-${idx}`}
                  onClick={
                    onTagClick
                      ? (e) => {
                          e.stopPropagation();
                          onTagClick(t);
                        }
                      : undefined
                  }
                  style={{
                    padding: '1px 8px',
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.08)',
                    color: '#3b82f6',
                    fontSize: 10,
                    cursor: onTagClick ? 'pointer' : 'default',
                  }}
                  title={onTagClick ? `「${t}」で検索` : undefined}
                >
                  #{t}
                </span>
              ))}
              {aiTags.length > 6 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  +{aiTags.length - 6}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* プレビュー or 全文 */}
      <div
        style={{
          padding: 12,
          background: 'var(--bg-primary)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: isExpanded ? 600 : 110,
          overflowY: isExpanded ? 'auto' : 'hidden',
          position: 'relative',
        }}
      >
        {isExpanded ? content : previewText}
        {!isExpanded && charCount > 180 && '...'}
      </div>

      {/* アクションバー */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => onExpandToggle(item.id)}
          style={btnStyle}
        >
          {isExpanded ? '▲ 閉じる' : '▼ 全文表示'}
        </button>
        <button type="button" onClick={handleCopy} style={btnStyle}>
          📋 {copied ? 'コピー済' : 'コピー'}
        </button>
        <button type="button" onClick={() => onExportMd(item)} style={btnStyle}>
          📥 MDダウンロード
        </button>
        <button
          type="button"
          onClick={() => onFavoriteToggle(item)}
          style={{
            ...btnStyle,
            color: item.is_favorite ? '#f59e0b' : 'var(--text-secondary)',
            borderColor: item.is_favorite ? 'rgba(245,158,11,0.4)' : 'var(--border)',
            background: item.is_favorite ? 'rgba(245,158,11,0.08)' : 'var(--bg-primary)',
          }}
        >
          {item.is_favorite ? '⭐ お気に入り' : '☆ お気に入り'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('このアイテムを削除しますか？')) {
              onDelete(item.id);
            }
          }}
          style={{
            ...btnStyle,
            color: '#ef4444',
            borderColor: 'rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.04)',
            marginLeft: 'auto',
          }}
        >
          🗑 削除
        </button>
      </div>
    </div>
  );
}
