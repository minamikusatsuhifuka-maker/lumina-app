'use client';
// 269: Kindle本 → note記事の多軸展開（章 × ペルソナ × 切り口）タブ。
// - 生成は多く、公開は選抜（全部公開を推奨しない）。候補は下書きとして復元される（R-20）
// - 事実同一性（§4）は機械検証が困難なため、元の章と並べた目視確認UIを必須で出す
// - 類似度（§5）・書籍文脈（§7）・一致度（§2-2）は純関数の機械検証で警告（R-26: 警告のみ）
import { useEffect, useMemo, useRef, useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { copyRichMarkdownForNote } from '@/lib/rich-copy';
import { getSavedModel } from '@/lib/model-preference';
import { loadFeatureDraft, saveFeatureDraft, clearFeatureDraft } from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import {
  PERSONA_STYLES,
  PERSONA_STYLE_KEYS,
  type PersonaStyleKey,
} from '@/lib/persona-styles';
import {
  REMIX_ANGLES,
  REMIX_ANGLE_KEYS,
  candidateSimilarity,
  CANDIDATE_SIMILARITY_WARN,
  KDP_OVERLAP_WARN,
  type RemixAngleKey,
  type BookContextHit,
} from '@/lib/kindle-note-remix';

interface AdCheck {
  status: 'ok' | 'warn';
  findings: string[];
}

interface KindleBook {
  id: number;
  title: string;
}

interface KindleChapter {
  id: number;
  chapterNumber?: number;
  chapter_number?: number;
  title: string;
  content: string | null;
}

interface RemixCandidate {
  localId: string;
  source: string; // 「第N章「…」」or「手動: …」
  chapterText: string; // §4の並べ表示用
  bookId?: number;
  chapterId?: number;
  bookTitle: string;
  personaKey: PersonaStyleKey;
  angleKey: RemixAngleKey;
  titles: string[];
  content: string;
  adCheck?: AdCheck | null;
  contextHits: BookContextHit[];
  overlapRatio: number;
  overlapWarn: boolean;
}

interface RemixDraftPayload {
  candidates?: RemixCandidate[];
  kdpFlags?: Record<string, boolean>;
}

const ACCENT = '#e0684b';

export default function KindleRemixTab() {
  const [books, setBooks] = useState<KindleBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [sourceKind, setSourceKind] = useState<'book' | 'manual'>('book');
  const [bookId, setBookId] = useState('');
  const [chapters, setChapters] = useState<KindleChapter[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualBookTitle, setManualBookTitle] = useState('');
  const [personaKey, setPersonaKey] = useState<PersonaStyleKey>('homemaker');
  const [angleKey, setAngleKey] = useState<RemixAngleKey>('mechanism');
  const [kdpFlags, setKdpFlags] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<RemixCandidate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const guardRef = useRef(false);
  guardRef.current = busy || candidates.length > 0;

  // Kindle書籍一覧（このタブでのみ取得）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/kindle');
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data.books) ? data.books : Array.isArray(data) ? data : [];
        if (!cancelled) setBooks(list.map((b: { id: number; title: string }) => ({ id: b.id, title: b.title })));
      } catch {
        /* 手動アップロードだけでも使える */
      } finally {
        if (!cancelled) setBooksLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 章一覧（書籍を選んだら取得。分割境界はAIに考えさせない＝既存の章構造をそのまま単位にする）
  useEffect(() => {
    if (!bookId) {
      setChapters([]);
      setChapterId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kindle?id=${bookId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.chapters)) setChapters(data.chapters);
      } catch {
        /* 選び直せる */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // 候補・KDPフラグの復元（R-20）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<RemixDraftPayload>('kindle-note-remix');
      if (cancelled || !draft?.payload) return;
      if (guardRef.current) return;
      if (Array.isArray(draft.payload.candidates) && draft.payload.candidates.length > 0) {
        setCandidates(draft.payload.candidates);
        setRestoredAt(draft.updated_at);
      }
      if (draft.payload.kdpFlags) setKdpFlags(draft.payload.kdpFlags);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: RemixCandidate[], flags = kdpFlags) => {
    saveFeatureDraft('kindle-note-remix', { candidates: next, kdpFlags: flags });
  };

  const handleClear = () => {
    setRestoredAt(null);
    setCandidates([]);
    clearFeatureDraft('kindle-note-remix');
  };

  const kdpKey = sourceKind === 'book' ? `book-${bookId}` : 'manual';
  const kdpSelect = !!kdpFlags[kdpKey];
  const setKdp = (on: boolean) => {
    const flags = { ...kdpFlags, [kdpKey]: on };
    setKdpFlags(flags);
    persist(candidatesRef.current, flags);
  };

  const selectedChapter = chapters.find((c) => String(c.id) === chapterId);
  const canGenerate =
    sourceKind === 'book' ? !!(bookId && chapterId) : !!(manualTitle.trim() && manualText.trim());

  const generate = async () => {
    if (!canGenerate || busy) return;
    setBusy(true);
    setError('');
    setRestoredAt(null);
    try {
      const chapterText =
        sourceKind === 'book' ? selectedChapter?.content || '' : manualText.trim();
      const res = await fetch('/api/kindle/note-remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(sourceKind === 'book'
            ? { bookId: Number(bookId), chapterId: Number(chapterId) }
            : { chapter: { title: manualTitle.trim(), content: manualText.trim() }, bookTitle: manualBookTitle.trim() }),
          personaKey,
          angleKey,
          kdpSelect,
          model: getSavedModel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `生成に失敗しました（${res.status}）`);
      const book = books.find((b) => String(b.id) === bookId);
      const cand: RemixCandidate = {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source:
          sourceKind === 'book'
            ? `${book?.title ?? ''}／章「${data.chapterTitle || selectedChapter?.title || ''}」`
            : `手動素材「${manualTitle.trim()}」`,
        chapterText,
        ...(sourceKind === 'book' ? { bookId: Number(bookId), chapterId: Number(chapterId) } : {}),
        bookTitle: sourceKind === 'book' ? book?.title ?? '' : manualBookTitle.trim(),
        personaKey,
        angleKey,
        titles: Array.isArray(data.titles) ? data.titles : [],
        content: data.content || '',
        adCheck: data.ad_check ?? null,
        contextHits: Array.isArray(data.contextHits) ? data.contextHits : [],
        overlapRatio: Number(data.overlapRatio) || 0,
        overlapWarn: !!data.overlapWarn,
      };
      const next = [cand, ...candidatesRef.current];
      candidatesRef.current = next;
      setCandidates(next);
      setOpenId(cand.localId);
      persist(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const removeCandidate = (localId: string) => {
    const next = candidatesRef.current.filter((c) => c.localId !== localId);
    candidatesRef.current = next;
    setCandidates(next);
    persist(next);
  };

  const handleCopy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleNoteCopy = async (text: string, key: string) => {
    try {
      await copyRichMarkdownForNote(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* 失敗時はボタン表示が変わらない */
    }
  };

  // §5: 候補どうしの内容被り（同じ章から複数生成したときに起きやすい）を機械検出
  const similarWarnings = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const s = candidateSimilarity(candidates[i].content, candidates[j].content);
        if (s >= CANDIDATE_SIMILARITY_WARN) {
          (map[candidates[i].localId] ??= []).push(candidates[j].source);
          (map[candidates[j].localId] ??= []).push(candidates[i].source);
        }
      }
    }
    return map;
  }, [candidates]);

  const selStyle: React.CSSProperties = {
    padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none',
  };

  return (
    <>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          2️⃣ 📖 Kindle本 → note記事の多軸展開（章 × ペルソナ × 切り口）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          書籍の章をテーマの素材に、視点と表現を変えたnote記事を<strong>書き下ろし</strong>ます（本文の複製はしません）。
          <strong>生成は多く、公開は選抜</strong>——候補の中から公開するものを選んでください。
        </p>

        {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClear} />}

        {/* 素材の選択（既存の章構造をそのまま単位にする＝決定的） */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {([
            { kind: 'book' as const, label: '📕 Kindleウィザードの書籍から' },
            { kind: 'manual' as const, label: '📄 手動で章を貼り付け' },
          ]).map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => setSourceKind(o.kind)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: sourceKind === o.kind ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                background: sourceKind === o.kind ? `${ACCENT}12` : 'var(--bg-primary)',
                color: sourceKind === o.kind ? ACCENT : 'var(--text-muted)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {sourceKind === 'book' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <select data-remix-book value={bookId} onChange={(e) => setBookId(e.target.value)} style={{ ...selStyle, minWidth: 220 }}>
              <option value="">— 書籍を選ぶ —</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
            <select data-remix-chapter value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={{ ...selStyle, minWidth: 220 }} disabled={!bookId}>
              <option value="">— 章を選ぶ —</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  第{c.chapterNumber ?? c.chapter_number ?? '?'}章 {c.title}
                </option>
              ))}
            </select>
            {booksLoaded && books.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                書籍がありません。📄手動貼り付けか、📕Kindle本づくりで作成を
              </span>
            )}
          </div>
        )}

        {sourceKind === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                data-remix-manual-title
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="章のタイトル"
                style={{ ...selStyle, flex: 1, minWidth: 200, padding: '8px 12px' }}
              />
              <input
                value={manualBookTitle}
                onChange={(e) => setManualBookTitle(e.target.value)}
                placeholder="書籍名（導線に使う・任意）"
                style={{ ...selStyle, flex: 1, minWidth: 200, padding: '8px 12px' }}
              />
            </div>
            <textarea
              data-remix-manual-text
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="章の本文を貼り付け（テーマと事実関係の素材として使います。本文は複製しません）"
              style={{ ...selStyle, minHeight: 120, padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>
        )}

        {/* ペルソナ × 切り口（軸2・軸3） */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            読者ペルソナ:
            <select data-remix-persona value={personaKey} onChange={(e) => setPersonaKey(e.target.value as PersonaStyleKey)} style={selStyle}>
              {PERSONA_STYLE_KEYS.map((k) => (
                <option key={k} value={k}>{PERSONA_STYLES[k].emoji} {PERSONA_STYLES[k].label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            切り口:
            <select data-remix-angle value={angleKey} onChange={(e) => setAngleKey(e.target.value as RemixAngleKey)} style={selStyle}>
              {REMIX_ANGLE_KEYS.map((k) => (
                <option key={k} value={k}>{REMIX_ANGLES[k].emoji} {REMIX_ANGLES[k].label}（{REMIX_ANGLES[k].signal}）</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" data-remix-kdp checked={kdpSelect} onChange={(e) => setKdp(e.target.checked)} />
            この書籍はKDPセレクト登録済み（一致度の警告を強調）
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {REMIX_ANGLES[angleKey].hint}／一度に生成するのは数本まで（全組み合わせの一括生成はしません）
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate || busy}
            style={{
              padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14, cursor: !canGenerate || busy ? 'not-allowed' : 'pointer',
              opacity: !canGenerate || busy ? 0.5 : 1,
            }}
          >
            {busy ? '書き下ろし中…' : '📖 この組み合わせで1本書き下ろす'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 候補一覧（公開するものを選抜する） */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            3️⃣ 候補（{candidates.length}本）— 公開するものを選んで保存
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidates.map((c) => {
              const isOpen = openId === c.localId;
              const similarTo = similarWarnings[c.localId] ?? [];
              const title = c.titles[0] || `${PERSONA_STYLES[c.personaKey].label}×${REMIX_ANGLES[c.angleKey].label}`;
              return (
                <div key={c.localId} data-remix-candidate style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}>
                        {PERSONA_STYLES[c.personaKey].emoji} {PERSONA_STYLES[c.personaKey].label} × {REMIX_ANGLES[c.angleKey].emoji} {REMIX_ANGLES[c.angleKey].label}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0' }}>{title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>素材: {c.source}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <SaveToLibraryButton
                        title={title}
                        content={c.content}
                        type="note-article"
                        groupName="note記事"
                        tags="note記事,下書き,Kindle多軸展開"
                        metadata={{
                          from: 'kindle-note-remix',
                          bookId: c.bookId ?? null,
                          chapterId: c.chapterId ?? null,
                          persona: c.personaKey,
                          angle: c.angleKey,
                        }}
                      />
                      <button type="button" onClick={() => handleNoteCopy(c.content, `note-${c.localId}`)} style={{ padding: '6px 12px', background: `${ACCENT}15`, border: `1px solid ${ACCENT}50`, color: ACCENT, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {copied === `note-${c.localId}` ? '✅' : '📋 note用にコピー'}
                      </button>
                      <button type="button" onClick={() => handleCopy(c.content, `md-${c.localId}`)} style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        {copied === `md-${c.localId}` ? '✅' : '📋 MD'}
                      </button>
                      <button type="button" onClick={() => setOpenId(isOpen ? null : c.localId)} style={{ padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        {isOpen ? '▲ 閉じる' : '▼ 確認する'}
                      </button>
                      <button type="button" onClick={() => removeCandidate(c.localId)} title="候補から外します（保存済みの記事は消えません）" style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,107,107,0.4)', color: '#ff6b6b', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* 機械検証の警告（表示のみ・自動修正しない） */}
                  {(c.contextHits.length > 0 || c.overlapWarn || similarTo.length > 0 || (c.adCheck?.status === 'warn')) && (
                    <div data-remix-warnings style={{ padding: 10, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, marginTop: 10, fontSize: 11, color: '#B45309', lineHeight: 1.7 }}>
                      {c.contextHits.length > 0 && (
                        <div>
                          ⚠️ 書籍文脈の残存（{c.contextHits.length}件）: {c.contextHits.slice(0, 3).map((h, i) => (
                            <span key={i}>「…{h.excerpt}…」 </span>
                          ))}
                          — 単独記事として成立するよう該当箇所を直してください
                        </div>
                      )}
                      {c.overlapWarn && (
                        <div>⚠️ 書籍本文との一致度が高めです（概算 {(c.overlapRatio * 100).toFixed(0)}%）。{kdpFlags[`book-${c.bookId}`] ? 'KDPセレクト登録書籍のため、' : ''}書き下ろしになっているか確認してください（最終判断は院長）</div>
                      )}
                      {similarTo.length > 0 && (
                        <div>⚠️ 他の候補と内容が近いです（{similarTo.slice(0, 2).join('／')}）。両方公開すると焼き直しに見えます — どちらかを選抜してください</div>
                      )}
                      {c.adCheck?.status === 'warn' && c.adCheck.findings.slice(0, 3).map((f, i) => (
                        <div key={i}>⚠️ 医療広告チェック: {f}</div>
                      ))}
                    </div>
                  )}

                  {isOpen && (
                    <div style={{ marginTop: 12 }}>
                      {c.titles.length > 0 && (
                        <div style={{ padding: 10, background: `${ACCENT}0d`, border: `1px solid ${ACCENT}30`, borderRadius: 8, marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🏷 タイトル案</div>
                          {c.titles.map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                              <span style={{ flex: 1 }}>{t}</span>
                              <button type="button" onClick={() => handleCopy(t, `t-${c.localId}-${i}`)} style={{ padding: '2px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 5, cursor: 'pointer', fontSize: 10 }}>
                                {copied === `t-${c.localId}-${i}` ? '✅' : '📋'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* §4: 事実同一性の目視確認（元の章と並べて表示・機械検証は困難なため必須の促し） */}
                      <div data-fact-check-note style={{ fontSize: 11, color: '#B45309', fontWeight: 600, marginBottom: 6 }}>
                        👀 公開前に必ず: 医学的な事実関係が元の章と同一か、左右を並べて目視確認してください（表現・喩えの変化が事実の変化になっていないか）
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
                        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, maxHeight: 380, overflowY: 'auto', background: 'var(--bg-primary)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📕 元の章（素材）</div>
                          <div className="markdown-body" style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(c.chapterText) }} />
                        </div>
                        <div style={{ border: `1px solid ${ACCENT}40`, borderRadius: 8, padding: 10, maxHeight: 380, overflowY: 'auto', background: 'var(--bg-primary)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>📰 書き下ろした記事</div>
                          <div className="markdown-body" style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content) }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.7 }}>
            ℹ️ 保存した記事は🗓予約投稿カレンダー・🗺収益化ロードマップの一覧に自動で出ます。候補は焼き直しが並ばないよう、公開するものだけを選んで保存してください。
          </div>
        </div>
      )}
    </>
  );
}
