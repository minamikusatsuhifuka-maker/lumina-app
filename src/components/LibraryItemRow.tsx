'use client';

import { useState } from 'react';
import { copyRichMarkdown } from '@/lib/rich-copy';

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
  // 231: /api/library の対象外の行（Kindleウィザード①のテキスト分析=ana-行）では
  // 未指定にでき、未指定のボタンは描画しない
  onFavoriteToggle?: (item: any) => void;
  onDelete?: (id: string) => void;
  onEdit?: (item: any) => void;
  onExportTxt?: (item: any) => void;
  onExportMd?: (item: any) => void;
  onExportPdf?: (item: any) => void;
  onUseInWrite?: (item: any) => void;
  onStartTagEdit?: (item: any) => void;
  onExpandToggle: (id: string) => void;
  isExpanded: boolean;
  onMoveToFolder?: (item: any) => void;
  // AIタグクリック→検索欄に流す（オプション）
  onTagClick?: (tag: string) => void;
  // compact = ディープリサーチタブの3〜4列グリッド用（タイトル/日付/文字数のみ・操作はホバー表示）
  variant?: 'default' | 'compact';
  // 252: 所属マイフォルダのバッジ（呼び出し側が組み立てて渡す＝この部品はフォルダ機構に依存しない）
  folderBadges?: React.ReactNode;
  // 252: ☆から分類パネルを開く。渡されたときは onFavoriteToggle の代わりにこちらを呼ぶ
  // （このファイルの item は既存コード互換で any だが、新しい口は必要な形だけを受ける）
  onFavoriteClick?: (item: { id: string; is_favorite?: number }, rect: DOMRect) => void;
  // 282: ⛶全画面（共通部品 FullscreenReader）を開く。渡されたときだけボタンを描画する
  //（R-88 オプトイン＝渡さない既存の呼び出し元（Kindleウィザード①）は見た目・挙動が変わらない）。
  // 全画面ビュー自体はこの部品が持たず、呼び出し元が1つだけマウントする（一覧の前後移動を持てる）
  onFullscreen?: (item: any) => void;
  // 282: タイトル・メタ情報のクリックでも展開する（274の🧠AI参照素材と同じ挙動に揃える）。
  // 当たり判定は操作要素と本文の外側だけ（R-81）。既定 off＝既存の呼び出し元は無変更
  clickToExpand?: boolean;
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
  variant = 'default',
  folderBadges,
  onFavoriteClick,
  onFullscreen,
  clickToExpand = false,
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

  // 229B: Kindle→note展開の相互リンク（metadata.sourceBookId → ?bookId= でウィザード復帰）
  const sourceBookId = typeof meta?.sourceBookId === 'number' ? meta.sourceBookId : undefined;

  const groupName = item.group_name || '未分類';
  const config = CATEGORY_CONFIG[groupName] ?? {
    icon: '📄',
    badgeBg: 'rgba(156,163,175,0.1)',
    badgeColor: '#9ca3af',
  };

  const content = item.content || '';
  // 231: 一覧APIが本文非返却の行（テキスト分析）は char_count 列を優先する
  const charCount = typeof item.char_count === 'number' ? item.char_count : content.length;
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
      await copyRichMarkdown(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  // 282/R-81: 展開の当たり判定はタイトル・メタ情報の領域だけ。ボタン類・リンク・本文は含めず、
  // その中の操作は stopPropagation で上へ伝えない（領域限定と併せた二重の守り）
  const stopCardClick = (e: React.MouseEvent) => e.stopPropagation();
  const expandZoneProps: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown> = clickToExpand
    ? {
        className: 'card-expand-zone',
        'data-library-expand-zone': item.id,
        role: 'button',
        tabIndex: 0,
        'aria-expanded': isExpanded,
        title: isExpanded ? 'クリックで本文を閉じる' : 'クリックで本文を開く',
        onClick: () => onExpandToggle(item.id),
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault(); // Space での画面スクロールを止める
          onExpandToggle(item.id);
        },
      }
    : {};

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  };

  /* ── compact: ディープリサーチタブの3〜4列グリッド用カード ── */
  if (variant === 'compact') {
    const compactBtnStyle: React.CSSProperties = {
      ...btnStyle,
      padding: '3px 8px',
      fontSize: 10,
    };
    return (
      <div
        className="group"
        style={{
          padding: 12,
          background: 'var(--bg-secondary)',
          borderRadius: 10,
          border: selected
            ? '2px solid var(--accent)'
            : item.is_favorite
              ? '1px solid rgba(245,166,35,0.4)'
              : '1px solid var(--border)',
          transition: 'border-color 0.15s',
          height: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* 282: ここ（タイトル・フォルダ・日付/文字数）が本文の展開領域（clickToExpand 時のみ有効）。
            入れ子の flex column は外側と同じ gap にして、有効/無効で見た目が変わらないようにする */}
        <div {...expandZoneProps} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* タイトル行（★は常時表示） */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
          {mergeMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectToggle(item.id, e.target.checked)}
              onClick={stopCardClick}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
          )}
          {item.is_favorite ? (
            <span style={{ color: '#f5a623', fontSize: 13, flexShrink: 0 }}>★</span>
          ) : null}
          <strong
            className="line-clamp-2"
            title={item.title || '(無題)'}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              wordBreak: 'break-word',
              lineHeight: 1.5,
              minWidth: 0,
            }}
          >
            {item.title || '(無題)'}
          </strong>
        </div>

        {/* 252: 所属マイフォルダ。コンパクトカードなので1行に収め、溢れは隠す */}
        {folderBadges && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'nowrap',
              overflow: 'hidden',
              maxHeight: 20,
              minWidth: 0,
            }}
          >
            {folderBadges}
          </div>
        )}

        {/* 日付・文字数のみ */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {createdDate && <span>{createdDate}</span>}
          <span>・</span>
          <span>{charCount.toLocaleString()}文字</span>
          {/* 229B: Kindle→note展開で保存された記事は元の本へ復帰できる */}
          {sourceBookId !== undefined && (
            <a
              href={`/dashboard/kindle-wizard?bookId=${sourceBookId}`}
              title="この記事の元になったKindle本をウィザードで開く"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              📖 元の本
            </a>
          )}
        </div>
        </div>

        {/* 操作ボタン: ホバー時オーバーレイ表示（タッチ端末は常時表示） */}
        <div
          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
          onClick={stopCardClick}
          style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto' }}
        >
          {/* 4列時(xl〜)はアイコンのみ・ツールチップで機能名を補う */}
          <button
            type="button"
            onClick={() => onExpandToggle(item.id)}
            style={compactBtnStyle}
            title={isExpanded ? '閉じる' : '全文表示'}
          >
            {isExpanded ? '▲' : '▼'}
            <span className="xl:hidden">{isExpanded ? ' 閉じる' : ' 全文表示'}</span>
          </button>
          {/* 282: 狭い列幅では読みにくいため、全画面リーダー（整形表示）への導線を置く */}
          {onFullscreen && content && (
            <button
              type="button"
              data-library-fullscreen={item.id}
              onClick={() => onFullscreen(item)}
              style={compactBtnStyle}
              title="全画面のリーダー表示で読む"
            >
              ⛶<span className="xl:hidden"> 全画面</span>
            </button>
          )}
          {content && (
            <button type="button" onClick={handleCopy} style={compactBtnStyle} title="本文をコピー">
              {copied ? '✓' : '📋'}
              <span className="xl:hidden">{copied ? ' コピー済' : ' コピー'}</span>
            </button>
          )}
          {onExportMd && (
            <button type="button" onClick={() => onExportMd(item)} style={compactBtnStyle} title="Markdownをダウンロード">
              📥<span className="xl:hidden"> MD</span>
            </button>
          )}
          {(onFavoriteClick || onFavoriteToggle) && (
            <button
              type="button"
              data-favorite-button={item.id}
              onClick={(e) =>
                onFavoriteClick
                  ? onFavoriteClick(item, e.currentTarget.getBoundingClientRect())
                  : onFavoriteToggle?.(item)
              }
              title={
                onFavoriteClick
                  ? item.is_favorite
                    ? 'フォルダ分類の変更・お気に入り解除'
                    : 'お気に入りに登録してフォルダに分類する'
                  : item.is_favorite
                    ? 'お気に入り解除'
                    : 'お気に入りに追加'
              }
              style={{
                ...compactBtnStyle,
                color: item.is_favorite ? '#f59e0b' : 'var(--text-secondary)',
                borderColor: item.is_favorite ? 'rgba(245,158,11,0.4)' : 'var(--border)',
                background: item.is_favorite ? 'rgba(245,158,11,0.08)' : 'var(--bg-primary)',
              }}
            >
              {item.is_favorite ? '⭐' : '☆'}
            </button>
          )}
          {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm('このアイテムを削除しますか？')) {
                onDelete(item.id);
              }
            }}
            title="削除"
            style={{
              ...compactBtnStyle,
              color: '#ef4444',
              borderColor: 'rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.04)',
              marginLeft: 'auto',
            }}
          >
            🗑
          </button>
          )}
        </div>

        {/* 全文表示（▼全文表示の展開時のみ本文を表示）。282: 本文のクリックで閉じない（文字を選べる） */}
        {isExpanded && (
          <div
            data-library-expanded-body={item.id}
            onClick={stopCardClick}
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
              maxHeight: 600,
              overflowY: 'auto',
              position: 'relative',
            }}
          >
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
                onClick={() => onExpandToggle(item.id)}
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
            {content}
          </div>
        )}
      </div>
    );
  }

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
            onClick={stopCardClick}
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
          {/* 282: タイトル・メタ情報・AI分類が展開領域（clickToExpand 時のみ有効）。操作バーは含めない */}
          <div {...expandZoneProps}>
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

          {/* ── アクションバー（タイトル直下に配置） ── */}
          <div
            onClick={stopCardClick}
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 8,
              marginBottom: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => onExpandToggle(item.id)}
              style={btnStyle}
            >
              {isExpanded ? '▲ 閉じる' : '▼ 全文表示'}
            </button>
            {/* 282: 全画面リーダー（整形表示）への導線 */}
            {onFullscreen && content && (
              <button
                type="button"
                data-library-fullscreen={item.id}
                onClick={() => onFullscreen(item)}
                style={btnStyle}
                title="全画面のリーダー表示で読む"
              >
                ⛶ 全画面
              </button>
            )}
            <button type="button" onClick={handleCopy} style={btnStyle}>
              📋 {copied ? 'コピー済' : 'コピー'}
            </button>
            {onExportMd && (
              <button type="button" onClick={() => onExportMd(item)} style={btnStyle}>
                📥 MD
              </button>
            )}
            {(onFavoriteClick || onFavoriteToggle) && (
              <button
                type="button"
                data-favorite-button={item.id}
                onClick={(e) =>
                  onFavoriteClick
                    ? onFavoriteClick(item, e.currentTarget.getBoundingClientRect())
                    : onFavoriteToggle?.(item)
                }
                style={{
                  ...btnStyle,
                  color: item.is_favorite ? '#f59e0b' : 'var(--text-secondary)',
                  borderColor: item.is_favorite ? 'rgba(245,158,11,0.4)' : 'var(--border)',
                  background: item.is_favorite ? 'rgba(245,158,11,0.08)' : 'var(--bg-primary)',
                }}
              >
                {item.is_favorite ? (onFavoriteClick ? '⭐ 分類' : '⭐ お気に入り') : '☆ お気に入り'}
              </button>
            )}
            {onDelete && (
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
            )}
          </div>
        </div>
      </div>

      {/* プレビュー or 全文（282: 本文のクリックで開閉しない＝文字を選べる） */}
      <div
        data-library-expanded-body={isExpanded ? item.id : undefined}
        onClick={stopCardClick}
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
        {/* 展開時のみ右上に sticky な閉じるボタン（スクロール追従） */}
        {isExpanded && (
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
              onClick={() => onExpandToggle(item.id)}
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
        )}
        {isExpanded ? content : previewText}
        {!isExpanded && charCount > 180 && '...'}
      </div>
    </div>
  );
}
