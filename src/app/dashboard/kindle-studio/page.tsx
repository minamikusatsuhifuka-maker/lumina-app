'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

/* ---------- 型定義 ---------- */
interface ChapterOutline {
  chapter_num: number;
  title: string;
  summary: string;
  key_points: string[];
  estimated_pages: number;
  illustration_note: string;
}

interface OutlineResult {
  book_title: string;
  subtitle: string;
  tagline: string;
  target_reader: string;
  unique_value: string;
  chapters: ChapterOutline[];
  foreword_outline: string;
  afterword_outline: string;
  cover_text: { front: string; back: string; author_bio: string };
  kdp_keywords: string[];
  kdp_categories: string[];
  estimated_total_pages: number;
  pricing_suggestion: string;
}

/* ---------- 定数 ---------- */
const BOOK_TYPES = [
  { value: 'guide', label: '解説書', icon: '📘' },
  { value: 'novel', label: '小説', icon: '📗' },
  { value: 'picture', label: '絵本', icon: '🎨' },
  { value: 'puzzle', label: 'パズル', icon: '🧩' },
] as const;

const CHAPTER_COUNTS = ['3', '5', '7', '8', '10', '12', '15'];
const PAGE_COUNTS = ['30〜50', '50〜80', '80〜120', '120〜160', '160〜200', '200〜300'];
const WRITING_STYLES = [
  { value: 'polite', label: '丁寧語・解説調' },
  { value: 'casual', label: 'カジュアル・語りかけ' },
  { value: 'academic', label: '学術的・論文調' },
  { value: 'story', label: '物語調・エッセイ風' },
  { value: 'conversation', label: '会話形式' },
];

const SAMPLE_DATA: Record<string, { title: string; theme: string; targetReader: string }> = {
  guide: {
    title: 'ChatGPTで始める副業入門',
    theme: 'AI活用による副業の始め方。プロンプト設計からマネタイズまでを初心者向けに解説',
    targetReader: '副業を始めたい会社員・主婦',
  },
  novel: {
    title: 'AIが紡ぐ恋文',
    theme: 'AI翻訳家と人間の詩人が出会い、言葉の本質について対話する短編ラブストーリー',
    targetReader: 'SF好きの20〜40代読者',
  },
  picture: {
    title: 'プログラミングねこのぼうけん',
    theme: 'プログラミングの基本概念（順次・分岐・繰り返し）を猫の冒険で学ぶ知育絵本',
    targetReader: '5〜8歳の子どもとその親',
  },
  puzzle: {
    title: '脳トレ漢字パズル100',
    theme: '漢字の読み・書き・熟語パズル。クロスワード、穴埋め、しりとり形式',
    targetReader: 'シニア層・漢字好きの大人',
  },
};

export default function KindleStudioPage() {
  /* --- 共通 state --- */
  const [bookType, setBookType] = useState<string>('guide');
  const [activeTab, setActiveTab] = useState<'outline' | 'write'>('outline');

  /* --- 構成タブ state --- */
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [targetReader, setTargetReader] = useState('');
  const [chapterCount, setChapterCount] = useState('7');
  const [pageCount, setPageCount] = useState('80〜120');
  const [writingStyle, setWritingStyle] = useState('polite');
  const [outline, setOutline] = useState<OutlineResult | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState('');
  const { progress: outlineProgress, loading: outlineProgressLoading, startProgress: startOutline, completeProgress: completeOutline, resetProgress: resetOutline } = useProgress();

  /* --- 執筆タブ state --- */
  const [chapters, setChapters] = useState<Record<number, string>>({});
  const [writingChapter, setWritingChapter] = useState<number | null>(null);
  const [bulkWriting, setBulkWriting] = useState(false);
  const { progress: writeProgress, loading: writeProgressLoading, startProgress: startWrite, completeProgress: completeWrite, resetProgress: resetWrite } = useProgress();

  /* --- スタイル --- */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 20, marginBottom: 16,
  };

  /* --- サンプル入力 --- */
  const fillSample = () => {
    const s = SAMPLE_DATA[bookType] || SAMPLE_DATA.guide;
    setTitle(s.title);
    setTheme(s.theme);
    setTargetReader(s.targetReader);
  };

  /* --- 構成生成 --- */
  const generateOutline = async () => {
    if (!title.trim()) return;
    setOutlineLoading(true);
    startOutline();
    setOutlineError('');
    setOutline(null);
    setChapters({});

    try {
      const res = await fetch('/api/kindle/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, bookType, theme, targetReader, chapterCount, pageCount }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutline(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutlineError(`構成案の生成に失敗しました: ${msg}`);
      resetOutline();
    } finally {
      setOutlineLoading(false);
      completeOutline();
    }
  };

  /* --- 章の執筆 --- */
  const writeChapter = async (ch: ChapterOutline) => {
    setWritingChapter(ch.chapter_num);
    try {
      const res = await fetch('/api/kindle/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: outline?.book_title || title,
          bookType,
          chapterTitle: ch.title,
          chapterSummary: ch.summary,
          keyPoints: ch.key_points,
          targetReader: outline?.target_reader || targetReader,
          writingStyle: WRITING_STYLES.find(s => s.value === writingStyle)?.label || writingStyle,
          illustrationNote: ch.illustration_note,
          estimatedPages: ch.estimated_pages,
        }),
      });
      if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChapters(prev => ({ ...prev, [ch.chapter_num]: data.content }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setChapters(prev => ({ ...prev, [ch.chapter_num]: `【エラー】${msg}` }));
    } finally {
      setWritingChapter(null);
    }
  };

  /* --- 全章一括生成 --- */
  const writeAllChapters = async () => {
    if (!outline) return;
    setBulkWriting(true);
    startWrite();
    for (const ch of outline.chapters) {
      if (chapters[ch.chapter_num]) continue; // 既に執筆済みはスキップ
      await writeChapter(ch);
    }
    setBulkWriting(false);
    completeWrite();
  };

  /* --- エクスポート --- */
  const exportFullBook = () => {
    if (!outline) return;
    const lines: string[] = [];
    lines.push(`# ${outline.book_title}`);
    if (outline.subtitle) lines.push(`## ${outline.subtitle}`);
    lines.push('');
    if (outline.foreword_outline) {
      lines.push('# まえがき');
      lines.push(outline.foreword_outline);
      lines.push('');
    }
    for (const ch of outline.chapters) {
      if (chapters[ch.chapter_num]) {
        lines.push(chapters[ch.chapter_num]);
      } else {
        lines.push(`# 第${ch.chapter_num}章 ${ch.title}`);
        lines.push(`（未執筆: ${ch.summary}）`);
      }
      lines.push('');
    }
    if (outline.afterword_outline) {
      lines.push('# あとがき');
      lines.push(outline.afterword_outline);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kindle_${outline.book_title.replace(/\s/g, '_')}_${Date.now()}.txt`;
    a.click();
  };

  const completedCount = outline ? outline.chapters.filter(ch => chapters[ch.chapter_num]).length : 0;
  const totalCount = outline ? outline.chapters.length : 0;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={outlineProgressLoading || writeProgressLoading} progress={activeTab === 'outline' ? outlineProgress : writeProgress} label={activeTab === 'outline' ? '構成案を生成中...' : '章を執筆中...'} />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📚 Kindle出版自動化スタジオ
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
        AIが本の構成案を作成し、各章を自動執筆。KDP出版に必要な全データを一括生成
      </p>

      {/* --- 書籍タイプ選択 --- */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {BOOK_TYPES.map(bt => (
          <button
            key={bt.value}
            onClick={() => { setBookType(bt.value); setOutline(null); setChapters({}); }}
            style={{
              flex: 1, padding: '14px 8px', borderRadius: 10, cursor: 'pointer',
              border: bookType === bt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: bookType === bt.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-secondary)',
              color: bookType === bt.value ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: bookType === bt.value ? 700 : 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 26 }}>{bt.icon}</span>
            <span>{bt.label}</span>
          </button>
        ))}
      </div>

      {/* --- タブ --- */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {([
          { key: 'outline' as const, label: '📋 基本設定・構成生成' },
          { key: 'write' as const, label: '✍️ 本文執筆' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              border: 'none', borderBottom: activeTab === tab.key ? '3px solid var(--accent)' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s', marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============== 構成タブ ============== */}
      {activeTab === 'outline' && (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>書籍の基本情報</span>
              <button onClick={fillSample} style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
              }}>サンプルを入力</button>
            </div>

            {/* タイトル */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>書籍タイトル *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：ChatGPTで始める副業入門" style={inputStyle} />
            </div>

            {/* テーマ */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>テーマ・内容</label>
              <textarea value={theme} onChange={e => setTheme(e.target.value)} placeholder="本の内容、扱うテーマ、伝えたいメッセージなど..." rows={4} style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.6 }} />
            </div>

            {/* ターゲット読者 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲット読者</label>
              <input value={targetReader} onChange={e => setTargetReader(e.target.value)} placeholder="例：副業を始めたい会社員・主婦" style={inputStyle} />
            </div>

            {/* 章数・ページ数・文体 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>章数</label>
                <select value={chapterCount} onChange={e => setChapterCount(e.target.value)} style={inputStyle}>
                  {CHAPTER_COUNTS.map(c => <option key={c} value={c}>{c}章</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ページ数</label>
                <select value={pageCount} onChange={e => setPageCount(e.target.value)} style={inputStyle}>
                  {PAGE_COUNTS.map(p => <option key={p} value={p}>{p}ページ</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>文体</label>
                <select value={writingStyle} onChange={e => setWritingStyle(e.target.value)} style={inputStyle}>
                  {WRITING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={generateOutline} disabled={outlineLoading || !title.trim()} style={{
                padding: '12px 36px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15,
                cursor: outlineLoading ? 'not-allowed' : 'pointer',
                opacity: (outlineLoading || !title.trim()) ? 0.5 : 1,
              }}>
                {outlineLoading ? '構成案を生成中...' : '📋 構成案を生成'}
              </button>
            </div>
          </div>

          {/* エラー */}
          {outlineError && (
            <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
              {outlineError}
            </div>
          )}

          {/* ローディング */}
          {outlineLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
              <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              AIが本の構成を設計しています...
            </div>
          )}

          {/* --- 構成結果 --- */}
          {outline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* アクションバー */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SaveToLibraryButton
                  title={`Kindle構成: ${outline.book_title}`}
                  content={JSON.stringify(outline, null, 2)}
                  type="kindle-outline"
                  groupName="Kindle出版"
                  tags={`Kindle,${BOOK_TYPES.find(b => b.value === bookType)?.label || bookType},構成案`}
                />
                <button onClick={() => setActiveTab('write')} style={{
                  padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                  border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  ✍️ 本文執筆へ進む
                </button>
              </div>

              {/* 書籍情報カード */}
              <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {outline.book_title}
                </div>
                {outline.subtitle && (
                  <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {outline.subtitle}
                  </div>
                )}
                {outline.tagline && (
                  <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, fontStyle: 'italic', marginBottom: 12 }}>
                    &ldquo;{outline.tagline}&rdquo;
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>ターゲット</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.target_reader}</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>推定ページ数</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.estimated_total_pages}ページ</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>推奨価格</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{outline.pricing_suggestion}</div>
                  </div>
                </div>
              </div>

              {/* 章リスト */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                  📖 章構成（{outline.chapters.length}章）
                </div>
                {outline.chapters.map(ch => (
                  <div key={ch.chapter_num} style={{
                    padding: 14, marginBottom: 10, background: 'var(--bg-primary)',
                    border: '1px solid var(--border)', borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
                      }}>
                        {ch.chapter_num}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{ch.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        約{ch.estimated_pages}ページ
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                      {ch.summary}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ch.key_points.map((kp, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 20,
                          background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                          color: 'var(--text-secondary)',
                        }}>{kp}</span>
                      ))}
                    </div>
                    {ch.illustration_note && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                        🎨 {ch.illustration_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* KDPキーワード・カテゴリ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔑 KDPキーワード</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {outline.kdp_keywords.map((kw, i) => (
                      <span key={i} style={{
                        fontSize: 12, padding: '4px 12px', borderRadius: 20,
                        background: 'rgba(0,212,184,0.08)', border: '1px solid rgba(0,212,184,0.2)',
                        color: 'var(--text-secondary)',
                      }}>{kw}</span>
                    ))}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📂 KDPカテゴリ</div>
                  {outline.kdp_categories.map((cat, i) => (
                    <div key={i} style={{
                      fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ color: '#6c63ff', fontWeight: 700 }}>•</span> {cat}
                    </div>
                  ))}
                </div>
              </div>

              {/* 表紙テキスト */}
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📕 表紙テキスト</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>表紙</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.front}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>裏表紙</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.back}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>著者プロフィール</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{outline.cover_text.author_bio}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============== 執筆タブ ============== */}
      {activeTab === 'write' && (
        <>
          {!outline ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                まず構成案を生成してください
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                「基本設定・構成生成」タブで書籍の構成を作成すると、ここで各章を執筆できます
              </div>
              <button onClick={() => setActiveTab('outline')} style={{
                padding: '10px 24px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
                📋 構成タブへ
              </button>
            </div>
          ) : (
            <>
              {/* 進捗バー */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    執筆進捗: {completedCount} / {totalCount} 章完了
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={writeAllChapters} disabled={bulkWriting || completedCount === totalCount} style={{
                      padding: '8px 20px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                      color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13,
                      cursor: (bulkWriting || completedCount === totalCount) ? 'not-allowed' : 'pointer',
                      opacity: (bulkWriting || completedCount === totalCount) ? 0.5 : 1,
                    }}>
                      {bulkWriting ? '一括執筆中...' : '⚡ 全章一括生成'}
                    </button>
                    {completedCount > 0 && (
                      <button onClick={exportFullBook} style={{
                        padding: '8px 20px', background: 'var(--bg-primary)',
                        border: '1px solid var(--border)', color: 'var(--text-secondary)',
                        borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      }}>
                        💾 原稿をエクスポート
                      </button>
                    )}
                  </div>
                </div>
                {/* プログレスバー */}
                <div style={{ width: '100%', height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width 0.3s ease',
                    background: 'linear-gradient(90deg, #6c63ff, #00d4b8)',
                    width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%',
                  }} />
                </div>
              </div>

              {/* 各章カード */}
              {outline.chapters.map(ch => (
                <div key={ch.chapter_num} style={{ ...cardStyle, borderLeft: chapters[ch.chapter_num] ? '4px solid #4ade80' : '4px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                        background: chapters[ch.chapter_num] ? '#4ade80' : 'var(--bg-primary)',
                        color: chapters[ch.chapter_num] ? '#fff' : 'var(--text-muted)',
                        border: chapters[ch.chapter_num] ? 'none' : '1px solid var(--border)',
                      }}>
                        {chapters[ch.chapter_num] ? '✓' : ch.chapter_num}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        第{ch.chapter_num}章: {ch.title}
                      </span>
                    </div>
                    {!chapters[ch.chapter_num] && (
                      <button
                        onClick={() => writeChapter(ch)}
                        disabled={writingChapter === ch.chapter_num || bulkWriting}
                        style={{
                          padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: writingChapter === ch.chapter_num ? 'var(--bg-primary)' : 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                          color: writingChapter === ch.chapter_num ? 'var(--text-muted)' : '#fff',
                          border: 'none',
                          opacity: (writingChapter === ch.chapter_num || bulkWriting) ? 0.5 : 1,
                        }}
                      >
                        {writingChapter === ch.chapter_num ? '執筆中...' : '✍️ 執筆'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {ch.summary} （約{ch.estimated_pages}ページ）
                  </div>
                  {chapters[ch.chapter_num] && (
                    <pre style={{
                      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      padding: 16, background: 'var(--bg-primary)', borderRadius: 8,
                      border: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto',
                      fontFamily: 'inherit',
                    }}>
                      {chapters[ch.chapter_num]}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ツールリンク集 */}
      <div style={{ marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 32 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>🔗 次に使うおすすめAIツール</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>xLUMINAで生成した原稿を以下のツールと組み合わせるとより高品質な作品が完成します。</p>
        {(() => {
          const TOOLS: Record<string, { name: string; desc: string; url: string; icon: string; badge: string; badgeColor: string }[]> = {
            guide: [
              { name: 'Vellum', desc: 'Kindle＆PDF同時組版。原稿を貼るだけで美しい本に。Mac専用。', url: 'https://vellum.pub', icon: '📖', badge: '★ 組版', badgeColor: '#8b5cf6' },
              { name: 'DALL-E 3', desc: '手順図・フロー図・説明図をテキスト指示で生成。', url: 'https://chat.openai.com', icon: '🤖', badge: '図解生成', badgeColor: '#22c55e' },
              { name: 'Midjourney', desc: 'プロ品質の表紙・カバー画像を生成。', url: 'https://midjourney.com', icon: '🎨', badge: '表紙制作', badgeColor: '#3b82f6' },
              { name: 'Canva', desc: '図解・インフォグラフィック・表紙デザインのテンプレートが豊富。', url: 'https://www.canva.com', icon: '🖼️', badge: 'レイアウト', badgeColor: '#14b8a6' },
            ],
            novel: [
              { name: 'Sudowrite', desc: '小説専用AI。続き提案・場面描写強化・書き直しが得意。', url: 'https://sudowrite.com', icon: '✍️', badge: '★ 小説AI', badgeColor: '#8b5cf6' },
              { name: 'ProWritingAid', desc: '文体の一貫性・繰り返し・テンポを分析。', url: 'https://prowritingaid.com', icon: '🔍', badge: '文体チェック', badgeColor: '#3b82f6' },
              { name: 'Midjourney', desc: '小説の世界観を表現する表紙・挿絵を生成。', url: 'https://midjourney.com', icon: '🎨', badge: '表紙・世界観', badgeColor: '#f59e0b' },
              { name: 'Vellum', desc: '小説の組版に最適。章タイトル・目次・フォントが自動で美しく整う。', url: 'https://vellum.pub', icon: '📖', badge: '組版', badgeColor: '#22c55e' },
            ],
            picture: [
              { name: 'Midjourney', desc: '絵本イラスト最高品質。--srefで全ページスタイル統一。', url: 'https://midjourney.com', icon: '🎨', badge: '★ イラスト', badgeColor: '#ec4899' },
              { name: 'xLUMINA 難易度変換', desc: '生成テキストを「小学生向け」に自動変換。', url: '/dashboard/simplifier', icon: '🎓', badge: 'xLUMINA内', badgeColor: '#6c63ff' },
              { name: 'Adobe Firefly', desc: '著作権的に最も安全。商業出版の絵本イラストに最適。', url: 'https://www.adobe.com/jp/products/firefly.html', icon: '✨', badge: '商用安全', badgeColor: '#ef4444' },
              { name: 'Canva', desc: '絵本テンプレートで画像と文章を美しく配置。', url: 'https://www.canva.com', icon: '📐', badge: 'レイアウト', badgeColor: '#14b8a6' },
              { name: 'Book Creator', desc: '絵本専用作成ツール。音声・アニメーションも追加可。', url: 'https://bookcreator.com', icon: '📚', badge: '絵本専用', badgeColor: '#eab308' },
            ],
            puzzle: [
              { name: 'Crossword Labs', desc: '単語リストを貼るだけでクロスワード自動完成。完全無料。', url: 'https://crosswordlabs.com', icon: '🔤', badge: '★ 無料', badgeColor: '#f59e0b' },
              { name: 'Discovery Puzzle Maker', desc: 'ワードサーチ・迷路など複数種類を自動生成。', url: 'https://puzzlemaker.discoveryeducation.com', icon: '🔠', badge: '無料', badgeColor: '#3b82f6' },
              { name: 'Canva', desc: 'パズル本のテンプレートで全ページを美しくレイアウト。', url: 'https://www.canva.com', icon: '📐', badge: 'レイアウト', badgeColor: '#14b8a6' },
              { name: 'ランサーズ', desc: 'AI苦手な迷路・間違い探しを専門クリエイターに外注。1問500円〜。', url: 'https://www.lancers.jp', icon: '🤝', badge: '外注', badgeColor: '#22c55e' },
            ],
          };
          const tools = TOOLS[bookType] ?? TOOLS.guide;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              {tools.map(t => (
                <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)', textDecoration: 'none',
                  transition: 'background 0.15s',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: `${t.badgeColor}20`, color: t.badgeColor }}>{t.badge}</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.desc}</p>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>
                </a>
              ))}
              <a href="https://kdp.amazon.co.jp" target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12,
                border: '2px solid rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.06)', textDecoration: 'none',
                gridColumn: 'span 2',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>📦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>KDP（Kindle Direct Publishing）</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,166,35,0.2)', color: '#b45309' }}>最終出版 無料</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Amazon公式出版プラットフォーム。無料で出版、印税35〜70%。</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>
              </a>
            </div>
          );
        })()}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>📋 出版前に確認すべきリンク</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: 'KDP ヘルプ', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200635650' },
              { label: 'KDP 料金・印税', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200634500' },
              { label: '表紙ガイドライン', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200645690' },
              { label: 'コンテンツガイドライン', url: 'https://kdp.amazon.co.jp/ja_JP/help/topic/G200672390' },
            ].map(link => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 11, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none', textAlign: 'center',
              }}>{link.label} ↗</a>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
