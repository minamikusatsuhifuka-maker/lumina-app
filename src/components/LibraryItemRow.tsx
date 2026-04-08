'use client';

import { useRef, useEffect } from 'react';

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
};

interface Props {
  item: any;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  mergeMode: boolean;
  selected: boolean;
  onSelectToggle: (id: string, checked: boolean) => void;
  onFavoriteToggle: (item: any) => void;
  onDelete: (id: string) => void;
  onEdit: (item: any) => void;
  onExportTxt: (item: any) => void;
  onExportMd: (item: any) => void;
  onExportPdf: (item: any) => void;
  onUseInWrite: (item: any) => void;
  onStartTagEdit: (item: any) => void;
  onExpandToggle: (id: string) => void;
  isExpanded: boolean;
  onMoveToFolder: (item: any) => void;
}

export function LibraryItemRow({
  item, openMenuId, setOpenMenuId,
  mergeMode, selected, onSelectToggle,
  onFavoriteToggle, onDelete,
  onExportTxt, onExportMd, onExportPdf,
  onUseInWrite, onStartTagEdit,
  onExpandToggle, isExpanded,
  onMoveToFolder,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const groupName = item.group_name || '未分類';
  const config = CATEGORY_CONFIG[groupName] ?? { icon: '📄', badgeBg: 'rgba(156,163,175,0.1)', badgeColor: '#9ca3af' };
  const isMenuOpen = openMenuId === item.id;

  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen, setOpenMenuId]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 10,
      border: `1px solid ${item.is_favorite ? 'rgba(245,166,35,0.3)' : 'var(--border)'}`,
      background: 'var(--bg-secondary)',
      cursor: 'pointer',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card, var(--bg-secondary))')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
    >
      {mergeMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelectToggle(item.id, e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
      )}

      <div style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
        background: config.badgeBg,
      }}>
        {config.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }} onClick={() => onExpandToggle(item.id)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {item.is_favorite ? <span style={{ color: '#f5a623', fontSize: 12 }}>★</span> : null}
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
          </span>
          {item.folder_name && (
            <span style={{ fontSize: 10, padding: '0 6px', borderRadius: 10, background: 'rgba(108,99,255,0.08)', color: '#6c63ff' }}>
              📁 {item.folder_name}
            </span>
          )}
          {item.tags && item.tags.split(',').filter(Boolean).slice(0, 3).map((tag: string) => (
            <span key={tag.trim()} style={{
              fontSize: 10, padding: '0 6px', borderRadius: 10,
              background: config.badgeBg, color: config.badgeColor,
            }}>
              #{tag.trim()}
            </span>
          ))}
        </div>
      </div>

      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : item.id); }}
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', color: 'var(--text-muted)',
            fontSize: 14, cursor: 'pointer',
          }}
        >
          ⋯
        </button>

        {isMenuOpen && (
          <div style={{
            position: 'absolute', right: 0, top: 32, zIndex: 50,
            width: 180, background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            padding: '4px 0', fontSize: 13,
          }}>
            {[
              { label: item.is_favorite ? '★ お気に入り解除' : '☆ お気に入りに追加', action: () => onFavoriteToggle(item) },
              { label: '📁 フォルダに移動', action: () => onMoveToFolder(item) },
              { label: '✍️ 文章作成に使う', action: () => onUseInWrite(item) },
              { label: '🏷 タグ・グループ編集', action: () => onStartTagEdit(item) },
              null,
              { label: '📄 TXT', action: () => onExportTxt(item) },
              { label: '📝 Markdown', action: () => onExportMd(item) },
              { label: '📄 PDF', action: () => onExportPdf(item) },
              null,
              { label: '🗑 削除', action: () => onDelete(item.id), color: '#ff6b6b' },
            ].map((entry, i) =>
              entry === null ? (
                <div key={`sep-${i}`} style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              ) : (
                <button
                  key={entry.label}
                  onClick={e => { e.stopPropagation(); entry.action(); setOpenMenuId(null); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: entry.color || 'var(--text-secondary)', fontSize: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {entry.label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
