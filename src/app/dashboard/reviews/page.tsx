'use client';

import { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';

// ─── 型定義 ───

interface Review {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
  timestamp: number;
  profilePhoto: string;
}

interface DbReview {
  id: number;
  author_name: string;
  rating: number;
  text: string | null;
  review_date: string | null;
  source: string;
  created_at: string;
  replied_at: string | null;
  reply_text: string | null;
  // 145 口コミ管理：リスク判定列
  risk_flag?: boolean | null;
  risk_type?: string | null;
  risk_reason?: string | null;
  risk_score?: number | null;
  review_status?: string | null;
  analyzed_at?: string | null;
}

interface AdCheck {
  status?: 'ok' | 'warn';
  findings?: string[];
}

interface ReplyDraft {
  style: string;
  text: string;
  ad_check?: AdCheck;
}

interface ReplyDraftState {
  loading: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
  drafts?: ReplyDraft[];
  error?: string;
}

// 通報支援パネルの状態（レビューIDをキーに保持）
interface ReportState {
  loading?: boolean;
  policy?: string;
  confidence?: string;
  reportText?: string;
  error?: string;
  saving?: boolean;
  saved?: boolean;
}

interface ReportRecord {
  id: number;
  review_id: number;
  policy: string | null;
  report_text: string | null;
  status: string;
  reported_at: string | null;
  created_at: string;
  updated_at: string;
}

// Googleの公式報告導線（固定リンク。外部アプリからの自動送信は不可）
const GOOGLE_REPORT_LINKS = [
  { label: 'Googleマップでクチコミを報告', url: 'https://support.google.com/business/answer/4596773', note: 'クチコミ横の「︙」→「クチコミを報告」' },
  { label: 'ポリシー違反の報告フォーム', url: 'https://support.google.com/business/contact/business_review_reports_tool', note: 'マップ報告で対応されない場合の追加導線' },
  { label: '禁止コンテンツ（ポリシー本文）', url: 'https://support.google.com/contributionpolicy/answer/7400114', note: 'なりすまし・利益相反・スパム等の定義' },
];
const ANONYMITY_NOTICE = 'Googleへの報告は匿名で行われ、投稿者に「誰が報告したか」は通知されません。安心してご報告いただけます。';
const REPORT_STATUS_OPTIONS = ['未通報', '通報済み', '削除確認', '却下'];

interface PlaceData {
  placeId: string;
  name: string;
  rating: number;
  totalReviews: number;
  address: string;
  phone: string;
  website: string;
  mapsUrl: string;
  openingHours: string[];
  reviews: Review[];
}

interface AiAnalysis {
  summary: string;
  strengths: string[];
  improvements: string[];
  replyIdeas: string[];
  analyzedCount?: number;
  placesCount?: number;
  dbCount?: number;
}

// ─── ヘルパー ───

function StarRating({ rating, size = 18 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span style={{ display: 'inline-flex', gap: 2, fontSize: size }}>
      {'★'.repeat(full).split('').map((s, i) => <span key={`f${i}`} style={{ color: '#f59e0b' }}>{s}</span>)}
      {half && <span style={{ color: '#f59e0b', opacity: 0.5 }}>★</span>}
      {'☆'.repeat(Math.max(0, empty)).split('').map((s, i) => <span key={`e${i}`} style={{ color: 'var(--border)' }}>{s}</span>)}
    </span>
  );
}

function ratingColor(r: number): string {
  if (r >= 4) return '#10b981';
  if (r >= 3) return '#f59e0b';
  return '#ef4444';
}

// ─── メインページ ───

export default function ReviewsPage() {
  const [data, setData] = useState<PlaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 手動登録関連
  const [dbReviews, setDbReviews] = useState<DbReview[]>([]);
  const [activeTab, setActiveTab] = useState<'places' | 'manual'>('places');
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // 返信文生成関連（レビューIDをキーにstateを保持）
  const [replyDrafts, setReplyDrafts] = useState<Record<number, ReplyDraftState>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── 145 口コミ管理 ───
  // ① 検知
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [filterFlagged, setFilterFlagged] = useState(false);
  // ② 通報支援（レビューIDをキーに保持）
  const [reportPanels, setReportPanels] = useState<Record<number, ReportState>>({});
  const [openReportId, setOpenReportId] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  // ③ 返信下書き保存メッセージ
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);

  // 通報記録の取得
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews/reports');
      if (!res.ok) return;
      const json = await res.json();
      setReports(json.reports ?? []);
    } catch { /* 無視 */ }
  }, []);

  // ① 悪質口コミを検知（全DB口コミにリスク判定を付与）
  const detectMalicious = async () => {
    setDetecting(true);
    setDetectMsg(null);
    try {
      const res = await fetch('/api/reviews/analyze', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '検知に失敗しました');
      await fetchDbReviews();
      setDetectMsg(`✅ ${json.analyzed}件を判定（フラグ付き ${json.flagged ?? 0}件）`);
      if ((json.flagged ?? 0) > 0) setFilterFlagged(true);
    } catch (e: unknown) {
      setDetectMsg(`⚠️ ${e instanceof Error ? e.message : '検知に失敗しました'}`);
    } finally {
      setDetecting(false);
    }
  };

  // ② 通報文を生成
  const generateReport = async (r: DbReview) => {
    setReportPanels((prev) => ({ ...prev, [r.id]: { ...prev[r.id], loading: true, error: undefined } }));
    try {
      const res = await fetch('/api/reviews/report-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: r.author_name, rating: r.rating, text: r.text, riskType: r.risk_type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '生成に失敗しました');
      setReportPanels((prev) => ({
        ...prev,
        [r.id]: { loading: false, policy: json.policy, confidence: json.confidence, reportText: json.report_text },
      }));
    } catch (e: unknown) {
      setReportPanels((prev) => ({
        ...prev,
        [r.id]: { loading: false, error: e instanceof Error ? e.message : '生成に失敗しました' },
      }));
    }
  };

  // ② 通報記録を保存
  const saveReport = async (reviewId: number, status: string) => {
    const panel = reportPanels[reviewId];
    setReportPanels((prev) => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: true } }));
    try {
      const res = await fetch('/api/reviews/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, policy: panel?.policy, reportText: panel?.reportText, status }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      await fetchReports();
      setReportPanels((prev) => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: false, saved: true } }));
    } catch (e: unknown) {
      setReportPanels((prev) => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: false, error: e instanceof Error ? e.message : '保存に失敗しました' } }));
    }
  };

  // ② 通報記録のステータス更新
  const updateReportStatus = async (id: number, status: string) => {
    try {
      const res = await fetch('/api/reviews/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      await fetchReports();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '更新に失敗しました');
    }
  };

  // ③ 返信下書きを履歴に保存
  const saveReplyDraft = async (reviewId: number, draft: ReplyDraft, tone?: string, key?: string) => {
    try {
      const res = await fetch('/api/reviews/reply-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, draftText: draft.text, tone, adCheckResult: draft.ad_check ?? null }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      if (key) { setSavedDraftKey(key); setTimeout(() => setSavedDraftKey(null), 2000); }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    }
  };

  // 返信文案を生成
  const generateReply = async (r: DbReview) => {
    setReplyDrafts((prev) => ({ ...prev, [r.id]: { loading: true } }));
    try {
      const res = await fetch('/api/reviews/reply-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: r.author_name, rating: r.rating, text: r.text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '生成に失敗しました');
      setReplyDrafts((prev) => ({
        ...prev,
        [r.id]: { loading: false, tone: json.tone, drafts: json.drafts ?? [] },
      }));
    } catch (e: unknown) {
      setReplyDrafts((prev) => ({
        ...prev,
        [r.id]: { loading: false, error: e instanceof Error ? e.message : '生成に失敗しました' },
      }));
    }
  };

  // クリップボードにコピー
  const copyReply = async (key: string, text: string) => {
    try {
      await copyToClipboard(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('クリップボードへのコピーに失敗しました');
    }
  };

  // 返信済みとして記録
  const markReplied = async (reviewId: number, replyText: string) => {
    try {
      const res = await fetch('/api/reviews/mark-replied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reviewId, replyText }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      await fetchDbReviews();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    }
  };

  // モーダルフォーム
  const [formAuthor, setFormAuthor] = useState('');
  const [formRating, setFormRating] = useState(5);
  const [formText, setFormText] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);

  // DB口コミ一覧取得
  const fetchDbReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/places/reviews/import');
      if (!res.ok) return;
      const json = await res.json();
      setDbReviews(json.reviews ?? []);
    } catch {
      // 無視
    }
  }, []);

  // 初回読み込み時にDB口コミ・通報記録を取得
  useEffect(() => { fetchDbReviews(); fetchReports(); }, [fetchDbReviews, fetchReports]);

  // 手動登録を保存
  const saveManualReview = async () => {
    if (!formAuthor.trim()) {
      alert('投稿者名を入力してください');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/places/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: [{
            author_name: formAuthor.trim(),
            rating: formRating,
            text: formText.trim(),
            review_date: formDate || null,
            source: 'manual',
          }],
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      await fetchDbReviews();
      setShowImportModal(false);
      setFormAuthor('');
      setFormRating(5);
      setFormText('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setActiveTab('manual');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // Google Places取得分を管理対象（DB）に取り込む。time+投稿者で external_id 生成→重複取り込み防止
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const importPlaceReview = async (review: Review) => {
    const key = `${review.timestamp}-${review.author}`;
    setImportingKey(key);
    try {
      const reviewDate = review.timestamp
        ? new Date(review.timestamp * 1000).toISOString().split('T')[0]
        : null;
      const res = await fetch('/api/places/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: [{
            author_name: review.author,
            rating: Math.round(review.rating) || 1,
            text: review.text,
            review_date: reviewDate,
            source: 'google_maps',
            time: review.timestamp,
          }],
        }),
      });
      if (!res.ok) throw new Error('取り込みに失敗しました');
      await fetchDbReviews();
      setActiveTab('manual');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '取り込みに失敗しました');
    } finally {
      setImportingKey(null);
    }
  };

  // 口コミデータ取得
  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/places/reviews');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '取得に失敗しました' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setAiAnalysis(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // AI口コミ分析
  const analyzeReviews = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/places/reviews/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews: data.reviews, name: data.name, rating: data.rating, totalReviews: data.totalReviews }),
      });
      if (!res.ok) throw new Error('AI分析に失敗しました');
      const analysis = await res.json();
      setAiAnalysis(analysis);
    } catch {
      // フォールバック: 簡易分析
      setAiAnalysis({
        summary: `${data.name}の口コミ${data.totalReviews}件を分析しました。総合評価は${data.rating}/5.0です。`,
        strengths: ['口コミデータを取得しました'],
        improvements: ['詳細な分析にはAI分析APIが必要です'],
        replyIdeas: [],
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .review-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .review-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .review-item {
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
          animation: slideUp 0.4s ease both;
        }
        .review-item:last-child { border-bottom: none; }
        .ai-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 22px;
          animation: slideUp 0.4s ease both;
        }
        .strength-item {
          padding: 8px 14px;
          border-radius: 8px;
          background: rgba(16,185,129,0.06);
          border-left: 3px solid #10b981;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .improve-item {
          padding: 8px 14px;
          border-radius: 8px;
          background: rgba(245,158,11,0.06);
          border-left: 3px solid #f59e0b;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .reply-item {
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(108,99,255,0.06);
          border: 1px solid rgba(108,99,255,0.12);
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
        }
      `}</style>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              fontSize: 18,
            }}>⭐</span>
            口コミ管理
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Googleマップの口コミ・評価をAIで分析し改善提案を行います
          </p>
        </div>
        <button
          onClick={fetchReviews}
          disabled={loading}
          style={{
            padding: '11px 24px', borderRadius: 10, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff',
            fontWeight: 700, fontSize: 13, opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
          }}
        >
          {loading ? '取得中...' : '口コミを取得'}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 24,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* 空状態 */}
      {!data && !loading && !error && (
        <div className="review-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.12))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          }}>⭐</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            口コミデータがまだ取得されていません
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            「口コミを取得」ボタンをクリックしてGoogleマップの口コミを取得してください
          </div>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Googleマップから口コミを取得しています...
        </div>
      )}

      {data && (
        <>
          {/* ═══ 総合評価カード ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* 総合評価 */}
            <div className="review-card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>総合評価</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: ratingColor(data.rating), lineHeight: 1 }}>
                {data.rating.toFixed(1)}
              </div>
              <div style={{ marginTop: 8 }}>
                <StarRating rating={data.rating} size={22} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>/5.0</div>
            </div>

            {/* 口コミ総数 */}
            <div className="review-card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>口コミ総数</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {data.totalReviews.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>件</div>
            </div>

            {/* クリニック情報 */}
            <div className="review-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>クリニック情報</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{data.name}</div>
              {data.address && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.4 }}>📍 {data.address}</div>
              )}
              {data.phone && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>📞 {data.phone}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {data.mapsUrl && (
                  <a href={data.mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: 'rgba(108,99,255,0.08)', color: '#6c63ff', textDecoration: 'none',
                  }}>Googleマップ ↗</a>
                )}
                {data.website && (
                  <a href={data.website} target="_blank" rel="noopener noreferrer" style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: 'rgba(16,185,129,0.08)', color: '#10b981', textDecoration: 'none',
                  }}>公式サイト ↗</a>
                )}
              </div>
            </div>
          </div>

          {/* ═══ 口コミ一覧 ═══ */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #f59e0b, #f97316)', borderRadius: 1 }} />
                口コミ一覧
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowImportModal(true)}
                  style={{
                    padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)',
                    cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                    fontWeight: 700, fontSize: 12,
                  }}
                >
                  📋 口コミを手動登録
                </button>
                <button
                  onClick={analyzeReviews}
                  disabled={aiLoading}
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: 'none',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff',
                    fontWeight: 700, fontSize: 12, opacity: aiLoading ? 0.6 : 1,
                    boxShadow: '0 3px 12px rgba(108,99,255,0.25)',
                  }}
                >
                  {aiLoading ? '🤖 分析中...' : `🤖 AIで口コミ分析（${data.reviews.length + dbReviews.length}件）`}
                </button>
                <button
                  onClick={detectMalicious}
                  disabled={detecting}
                  title="登録済み口コミにAIでリスク判定（悪質口コミの検知）を行います"
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: 'none',
                    cursor: detecting ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff',
                    fontWeight: 700, fontSize: 12, opacity: detecting ? 0.6 : 1,
                    boxShadow: '0 3px 12px rgba(239,68,68,0.25)',
                  }}
                >
                  {detecting ? '🚨 検知中...' : '🚨 悪質口コミを検知'}
                </button>
              </div>
            </div>

            {/* 検知結果メッセージ */}
            {detectMsg && (
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{detectMsg}</div>
            )}

            {/* タブ切り替え */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'places' as const, label: 'Google Places取得分', count: data.reviews.length, icon: '🗺️' },
                { key: 'manual' as const, label: '手動登録分', count: dbReviews.length, icon: '📋' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '10px 18px', border: 'none', cursor: 'pointer',
                    background: 'transparent',
                    color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 13, fontWeight: 700,
                    borderBottom: activeTab === tab.key ? '2px solid #f59e0b' : '2px solid transparent',
                    marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{tab.icon}</span> {tab.label}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 22, height: 20, padding: '0 6px', borderRadius: 10, fontSize: 11,
                    background: activeTab === tab.key ? 'rgba(245,158,11,0.12)' : 'var(--bg-primary)',
                    color: activeTab === tab.key ? '#f59e0b' : 'var(--text-muted)',
                  }}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Google Places取得分 */}
            {activeTab === 'places' && (
              <div className="review-card" style={{ overflow: 'hidden' }}>
                {data.reviews.length > 0 ? (
                  data.reviews.map((review, i) => (
                    <div key={i} className="review-item" style={{ animationDelay: `${i * 0.08}s` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        {review.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={review.profilePhoto} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                        ) : (
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, color: '#fff',
                          }}>
                            {review.author.charAt(0)}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{review.author}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <StarRating rating={review.rating} size={14} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{review.relativeTime}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: ratingColor(review.rating) }}>
                          {review.rating}.0
                        </div>
                      </div>
                      {review.text && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 42 }}>
                          {review.text}
                        </div>
                      )}
                      {/* 管理対象（DB）へ取り込む：検知・通報支援・返信の対象にできる */}
                      <div style={{ paddingLeft: 42, marginTop: 10 }}>
                        <button
                          onClick={() => importPlaceReview(review)}
                          disabled={importingKey === `${review.timestamp}-${review.author}`}
                          title="この口コミを管理対象（検知・通報支援・返信）に追加します"
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                            fontSize: 11, fontWeight: 700,
                            cursor: importingKey === `${review.timestamp}-${review.author}` ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {importingKey === `${review.timestamp}-${review.author}` ? '⏳ 取り込み中…' : '⬇️ 取り込んで管理'}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    口コミがありません
                  </div>
                )}
              </div>
            )}

            {/* 手動登録分（管理対象） */}
            {activeTab === 'manual' && (() => {
              const flaggedCount = dbReviews.filter((r) => r.risk_flag).length;
              const visible = filterFlagged ? dbReviews.filter((r) => r.risk_flag) : dbReviews;
              return (
              <>
              {/* 管理ツールバー：フラグ絞り込み */}
              {dbReviews.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setFilterFlagged((v) => !v)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: filterFlagged ? '1px solid #ef4444' : '1px solid var(--border)',
                      background: filterFlagged ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)',
                      color: filterFlagged ? '#ef4444' : 'var(--text-secondary)',
                    }}
                  >
                    🚩 フラグ付きのみ{flaggedCount > 0 ? `（${flaggedCount}）` : ''}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {flaggedCount > 0 ? `要対応の疑い ${flaggedCount}件` : '「🚨 悪質口コミを検知」でリスク判定できます'}
                  </span>
                </div>
              )}
              <div className="review-card" style={{ overflow: 'hidden' }}>
                {visible.length > 0 ? (
                  visible.map((r, i) => (
                    <div key={r.id} className="review-item" style={{ animationDelay: `${i * 0.08}s` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#fff',
                        }}>
                          {r.author_name.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.author_name}
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                              background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                            }}>
                              {r.source === 'manual' ? '手動登録' : r.source}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <StarRating rating={r.rating} size={14} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {r.review_date
                                ? new Date(r.review_date).toLocaleDateString('ja-JP')
                                : new Date(r.created_at).toLocaleDateString('ja-JP')}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: ratingColor(r.rating) }}>
                          {r.rating}.0
                        </div>
                      </div>
                      {r.text && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 42 }}>
                          {r.text}
                        </div>
                      )}

                      {/* ① リスク判定バッジ */}
                      {r.analyzed_at && (
                        <div style={{ paddingLeft: 42, marginTop: 10 }}>
                          {r.risk_flag ? (
                            <div style={{
                              padding: '8px 12px', borderRadius: 8,
                              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.12)' }}>
                                  🚩 要対応の疑い
                                </span>
                                {r.risk_type && (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{r.risk_type}</span>
                                )}
                                {typeof r.risk_score === 'number' && (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>リスク {r.risk_score}/100</span>
                                )}
                              </div>
                              {r.risk_reason && (
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                                  判定理由: {r.risk_reason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.08)' }}>
                              ✅ 問題なし{r.risk_type === '単なる低評価' ? '（実体験の低評価／ポリシー違反ではありません）' : ''}
                            </span>
                          )}
                        </div>
                      )}

                      {/* ② 通報支援（フラグ付きのみ） */}
                      {r.risk_flag && (
                        <div style={{ paddingLeft: 42, marginTop: 10 }}>
                          <button
                            onClick={() => setOpenReportId(openReportId === r.id ? null : r.id)}
                            style={{
                              padding: '7px 14px', borderRadius: 8,
                              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                              color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            📣 Google通報支援
                          </button>

                          {openReportId === r.id && (
                            <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {/* 匿名性の明記 */}
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                🔒 {ANONYMITY_NOTICE}
                              </div>

                              {/* 通報文生成 */}
                              <div>
                                <button
                                  onClick={() => generateReport(r)}
                                  disabled={reportPanels[r.id]?.loading}
                                  style={{
                                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                                    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                    fontSize: 12, fontWeight: 700,
                                    cursor: reportPanels[r.id]?.loading ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {reportPanels[r.id]?.loading ? '🤖 生成中…' : '🤖 該当ポリシー指摘＋通報文を生成'}
                                </button>
                                {reportPanels[r.id]?.error && (
                                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>⚠️ {reportPanels[r.id]?.error}</div>
                                )}
                              </div>

                              {reportPanels[r.id]?.reportText && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    該当ポリシー: <span style={{ color: '#ef4444' }}>{reportPanels[r.id]?.policy}</span>
                                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                      （違反の確からしさ: {reportPanels[r.id]?.confidence}）
                                    </span>
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <textarea
                                      value={reportPanels[r.id]?.reportText}
                                      onChange={(e) => setReportPanels((prev) => ({ ...prev, [r.id]: { ...prev[r.id], reportText: e.target.value } }))}
                                      rows={5}
                                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                                    />
                                  </div>
                                  <button
                                    onClick={() => copyReply(`report-${r.id}`, reportPanels[r.id]?.reportText || '')}
                                    style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                                  >
                                    {copiedId === `report-${r.id}` ? '✓ コピー完了' : '📋 通報文をコピー'}
                                  </button>
                                </div>
                              )}

                              {/* Google通報導線＋手順チェックリスト */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📌 Googleへの通報手順（外部アプリからの自動送信はできません）</div>
                                <ol style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                  <li>下記リンクからGoogleの報告画面を開く</li>
                                  <li>該当クチコミの「︙」→「クチコミを報告」を選択</li>
                                  <li>上で生成した「該当ポリシー」に合う違反理由を選ぶ</li>
                                  <li>必要に応じて通報文を貼り付け・送信する</li>
                                  <li>下の「通報記録に保存」で院内記録を残す</li>
                                </ol>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {GOOGLE_REPORT_LINKS.map((lk) => (
                                    <a key={lk.url} href={lk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none', fontWeight: 600 }}>
                                      ↗ {lk.label}
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {lk.note}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>

                              {/* 院内の通報記録 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>通報記録に保存:</span>
                                {REPORT_STATUS_OPTIONS.map((st) => (
                                  <button
                                    key={st}
                                    onClick={() => saveReport(r.id, st)}
                                    disabled={reportPanels[r.id]?.saving}
                                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                  >
                                    {st}で記録
                                  </button>
                                ))}
                                {reportPanels[r.id]?.saved && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✅ 記録しました</span>}
                              </div>

                              {/* この口コミの既存通報記録 */}
                              {reports.filter((rep) => rep.review_id === r.id).length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>📂 この口コミの通報記録</div>
                                  {reports.filter((rep) => rep.review_id === r.id).map((rep) => (
                                    <div key={rep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>{new Date(rep.created_at).toLocaleDateString('ja-JP')}</span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{rep.policy || '—'}</span>
                                      <select
                                        value={rep.status}
                                        onChange={(e) => updateReportStatus(rep.id, e.target.value)}
                                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                      >
                                        {REPORT_STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                                      </select>
                                      {rep.reported_at && <span style={{ color: '#10b981' }}>通報日 {new Date(rep.reported_at).toLocaleDateString('ja-JP')}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 返信機能エリア */}
                      <div style={{ paddingLeft: 42, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => generateReply(r)}
                            disabled={replyDrafts[r.id]?.loading}
                            style={{
                              padding: '7px 14px', borderRadius: 8,
                              border: '1px solid rgba(108,99,255,0.3)',
                              background: 'rgba(108,99,255,0.08)',
                              color: '#6c63ff', fontSize: 12, fontWeight: 700,
                              cursor: replyDrafts[r.id]?.loading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {replyDrafts[r.id]?.loading ? '🤖 生成中…' : '✍️ 返信文を生成'}
                          </button>
                          {r.replied_at && (
                            <span style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'rgba(16,185,129,0.1)', color: '#10b981',
                              border: '1px solid rgba(16,185,129,0.3)',
                            }}>
                              ✅ 返信済み（{new Date(r.replied_at).toLocaleDateString('ja-JP')}）
                            </span>
                          )}
                        </div>

                        {replyDrafts[r.id]?.error && (
                          <div style={{ fontSize: 12, color: '#ef4444' }}>
                            ⚠️ {replyDrafts[r.id]?.error}
                          </div>
                        )}

                        {replyDrafts[r.id]?.drafts && replyDrafts[r.id]!.drafts!.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                              トーン: {replyDrafts[r.id]?.tone === 'positive' ? '😊 ポジティブ' : replyDrafts[r.id]?.tone === 'negative' ? '🙏 ネガティブ' : '🤝 中立'}
                            </div>
                            {replyDrafts[r.id]!.drafts!.map((d, di) => {
                              const copyKey = `${r.id}-${di}`;
                              return (
                                <div key={di} style={{
                                  padding: 12, borderRadius: 8,
                                  background: 'rgba(108,99,255,0.05)',
                                  border: '1px solid rgba(108,99,255,0.15)',
                                }}>
                                  <div style={{
                                    fontSize: 11, fontWeight: 700, color: '#6c63ff',
                                    marginBottom: 6, display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: 8,
                                  }}>
                                    <span>💬 パターン{di + 1}: {d.style}</span>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <button
                                        onClick={() => copyReply(copyKey, d.text)}
                                        style={{
                                          padding: '4px 10px', borderRadius: 6, fontSize: 11,
                                          border: '1px solid var(--border)',
                                          background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                          cursor: 'pointer', fontWeight: 600,
                                        }}
                                      >
                                        {copiedId === copyKey ? '✓ コピー完了' : '📋 コピー'}
                                      </button>
                                      <button
                                        onClick={() => saveReplyDraft(r.id, d, replyDrafts[r.id]?.tone, `draft-${copyKey}`)}
                                        style={{
                                          padding: '4px 10px', borderRadius: 6, fontSize: 11,
                                          border: '1px solid rgba(108,99,255,0.3)',
                                          background: 'rgba(108,99,255,0.08)', color: '#6c63ff',
                                          cursor: 'pointer', fontWeight: 600,
                                        }}
                                      >
                                        {savedDraftKey === `draft-${copyKey}` ? '✓ 保存しました' : '💾 下書き保存'}
                                      </button>
                                      <button
                                        onClick={() => markReplied(r.id, d.text)}
                                        style={{
                                          padding: '4px 10px', borderRadius: 6, fontSize: 11,
                                          border: '1px solid rgba(16,185,129,0.3)',
                                          background: 'rgba(16,185,129,0.08)', color: '#10b981',
                                          cursor: 'pointer', fontWeight: 600,
                                        }}
                                      >
                                        ✅ 返信済みにする
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className="markdown-body"
                                    style={{
                                      fontSize: 12, color: 'var(--text-primary)',
                                    }}
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(d.text) }}
                                  />
                                  {/* 医療広告規制チェック結果 */}
                                  {d.ad_check && (
                                    d.ad_check.status === 'warn' && (d.ad_check.findings?.length ?? 0) > 0 ? (
                                      <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>⚠️ 医療広告チェック：要確認</div>
                                        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                          {d.ad_check.findings!.map((f, fi) => <li key={fi}>{f}</li>)}
                                        </ul>
                                      </div>
                                    ) : (
                                      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                                        ✅ 医療広告チェック：問題なし（効果保証・誇大・体験談・割引誘導などのNG表現は検出されませんでした）
                                      </div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {filterFlagged
                      ? 'フラグ付きの口コミはありません（過剰フラグ防止：実体験の低評価は対象外です）'
                      : <>登録済みの口コミはまだありません<br />「📋 口コミを手動登録」または Google Places取得分の「⬇️ 取り込んで管理」で追加できます</>}
                  </div>
                )}
              </div>
              </>
              );
            })()}
          </div>

          {/* ═══ AI分析結果 ═══ */}
          {aiLoading && (
            <div className="ai-card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>口コミをAIが分析しています...</div>
            </div>
          )}

          {aiAnalysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* サマリー */}
              <div
                className="markdown-body"
                style={{
                  padding: '16px 20px', borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
                  border: '1px solid rgba(108,99,255,0.15)',
                  fontSize: 14, color: 'var(--text-primary)', fontWeight: 500,
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnalysis.summary) }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* 良い点 */}
                <div className="ai-card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#10b981', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✅ 口コミで評価されている点
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {aiAnalysis.strengths.map((s, i) => (
                      <div key={i} className="strength-item">{s}</div>
                    ))}
                  </div>
                </div>

                {/* 改善点 */}
                <div className="ai-card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚠️ 改善が期待される点
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {aiAnalysis.improvements.map((s, i) => (
                      <div key={i} className="improve-item">{s}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 返信テンプレート */}
              {aiAnalysis.replyIdeas.length > 0 && (
                <div className="ai-card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    💬 口コミ返信テンプレート案
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {aiAnalysis.replyIdeas.map((r, i) => (
                      <div key={i} className="reply-item">{r}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ 手動登録モーダル ═══ */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 520,
              boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
              animation: 'slideUp 0.3s ease',
            }}
          >
            {/* ヘッダー */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(249,115,22,0.06))',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)', fontSize: 16,
                }}>📋</span>
                口コミを手動登録
              </h2>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}
              >✕</button>
            </div>

            {/* フォーム */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 投稿者名 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  投稿者名 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formAuthor}
                  onChange={e => setFormAuthor(e.target.value)}
                  placeholder="例: 田中 太郎"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 評価（星選択） */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  評価 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFormRating(n)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 32, padding: 2,
                        color: n <= formRating ? '#f59e0b' : 'var(--border)',
                        transition: 'transform 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      ★
                    </button>
                  ))}
                  <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 700, color: ratingColor(formRating) }}>
                    {formRating}.0
                  </span>
                </div>
              </div>

              {/* 口コミ本文 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  口コミ本文
                </label>
                <textarea
                  value={formText}
                  onChange={e => setFormText(e.target.value)}
                  placeholder="口コミの内容を入力してください..."
                  rows={5}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
                    resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
                  }}
                />
              </div>

              {/* 投稿日 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  投稿日
                </label>
                <input
                  type="date"
                  value={formDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setFormDate(e.target.value)}
                  style={{
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: 14,
                  }}
                />
              </div>
            </div>

            {/* フッター */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >キャンセル</button>
              <button
                onClick={saveManualReview}
                disabled={saving || !formAuthor.trim()}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  cursor: saving || !formAuthor.trim() ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff',
                  fontWeight: 700, fontSize: 13,
                  opacity: saving || !formAuthor.trim() ? 0.5 : 1,
                  boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                }}
              >
                {saving ? '保存中...' : '💾 保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
