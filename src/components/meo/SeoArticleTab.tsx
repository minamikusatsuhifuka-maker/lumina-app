'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import {
  card,
  inputStyle,
  primaryBtn,
  smallBtn,
  SectionTitle,
  ErrorBox,
  AdCheckBadge,
  AdCheckFindings,
  type AdCheck,
} from '@/components/meo/ui';

const ARTICLE_TYPES = [
  { key: 'symptom', label: '症状解説' },
  { key: 'treatment', label: '施術・治療案内' },
  { key: 'column', label: '季節コラム' },
];

interface SavedArticle {
  id: number;
  keyword: string;
  type: string | null;
  content: string;
  ad_check: AdCheck | null;
  created_at: string;
}

// 自動下書き（feature_result_drafts feature_key='seo-article'）のpayload
// 医療広告チェック結果（adCheck）も一緒に復元し、再チェック不要にする
interface SeoArticleDraftPayload {
  keyword?: string;
  type?: string;
  content?: string;
  adCheck?: AdCheck | null;
  related?: string[];
}

export default function SeoArticleTab({ initialKeyword }: { initialKeyword?: string }) {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('symptom');

  // 順位トラッカーの「記事を作成」から渡されたキーワードを反映
  useEffect(() => {
    if (initialKeyword) setKeyword(initialKeyword);
  }, [initialKeyword]);
  const [content, setContent] = useState('');
  const [adCheck, setAdCheck] = useState<AdCheck | undefined>(undefined);
  const [related, setRelated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedArticle[]>([]);
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // 復元取得が返ってきた時点で既に入力/実行が始まっていたら復元しない
  // （順位トラッカー「記事を作成」からの initialKeyword 引き継ぎ含む）
  const draftGuardRef = useRef(false);
  draftGuardRef.current =
    loading || !!content || !!keyword.trim() || !!initialKeyword;

  // マウント時に前回の実行結果（自動下書き）を復元。正はDB＝端末をまたいで復元できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<SeoArticleDraftPayload>('seo-article');
      if (cancelled || !draft?.payload?.content) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setKeyword(p.keyword ?? '');
      if (p.type) setType(p.type);
      setContent(p.content ?? '');
      setAdCheck(p.adCheck ?? undefined);
      setRelated(Array.isArray(p.related) ? p.related : []);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す（復元は表示のみで副作用なし）
  const handleClearDraft = () => {
    setRestoredAt(null);
    setKeyword('');
    setContent('');
    setAdCheck(undefined);
    setRelated([]);
    clearFeatureDraft('seo-article');
  };

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/articles');
      const json = await res.json();
      if (res.ok) setHistory(json.articles || []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const generate = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    setRestoredAt(null); // 新規実行結果は「復元」ではない
    setContent('');
    setAdCheck(undefined);
    setRelated([]);
    try {
      const res = await fetch('/api/seo/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, type }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || '生成に失敗しました');
      else {
        setContent(json.content || '');
        setAdCheck(json.ad_check);
        setRelated(json.related || []);
        // 完了した結果を自動下書き保存（医療広告チェック結果ごと復元できるようにする）
        if (json.content) {
          saveFeatureDraft('seo-article', {
            keyword,
            type,
            content: json.content,
            adCheck: json.ad_check ?? null,
            related: json.related || [],
          } satisfies SeoArticleDraftPayload);
        }
      }
    } catch {
      setError('生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!content) return;
    await fetch('/api/seo/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, type, content, adCheck: adCheck ?? null }),
    });
    await loadHistory();
  };

  const remove = async (id: number) => {
    await fetch('/api/seo/articles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadHistory();
  };

  const downloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${keyword || 'article'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* 自動下書きからの復元バナー */}
      {restoredAt && (
        <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
      )}

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>狙うキーワード</label>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="例）南草津 ニキビ 治療"
          style={inputStyle}
        />
        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 12, display: 'block' }}>
          記事タイプ
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
          {ARTICLE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <button onClick={generate} disabled={loading || !keyword.trim()} style={primaryBtn}>
          {loading ? '生成中…（最大数十秒）' : '記事ドラフトを生成'}
        </button>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          ※ 自動公開はしません。生成→医療広告チェック確認→コピー/MD出力/保存して院長が公開判断。
        </p>
      </div>

      {error && <ErrorBox message={error} onRetry={generate} />}

      {content && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>生成ドラフト</span>
            <AdCheckBadge adCheck={adCheck} />
          </div>
          <AdCheckFindings adCheck={adCheck} />
          {related.length > 0 && (
            <p style={{ fontSize: 12, color: '#0f766e', marginTop: 4 }}>
              関連語（GSC実データ）: {related.slice(0, 8).join(' / ')}
            </p>
          )}
          <div
            className="markdown-body"
            style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => copyToClipboard(content)} style={smallBtn}>
              コピー
            </button>
            <button onClick={downloadMd} style={smallBtn}>
              MD出力
            </button>
            <button onClick={save} style={smallBtn}>
              保存
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <SectionTitle>🗂 保存した記事</SectionTitle>
          {history.map((h) => (
            <div key={h.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {h.keyword}
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                    {new Date(h.created_at).toLocaleString('ja-JP')}
                  </span>
                </span>
                <AdCheckBadge adCheck={h.ad_check ?? undefined} />
              </div>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#0f766e' }}>本文を表示</summary>
                <div
                  className="markdown-body"
                  style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(h.content) }}
                />
              </details>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => copyToClipboard(h.content)} style={smallBtn}>
                  コピー
                </button>
                <button onClick={() => remove(h.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
