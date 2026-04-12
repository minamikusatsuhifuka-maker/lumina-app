'use client';

import { useState } from 'react';

// ─── 型定義 ───

interface Review {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
  timestamp: number;
  profilePhoto: string;
}

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 2, background: 'linear-gradient(90deg, #f59e0b, #f97316)', borderRadius: 1 }} />
                最新の口コミ（{data.reviews.length}件）
              </div>
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
                {aiLoading ? '🤖 分析中...' : '🤖 AIで口コミ分析'}
              </button>
            </div>

            <div className="review-card" style={{ overflow: 'hidden' }}>
              {data.reviews.length > 0 ? (
                data.reviews.map((review, i) => (
                  <div key={i} className="review-item" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      {review.profilePhoto ? (
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
                      <div style={{
                        fontSize: 20, fontWeight: 800, color: ratingColor(review.rating),
                      }}>
                        {review.rating}.0
                      </div>
                    </div>
                    {review.text && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 42 }}>
                        {review.text}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  口コミがありません
                </div>
              )}
            </div>
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
              <div style={{
                padding: '16px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
                border: '1px solid rgba(108,99,255,0.15)',
                fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 500,
              }}>
                {aiAnalysis.summary}
              </div>

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
    </div>
  );
}
