'use client';

// 229B: Kindle→note展開モーダル（⑥「📝 noteに展開」から開く）。
// - 章選択式（既定=本文のある全章ON。229設計#3採用）→ 1章=1リクエストの直列キュー（部分成功）
// - note文体はKindle styleKeyからの初期値マップ＋選び直し可（#4採用）。長さは標準が既定
// - 保存は /api/kindle/to-note/save（記事INSERT＋book_meta.noteArticleIds追記の相互リンク）。
//   1記事ずつ💾＋「✅ 未保存を全部保存」併設（#5採用）。保存後にauto-categorizeをfire-and-forget
// - 228の🧩仕上げ（まとめ・画像配置・note貼り付けキット）を結果カードで利用可能

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { getSavedModel, getModelIcon, getModelLabel } from '@/lib/model-preference';
import {
  NOTE_STYLES,
  NOTE_STYLE_KEYS,
  getNoteStyle,
  type NoteStyleKey,
} from '@/lib/note-styles';
import NoteEnhancePanel from '@/components/note-enhance/NoteEnhancePanel';
import { emptyNoteEnhance, type NoteEnhanceState } from '@/lib/note-enhance';

// Kindle styleKey → note styleKey の初期値マップ（229設計#4。practicalはnote側に無いためbalanced）
const KINDLE_TO_NOTE_STYLE: Record<string, NoteStyleKey> = {
  expert: 'expert',
  friendly: 'friendly',
  story: 'story',
  practical: 'balanced',
};

interface ChapterInput {
  id: number;
  chapterNumber: number;
  title: string;
  hasContent: boolean;
}

interface ArticleCard {
  chapterId: number;
  chapterNumber: number;
  chapterTitle: string;
  status: 'pending' | 'running' | 'done' | 'error';
  title: string;
  content: string;
  adCheck: { status: 'ok' | 'warn'; findings: string[] } | null;
  error: string;
  savedId: string | null;
  saving: boolean;
  expanded: boolean;
  enhanceOpen: boolean;
  enhance: NoteEnhanceState;
}

type Length = 'short' | 'medium' | 'long';
const LENGTH_OPTIONS: Array<{ value: Length; label: string }> = [
  { value: 'short', label: '📄 短め（1500〜2500字）' },
  { value: 'medium', label: '📑 標準（3000〜4500字）' },
  { value: 'long', label: '📚 長め（5000〜7000字）' },
];

const DRAFT_NOTICE = '⚠️ これは下書きです。あなたの独自の経験・視点を加えて編集してから投稿してください';

export default function KindleToNoteModal({
  open,
  onClose,
  bookId,
  bookTitle,
  kindleStyleKey,
  chapters,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  bookId: number;
  bookTitle: string;
  kindleStyleKey: string;
  chapters: ChapterInput[];
  onSaved?: (article: { id: string; title: string }) => void;
}) {
  const [phase, setPhase] = useState<'select' | 'generate'>('select');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [style, setStyle] = useState<NoteStyleKey>('balanced');
  const [length, setLength] = useState<Length>('medium');
  const [cards, setCards] = useState<ArticleCard[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const cancelledRef = useRef(false);
  const model = getSavedModel();

  // 開くたびにリセット（既定=本文のある全章ON・文体はKindle文体からの初期値）
  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setPhase('select');
    setChecked(new Set(chapters.filter((c) => c.hasContent).map((c) => c.id)));
    setStyle(getNoteStyle(KINDLE_TO_NOTE_STYLE[kindleStyleKey] ?? 'balanced').key);
    setLength('medium');
    setCards([]);
    setGenerating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 背景スクロールロック（NoteBundleModalと同方式）
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const patchCard = (chapterId: number, patch: Partial<ArticleCard>) => {
    setCards((prev) => prev.map((c) => (c.chapterId === chapterId ? { ...c, ...patch } : c)));
  };

  // 直列キュー生成（1章=1リクエスト・部分成功。中止はモーダルclose）
  const startGenerate = async () => {
    const targets = chapters.filter((c) => checked.has(c.id) && c.hasContent);
    if (targets.length === 0) return;
    const initial: ArticleCard[] = targets.map((c) => ({
      chapterId: c.id,
      chapterNumber: c.chapterNumber,
      chapterTitle: c.title,
      status: 'pending',
      title: '',
      content: '',
      adCheck: null,
      error: '',
      savedId: null,
      saving: false,
      expanded: false,
      enhanceOpen: false,
      enhance: emptyNoteEnhance(),
    }));
    setCards(initial);
    setPhase('generate');
    setGenerating(true);
    for (const c of targets) {
      if (cancelledRef.current) break;
      patchCard(c.id, { status: 'running' });
      try {
        const res = await fetch('/api/kindle/to-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, chapterId: c.id, style, length, model }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelledRef.current) break;
        if (!res.ok) throw new Error(data.error || `生成に失敗しました（HTTP ${res.status}）`);
        patchCard(c.id, {
          status: 'done',
          title: data.title || c.title,
          content: data.content || '',
          adCheck: data.ad_check ?? null,
        });
      } catch (e) {
        patchCard(c.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setGenerating(false);
  };

  const retryOne = async (card: ArticleCard) => {
    patchCard(card.chapterId, { status: 'running', error: '' });
    try {
      const res = await fetch('/api/kindle/to-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId: card.chapterId, style, length, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `生成に失敗しました（HTTP ${res.status}）`);
      patchCard(card.chapterId, { status: 'done', title: data.title || card.chapterTitle, content: data.content || '', adCheck: data.ad_check ?? null });
    } catch (e) {
      patchCard(card.chapterId, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const saveOne = async (card: ArticleCard): Promise<boolean> => {
    if (card.savedId || card.saving || card.status !== 'done') return false;
    patchCard(card.chapterId, { saving: true });
    try {
      const res = await fetch('/api/kindle/to-note/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          chapterId: card.chapterId,
          chapterNumber: card.chapterNumber,
          title: card.title,
          content: card.content,
          style,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || '保存に失敗しました');
      patchCard(card.chapterId, { savedId: data.id, saving: false });
      // 自動カテゴライズ（SaveToLibraryButtonと同じfire-and-forget・保存成功を妨げない）
      fetch('/api/library/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', itemIds: [data.id] }),
      }).catch(() => {});
      onSaved?.({ id: data.id, title: card.title });
      return true;
    } catch (e) {
      patchCard(card.chapterId, { saving: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  const saveAll = async () => {
    for (const card of cards) {
      if (card.status === 'done' && !card.savedId) {
        await saveOne(card);
      }
    }
  };

  const handleCopy = async (card: ArticleCard) => {
    await copyRichMarkdown(sanitizeLatex(card.content));
    setCopiedId(card.chapterId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClose = () => {
    cancelledRef.current = true;
    onClose();
  };

  if (!open) return null;

  const smallBtn = (extra?: CSSProperties): CSSProperties => ({
    padding: '6px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    ...extra,
  });

  const doneCount = cards.filter((c) => c.status === 'done').length;
  const unsavedCount = cards.filter((c) => c.status === 'done' && !c.savedId).length;
  const selectableChapters = chapters.filter((c) => c.hasContent);

  return createPortal(
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={handleClose}
    >
      <div
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 960, maxHeight: '88vh', overflowY: 'auto', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>📝 noteに展開 — {bookTitle}</h2>
          <button type="button" onClick={handleClose} style={smallBtn()}>✕ 閉じる</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 16px' }}>
          書籍の章を「単体で読み切れるnote記事」に再構成します（1章=1記事・使用モデル: {getModelIcon(model)} {getModelLabel(model)}）。保存すると本と記事が相互に関連付きます。
        </p>

        {phase === 'select' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>記事にする章（既定=全章）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {chapters.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.hasContent ? 'var(--text-primary)' : 'var(--text-muted)', cursor: c.hasContent ? 'pointer' : 'not-allowed', padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <input
                    type="checkbox"
                    disabled={!c.hasContent}
                    checked={checked.has(c.id)}
                    onChange={(e) => {
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      });
                    }}
                  />
                  第{c.chapterNumber}章 {c.title}
                  {!c.hasContent && <span style={{ fontSize: 11 }}>（本文未生成）</span>}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>note文体:</span>
              <select value={style} onChange={(e) => setStyle(e.target.value as NoteStyleKey)} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
                {NOTE_STYLE_KEYS.map((k) => (
                  <option key={k} value={k}>{NOTE_STYLES[k].emoji} {NOTE_STYLES[k].label} — {NOTE_STYLES[k].description}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>長さ:</span>
              <select value={length} onChange={(e) => setLength(e.target.value as Length)} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
                {LENGTH_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={startGenerate}
                disabled={checked.size === 0 || selectableChapters.length === 0}
                style={{ marginLeft: 'auto', padding: '10px 24px', background: checked.size === 0 ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: checked.size === 0 ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: checked.size === 0 ? 'not-allowed' : 'pointer' }}
              >
                🚀 {checked.size}章を記事にする
              </button>
            </div>
          </div>
        )}

        {phase === 'generate' && (
          <div>
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
              {DRAFT_NOTICE}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {generating ? `✍️ 生成中... ${Math.min(doneCount + 1, cards.length)}/${cards.length}` : `✅ 完了 ${doneCount}/${cards.length}`}
              </span>
              {!generating && unsavedCount > 0 && (
                <button type="button" onClick={saveAll} style={smallBtn({ fontWeight: 700, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' })}>
                  ✅ 未保存の{unsavedCount}記事をすべて保存
                </button>
              )}
              {!generating && (
                <button type="button" onClick={() => setPhase('select')} style={smallBtn({ marginLeft: 'auto' })}>← 章選択に戻る</button>
              )}
            </div>

            {cards.map((card) => (
              <div key={card.chapterId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>第{card.chapterNumber}章</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{card.title || card.chapterTitle}</span>
                  {card.savedId && <span style={{ fontSize: 11, color: '#10b981' }}>💾 保存済み（本と関連付けました）</span>}
                  {card.status === 'done' && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{card.content.length.toLocaleString()}字</span>}
                </div>

                {card.status === 'pending' && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>⏳ 待機中...</div>}
                {card.status === 'running' && <div style={{ fontSize: 12, color: 'var(--accent)', padding: '8px 0' }}>✍️ 執筆中...（30〜120秒）</div>}
                {card.status === 'error' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    ⚠️ {card.error}
                    <button type="button" onClick={() => retryOne(card)} style={smallBtn()}>🔄 再試行</button>
                  </div>
                )}

                {card.status === 'done' && (
                  <div>
                    {card.adCheck && card.adCheck.status === 'warn' && card.adCheck.findings.length > 0 && (
                      <div style={{ marginBottom: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
                        🚨 医療広告チェック: 要確認
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {card.adCheck.findings.map((f, fi) => <li key={fi}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {card.adCheck && card.adCheck.status === 'ok' && (
                      <div style={{ marginBottom: 8, fontSize: 11, color: '#10b981' }}>✅ 医療広告チェック: 問題なし</div>
                    )}
                    <div
                      className="markdown-body"
                      style={{ maxHeight: card.expanded ? undefined : 240, overflowY: card.expanded ? undefined : 'auto', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'var(--text-primary)', lineHeight: 1.75, overflowWrap: 'anywhere', wordBreak: 'break-word', marginBottom: 10 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(card.content) }}
                    />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" onClick={() => patchCard(card.chapterId, { expanded: !card.expanded })} style={smallBtn()}>
                        {card.expanded ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(card)}
                        style={smallBtn(copiedId === card.chapterId ? { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#16a34a' } : undefined)}
                      >
                        {copiedId === card.chapterId ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveOne(card)}
                        disabled={!!card.savedId || card.saving}
                        style={smallBtn(card.savedId ? { color: '#10b981' } : { fontWeight: 700 })}
                      >
                        {card.saving ? '🔄 保存中...' : card.savedId ? '💾 保存済み' : '💾 保存（本と関連付け）'}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchCard(card.chapterId, { enhanceOpen: !card.enhanceOpen })}
                        title="まとめ・画像配置・note貼り付けキット（228）"
                        style={smallBtn(card.enhanceOpen ? { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-primary)', fontWeight: 700 } : undefined)}
                      >
                        🧩 仕上げ
                      </button>
                    </div>
                    {card.enhanceOpen && (
                      <NoteEnhancePanel
                        title={card.title}
                        content={card.content}
                        state={card.enhance}
                        onChange={(next) => patchCard(card.chapterId, { enhance: next })}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
