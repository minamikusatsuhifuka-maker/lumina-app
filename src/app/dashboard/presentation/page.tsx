'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 275: 🎤 プレゼン発表原稿（第1段階: PDF・画像）
// PDF / PNG / JPEG を一度に読み込み、各ページの発表原稿を1枚ずつ作る。
//  - PDFのページ画像化は**クライアント側**（lib/pdf-pages.ts・§2-2）
//  - 生成は**1ページ1リクエスト**の逐次処理（§2-4）。1枚の失敗は1枚に閉じる（R-39）
//  - アップロードしたファイルは**保存しない**。保存するのは生成された原稿だけ（§2-3）
//  - スライドと原稿を**並べて表示**し、事実が同一かの目視確認を促す（§4-1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useRef, useState } from 'react';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { clearFeatureDraft, loadFeatureDraft, saveFeatureDraft } from '@/lib/feature-drafts';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { imageFileToDataUrl, renderPdfPages } from '@/lib/pdf-pages';
import {
  DEFAULT_PRESENTATION_AUDIENCE,
  PRESENTATION_AUDIENCES,
  SCRIPT_SECTION_DEFS,
  audienceOf,
  guessSlideTitle,
  movePage,
  pageLabelOf,
  pageScriptToMarkdown,
  scriptDocumentToMarkdown,
  scriptSaveTitle,
  type PageScriptResult,
  type PresentationAudienceKey,
  type SlidePage,
  type SlideSourceKind,
} from '@/lib/presentation';

type AdCheck = { status: string; findings: string[] } | null;

interface PageState {
  page: SlidePage;
  status: 'idle' | 'running' | 'done' | 'failed';
  result: PageScriptResult | null;
  adCheck: AdCheck;
  error: string;
}

let pageIdSeq = 1;

const ACCEPT = 'application/pdf,image/png,image/jpeg';

// R-20: 生成結果は自動保存・復元する。ただし**スライド画像は保存しない**（§2-3: ファイルを永続化しない）。
// 復元されるのは原稿とページの見出しだけ＝リロードで原稿が消えることはないが、
// スライドの絵は戻らない（もう一度読み込めば並べて確認できる）。
const DRAFT_KEY = 'presentation';
/** 下書きに残すページ本文の上限（プロンプト用の素材テキスト。丸ごと持つと下書きが肥大する） */
const DRAFT_TEXT_MAX = 2000;

interface DraftPayload {
  theme: string;
  effectiveTheme: string;
  audience: PresentationAudienceKey;
  pages: {
    id: string;
    kind: SlideSourceKind;
    fileName: string;
    indexInFile: number;
    text: string;
    result: PageScriptResult | null;
  }[];
}

export default function PresentationPage() {
  const [items, setItems] = useState<PageState[]>([]);
  const [loadingFiles, setLoadingFiles] = useState('');
  const [loadError, setLoadError] = useState('');
  const [theme, setTheme] = useState('');
  const [effectiveTheme, setEffectiveTheme] = useState('');
  const [audience, setAudience] = useState<PresentationAudienceKey>(DEFAULT_PRESENTATION_AUDIENCE);
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState<'pages' | 'full'>('pages');
  const [copied, setCopied] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [save, setSave] = useState<{ saving: boolean; savedId: string; error: string }>({
    saving: false, savedId: '', error: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef(0);

  // 経過時間（§3-7）。実行中だけ1秒ごとに更新する
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // マウント時に前回の原稿を復元（正はDB＝端末をまたいで戻る）。
  // 既に読み込み・生成が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current = running || items.length > 0;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<DraftPayload>(DRAFT_KEY);
      if (cancelled || !draft?.payload?.pages?.length) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setTheme(p.theme ?? '');
      setEffectiveTheme(p.effectiveTheme ?? '');
      if (p.audience) setAudience(p.audience);
      setItems(
        p.pages.map((pg) => ({
          page: {
            id: pg.id, kind: pg.kind, fileName: pg.fileName, indexInFile: pg.indexInFile,
            imageDataUrl: null, text: pg.text ?? '',
          },
          status: pg.result ? 'done' : 'idle',
          result: pg.result,
          adCheck: null,
          error: '',
        })),
      );
      setView('full'); // 画像は戻らないため、復元直後は通し表示を見せる
      setRestoredAt(draft.updated_at);
    })();
    return () => { cancelled = true; };
  }, []);

  const persistDraft = (
    list: PageState[],
    themeForRun: string,
    audienceKey: PresentationAudienceKey,
  ) => {
    saveFeatureDraft(DRAFT_KEY, {
      theme,
      effectiveTheme: themeForRun,
      audience: audienceKey,
      pages: list.map((it) => ({
        id: it.page.id,
        kind: it.page.kind,
        fileName: it.page.fileName,
        indexInFile: it.page.indexInFile,
        text: it.page.text.slice(0, DRAFT_TEXT_MAX),
        result: it.result,
      })),
    } satisfies DraftPayload);
  };

  const clearDraft = () => {
    setRestoredAt(null);
    setItems([]);
    setTheme('');
    setEffectiveTheme('');
    setView('pages');
    clearFeatureDraft(DRAFT_KEY);
  };

  const doneCount = items.filter((i) => i.status === 'done').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const hasScript = doneCount > 0;

  const fullMarkdown = useMemo(
    () => scriptDocumentToMarkdown({
      theme: effectiveTheme || theme,
      audienceKey: audience,
      pages: items.map((i) => ({ page: i.page, result: i.result })),
    }),
    [items, effectiveTheme, theme, audience],
  );

  // ── ファイル取り込み（複数同時・PDFは全ページに展開）──────────────
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoadError('');
    const added: PageState[] = [];
    try {
      for (const file of Array.from(files)) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          setLoadingFiles(`${file.name} を読み込み中...`);
          const rendered = await renderPdfPages(file, (done, total) =>
            setLoadingFiles(`${file.name} を読み込み中... ${done}/${total}ページ`),
          );
          rendered.forEach((r, idx) => {
            added.push(blankState({
              id: `p${pageIdSeq++}`, kind: 'pdf', fileName: file.name,
              indexInFile: idx + 1, imageDataUrl: r.dataUrl, text: r.text,
            }));
          });
        } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
          setLoadingFiles(`${file.name} を読み込み中...`);
          const dataUrl = await imageFileToDataUrl(file);
          added.push(blankState({
            id: `p${pageIdSeq++}`, kind: 'image', fileName: file.name,
            indexInFile: 1, imageDataUrl: dataUrl, text: '',
          }));
        } else {
          throw new Error(`${file.name} は対応していない形式です（PDF・PNG・JPEGのみ）`);
        }
      }
      // アップロード順＝ページ順。既存の後ろに足す（§3-1）
      setItems((prev) => [...prev, ...added]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'ファイルを読み込めませんでした');
    } finally {
      setLoadingFiles('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    if (running) return;
    setItems((prev) => movePage(prev, index, dir));
  };

  const removePage = (index: number) => {
    if (running) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ── 1ページぶんの生成（1リクエスト = 1ページ・§2-4）────────────────
  const generateOne = async (
    list: PageState[],
    index: number,
    themeForRun: string,
  ): Promise<{ result: PageScriptResult; adCheck: AdCheck }> => {
    const target = list[index];
    const prev = index > 0 ? list[index - 1] : null;
    const next = index + 1 < list.length ? list[index + 1] : null;
    const res = await fetch('/api/presentation/page-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageNumber: index + 1,
        totalPages: list.length,
        audience,
        theme: themeForRun,
        imageDataUrl: target.page.imageDataUrl,
        pageText: target.page.text,
        // §3-3: 前ページの要点（1〜2文）と次ページのタイトルだけを渡す。全ページは渡さない
        prevSummary: prev?.result?.summaryForNext ?? '',
        nextTitle: next?.result?.slideTitle || guessSlideTitle(next?.page.text ?? ''),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `生成に失敗しました（${res.status}）`);
    return {
      result: {
        slideTitle: data.slideTitle ?? '',
        sections: data.sections,
        summaryForNext: data.summaryForNext ?? '',
        inferredTheme: data.inferredTheme ?? '',
      },
      adCheck: data.adCheck ?? null,
    };
  };

  // ── 全ページを逐次生成（1枚の失敗で他を巻き添えにしない＝R-39）────
  const runAll = async () => {
    if (running || items.length === 0) return;
    setRunning(true);
    setSave({ saving: false, savedId: '', error: '' });
    startedAtRef.current = Date.now();
    setElapsed(0);
    let themeForRun = theme.trim();
    setEffectiveTheme(themeForRun);

    // ループ内の文脈参照のため、状態の写しを進めながら回す
    let list: PageState[] = items.map((i) => ({ ...i, status: 'idle', result: null, adCheck: null, error: '' }));
    setItems(list);

    for (let i = 0; i < list.length; i++) {
      setCurrentIndex(i);
      list = list.map((it, idx) => (idx === i ? { ...it, status: 'running' as const } : it));
      setItems(list);
      try {
        const { result, adCheck } = await generateOne(list, i, themeForRun);
        // テーマ未入力なら1枚目の推定を以降のページへ引き継ぐ（§3-3）
        if (!themeForRun && result.inferredTheme) {
          themeForRun = result.inferredTheme;
          setEffectiveTheme(themeForRun);
        }
        list = list.map((it, idx) => (idx === i ? { ...it, status: 'done' as const, result, adCheck, error: '' } : it));
      } catch (e) {
        const message = e instanceof Error ? e.message : '生成に失敗しました';
        // 失敗したページだけ failed にして次のページへ進む（全体を止めない）
        list = list.map((it, idx) => (idx === i ? { ...it, status: 'failed' as const, error: message } : it));
      }
      setItems(list);
    }
    setCurrentIndex(-1);
    setRunning(false);
    persistDraft(list, themeForRun, audience);
  };

  // ── 1ページだけ作り直す（§3-6）────────────────────────────────────
  const regenerateOne = async (index: number) => {
    if (running) return;
    setRunning(true);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setCurrentIndex(index);
    let list: PageState[] = items.map((it, idx) => (idx === index ? { ...it, status: 'running', error: '' } : it));
    setItems(list);
    try {
      const { result, adCheck } = await generateOne(list, index, effectiveTheme || theme.trim());
      list = list.map((it, idx) => (idx === index ? { ...it, status: 'done' as const, result, adCheck, error: '' } : it));
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成に失敗しました';
      list = list.map((it, idx) => (idx === index ? { ...it, status: 'failed' as const, error: message } : it));
    }
    setItems(list);
    setCurrentIndex(-1);
    setRunning(false);
    persistDraft(list, effectiveTheme || theme.trim(), audience);
  };

  // ── コピー・保存 ──────────────────────────────────────────────────
  // R-71: 貼り付け先を限定しない汎用コピーなので共通の copyRichMarkdown を使う
  //（note専用など貼り付け先が決まっている経路だけが専用ラッパーを使う）
  const copyMarkdown = async (markdown: string, key: string) => {
    try {
      await copyRichMarkdown(markdown);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* 失敗時はボタン表記を変えない */
    }
  };

  const saveToList = async () => {
    if (!hasScript || save.saving) return;
    setSave({ saving: true, savedId: '', error: '' });
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scriptSaveTitle(effectiveTheme || theme, audience),
          content: fullMarkdown,
          analysisType: 'presentation_script',
          analysisLabel: 'プレゼン原稿',
          tags: ['プレゼン原稿', audienceOf(audience).label],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存に失敗しました（${res.status}）`);
      setSave({ saving: false, savedId: String(data.id ?? data.save?.id ?? 'saved'), error: '' });
    } catch (e) {
      setSave({ saving: false, savedId: '', error: e instanceof Error ? e.message : '保存に失敗しました' });
    }
  };

  const card: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 20, marginBottom: 20,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-primary)', fontSize: 13, padding: 10, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: primary ? '10px 22px' : '6px 12px',
    borderRadius: 8, fontSize: primary ? 14 : 12, fontWeight: primary ? 700 : 400,
    cursor: 'pointer', background: primary ? 'var(--accent)' : 'var(--bg-primary)',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
    color: primary ? '#ffffff' : 'var(--text-secondary)',
  });

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        🎤 プレゼン発表原稿
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7, fontSize: 13 }}>
        PDF・PNG・JPEGの資料を一度に読み込み、スライド1枚ずつの発表原稿を作ります。1枚ずつ順番に生成するので、
        途中で1枚失敗しても他のページは残ります。<br />
        <strong style={{ color: '#f59e0b' }}>
          ⚠️ 原稿は下書きです。スライドと読み合わせ、書かれていない内容が混ざっていないか必ず確認してください。
        </strong>
      </p>

      {restoredAt && <FeatureDraftBanner restoredAt={restoredAt} onClear={clearDraft} />}
      {restoredAt && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          ※ 原稿だけを復元しました。<strong>資料そのものは保存していない</strong>ため、スライドの画像は表示されません。
          並べて確認したいときは、同じ資料をもう一度読み込んでください。
        </div>
      )}

      {/* ① 資料の読み込み */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          ① 資料を読み込む（複数まとめて選べます）
        </div>
        <input
          ref={fileInputRef}
          data-pres-file-input
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => onFiles(e.target.files)}
          disabled={running || !!loadingFiles}
          style={{ ...inputStyle, padding: 8, cursor: 'pointer' }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
          PDFは全ページに展開されます。読み込み順がページ順になり、下の一覧で入れ替えられます。<br />
          パワーポイント（.pptx）は第2段階で対応予定です。今はPDFに書き出してから読み込んでください。<br />
          <strong>ファイル自体は保存されません</strong>（保存されるのは生成された原稿だけです）。
        </div>
        {loadingFiles && (
          <div data-pres-loading style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            ⏳ {loadingFiles}
          </div>
        )}
        {loadError && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>⚠️ {loadError}</div>
        )}

        {items.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              📑 ページ一覧（<strong data-pres-page-count>{items.length}</strong>枚）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {items.map((it, i) => (
                <div
                  key={it.page.id}
                  data-pres-page
                  data-pres-page-label={pageLabelOf(it.page)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 34, flexShrink: 0 }}>
                    {i + 1}枚目
                  </span>
                  {it.page.imageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.page.imageDataUrl}
                      alt=""
                      style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }}
                    />
                  )}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pageLabelOf(it.page)}
                  </span>
                  <button data-pres-move-up type="button" onClick={() => move(i, -1)} disabled={running || i === 0} title="1つ前へ" style={btn(false)}>↑</button>
                  <button data-pres-move-down type="button" onClick={() => move(i, 1)} disabled={running || i === items.length - 1} title="1つ後ろへ" style={btn(false)}>↓</button>
                  <button data-pres-remove type="button" onClick={() => removePage(i)} disabled={running} title="このページを外す" style={btn(false)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ② 発表の設定 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          ② 発表の設定
        </div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          発表のテーマ（空欄なら1枚目のスライドから推定します）
        </label>
        <input
          data-pres-theme
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="例: アトピー性皮膚炎の外用療法アップデート"
          disabled={running}
          style={{ ...inputStyle, maxWidth: 520, marginBottom: 14 }}
        />
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          発表の用途（聞き手によって語り口が変わります）
        </label>
        <select
          data-pres-audience
          value={audience}
          onChange={(e) => setAudience(e.target.value as PresentationAudienceKey)}
          disabled={running}
          style={{ ...inputStyle, maxWidth: 520 }}
        >
          {PRESENTATION_AUDIENCES.map((a) => (
            <option key={a.key} value={a.key}>{`${a.label} — ${a.hint}`}</option>
          ))}
        </select>
        {audience === 'academic' && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            学会発表では、有意差・オッズ比などの学術的な記述を<strong>スライドに書かれている範囲で</strong>そのまま述べます
            （医療広告ガイドラインは広告への規制で、学術発表とは文脈が異なるため）。
          </div>
        )}
      </div>

      {/* ③ 実行 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          data-pres-run
          type="button"
          onClick={runAll}
          disabled={running || items.length === 0 || !!loadingFiles}
          style={{ ...btn(true), opacity: running || items.length === 0 ? 0.5 : 1 }}
        >
          {running ? '生成中...' : `▶ 全ページの原稿を作る（${items.length}枚）`}
        </button>
        {items.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            1ページずつ順番に生成します（{items.length}回に分けて実行）
          </span>
        )}
      </div>

      {/* 進捗（§3-7） */}
      {(running || doneCount > 0 || failedCount > 0) && (
        <div data-pres-progress style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--text-primary)' }}>
            <span>
              進捗: <strong>{doneCount}</strong> / {items.length} ページ
            </span>
            {running && currentIndex >= 0 && items[currentIndex] && (
              <span style={{ color: 'var(--text-secondary)' }}>
                処理中: {currentIndex + 1}枚目（{pageLabelOf(items[currentIndex].page)}）
              </span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>経過 {elapsed}秒</span>
            {failedCount > 0 && (
              <span data-pres-failed style={{ color: '#ef4444' }}>失敗 {failedCount}ページ（他のページはそのまま残ります）</span>
            )}
          </div>
          <div style={{ marginTop: 8, height: 6, borderRadius: 99, background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      {/* 結果 */}
      {hasScript && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {([['pages', '🖼 スライドと並べて確認'], ['full', '📄 通しで読む']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                data-pres-view={k}
                onClick={() => setView(k)}
                style={{
                  padding: '8px 16px', borderRadius: 99, fontSize: 13, cursor: 'pointer',
                  fontWeight: view === k ? 700 : 400,
                  background: view === k ? 'var(--accent-soft)' : 'var(--bg-primary)',
                  border: `1px solid ${view === k ? 'var(--accent)' : 'var(--border)'}`,
                  color: view === k ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button data-pres-copy-all type="button" onClick={() => copyMarkdown(fullMarkdown, 'all')} style={btn(false)}>
              {copied === 'all' ? '✅ コピーしました' : '📋 通し原稿をコピー'}
            </button>
            <button data-pres-save type="button" onClick={saveToList} disabled={save.saving} style={btn(false)}>
              {save.saving ? '保存中…' : save.savedId ? '✅ 保存済み（🗃保存一覧）' : save.error ? '⚠️ 保存に失敗・再試行' : '💾 保存一覧へ保存'}
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }} data-pres-fact-note>
            スライドと原稿を並べています。<strong>スライドに書かれていない事実が原稿に混ざっていないか</strong>を目で確認してください。
            気になる1枚は「🔁 このページだけ作り直す」で作り直せます。
          </div>

          {view === 'pages' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {items.map((it, i) => {
                const r = it.result; // map内では JSX の && で narrowing が効かないため先に束ねる
                return (
                <div
                  key={it.page.id}
                  data-pres-result-page={i + 1}
                  style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-primary)' }}
                >
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {/* 左: スライド（§4-1 目視確認のため原稿と並べる） */}
                    <div data-pres-slide style={{ flex: '1 1 260px', minWidth: 240 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {i + 1}枚目 — {pageLabelOf(it.page)}
                      </div>
                      {it.page.imageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          data-pres-slide-image
                          src={it.page.imageDataUrl}
                          alt={`${pageLabelOf(it.page)} のスライド`}
                          style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', background: '#ffffff' }}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>
                          （このページに画像はありません）
                        </div>
                      )}
                    </div>
                    {/* 右: 原稿 */}
                    <div data-pres-script style={{ flex: '2 1 360px', minWidth: 280 }}>
                      {it.status === 'running' && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⏳ 生成中...</div>
                      )}
                      {it.status === 'failed' && (
                        <div data-pres-page-error style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.7 }}>
                          ⚠️ このページの生成に失敗しました（{it.error}）。他のページの原稿はそのまま使えます。
                        </div>
                      )}
                      {r && (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                            {r.slideTitle || pageLabelOf(it.page)}
                          </div>
                          {SCRIPT_SECTION_DEFS.map((d) => (
                            <div key={d.key} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>{d.label}</div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                                {r.sections[d.key] || '（生成されませんでした）'}
                              </div>
                            </div>
                          ))}
                          {it.adCheck && it.adCheck.status === 'warn' && it.adCheck.findings.length > 0 && (
                            <div style={{ fontSize: 11, color: '#f59e0b', lineHeight: 1.7, marginBottom: 8 }}>
                              ⚠️ 医療広告の観点で確認したい点: {it.adCheck.findings.join(' / ')}
                            </div>
                          )}
                          {!it.adCheck && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                              医療広告チェックは未実施です（時間内に終わりませんでした）。表現はご自身でご確認ください。
                            </div>
                          )}
                        </>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        <button
                          data-pres-regenerate
                          type="button"
                          onClick={() => regenerateOne(i)}
                          disabled={running || (!it.page.imageDataUrl && !it.page.text.trim())}
                          title={!it.page.imageDataUrl && !it.page.text.trim()
                            ? '復元した原稿には資料が含まれていません。同じ資料を読み込み直すと作り直せます'
                            : undefined}
                          style={btn(false)}
                        >
                          🔁 このページだけ作り直す
                        </button>
                        {r && (
                          <button
                            data-pres-copy-page
                            type="button"
                            onClick={() => copyMarkdown(pageScriptToMarkdown(it.page, i + 1, r), `p${i}`)}
                            style={btn(false)}
                          >
                            {copied === `p${i}` ? '✅ コピーしました' : '📋 この1枚をコピー'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div
              data-pres-full
              className="markdown-body"
              style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.9 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(fullMarkdown) }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function blankState(page: SlidePage): PageState {
  return { page, status: 'idle', result: null, adCheck: null, error: '' };
}
