'use client';
import { useState, useEffect } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

/* ---------- 型定義 ---------- */
interface Post {
  post_num: number;
  type: string;
  content: string;
  hashtags: string[];
  image_prompt: string;
  best_time: string;
  expected_engagement: string;
}

interface GenerateResult {
  posts: Post[];
  series_plan: string;
  avatar_voice_guide: string;
}

interface AvatarProfile {
  name: string;
  expertise: string;
  personality: string;
  tone: string;
  catchphrase: string;
}

/* ---------- 定数 ---------- */
const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'twitter', label: 'X', icon: '𝕏' },
  { value: 'instagram_reel', label: 'Reels', icon: '🎬' },
  { value: 'threads', label: 'Threads', icon: '🧵' },
] as const;

const PERSONALITIES = [
  { value: 'friendly', label: '明るく親しみやすい' },
  { value: 'professional', label: 'プロフェッショナル' },
  { value: 'humorous', label: 'ユーモアたっぷり' },
  { value: 'motivational', label: '熱血・モチベーター' },
  { value: 'calm', label: '落ち着き・知的' },
  { value: 'edgy', label: '尖った・挑発的' },
];

const TONES = [
  { value: 'casual', label: 'カジュアル' },
  { value: 'polite', label: '丁寧語' },
  { value: 'desu_masu', label: 'です/ます調' },
  { value: 'friendly_senpai', label: '先輩風' },
  { value: 'girlish', label: 'ギャル風' },
  { value: 'otaku', label: 'オタク風' },
];

const POST_TYPES = [
  { value: 'normal', label: '通常投稿' },
  { value: 'carousel', label: 'カルーセル' },
  { value: 'story', label: 'ストーリー' },
  { value: 'reel_script', label: 'リール台本' },
  { value: 'thread', label: 'スレッド' },
];

const COUNTS = ['1', '2', '3', '5'];

const DEFAULT_AVATAR: AvatarProfile = {
  name: 'AIみらい',
  expertise: 'AI活用術・副業・時短テクニック',
  personality: 'friendly',
  tone: 'casual',
  catchphrase: '未来はもう始まってる！🚀',
};

const STORAGE_KEY = 'xlumina_avatar_profile';

export default function AvatarStudioPage() {
  /* --- アバター設定 --- */
  const [avatar, setAvatar] = useState<AvatarProfile>(DEFAULT_AVATAR);

  /* --- 投稿設定 --- */
  const [platform, setPlatform] = useState<string>('instagram');
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState('normal');
  const [count, setCount] = useState('3');

  /* --- 結果 --- */
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [activePost, setActivePost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  /* --- localStorage 読み込み --- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAvatar(JSON.parse(saved));
    } catch { /* 無視 */ }
  }, []);

  /* --- アバター保存 --- */
  const saveAvatar = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
  };

  /* --- アバターリセット --- */
  const loadDefault = () => {
    setAvatar(DEFAULT_AVATAR);
  };

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

  /* --- 投稿生成 --- */
  const generate = async () => {
    if (!avatar.name.trim() || !topic.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setActivePost(0);

    try {
      const res = await fetch('/api/avatar/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarName: avatar.name,
          avatarPersonality: PERSONALITIES.find(p => p.value === avatar.personality)?.label || avatar.personality,
          avatarExpertise: avatar.expertise,
          avatarTone: TONES.find(t => t.value === avatar.tone)?.label || avatar.tone,
          avatarCatchphrase: avatar.catchphrase,
          platform,
          topic,
          postType: POST_TYPES.find(p => p.value === postType)?.label || postType,
          count: parseInt(count),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`投稿生成に失敗しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  /* --- コピー --- */
  const copyPost = (idx: number) => {
    if (!result) return;
    const post = result.posts[idx];
    const text = `${post.content}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  /* --- エクスポート --- */
  const exportAll = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【${avatar.name}の投稿一覧】`);
    lines.push(`プラットフォーム: ${PLATFORMS.find(p => p.value === platform)?.label || platform}`);
    lines.push(`トピック: ${topic}`);
    lines.push('');
    result.posts.forEach(post => {
      lines.push(`=== 投稿 ${post.post_num} ===`);
      lines.push(`タイプ: ${post.type}`);
      lines.push(`投稿時間: ${post.best_time}`);
      lines.push(`エンゲージメント: ${post.expected_engagement}`);
      lines.push('');
      lines.push(post.content);
      lines.push('');
      lines.push(`ハッシュタグ: ${post.hashtags.map(h => `#${h}`).join(' ')}`);
      lines.push(`画像プロンプト: ${post.image_prompt}`);
      lines.push('');
    });
    if (result.series_plan) {
      lines.push('=== シリーズ展開案 ===');
      lines.push(result.series_plan);
      lines.push('');
    }
    if (result.avatar_voice_guide) {
      lines.push('=== アバターボイスガイド ===');
      lines.push(result.avatar_voice_guide);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `avatar_posts_${avatar.name}_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={progressLoading} progress={progress} label="投稿を生成中..." />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🎭 SNSアバター発信スタジオ
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
        アバターキャラクターの設定を作り、各SNSプラットフォーム向けの投稿を自動生成
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ========== 左カラム: 設定 ========== */}
        <div>
          {/* アバター設定 */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>🎭 アバター設定</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={saveAvatar} style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
                }}>💾 保存</button>
                <button onClick={loadDefault} style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                  border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
                }}>サンプル</button>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>アバター名 *</label>
              <input value={avatar.name} onChange={e => setAvatar({ ...avatar, name: e.target.value })} placeholder="例：AIみらい" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>専門分野</label>
              <input value={avatar.expertise} onChange={e => setAvatar({ ...avatar, expertise: e.target.value })} placeholder="例：AI活用術・副業" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>性格</label>
                <select value={avatar.personality} onChange={e => setAvatar({ ...avatar, personality: e.target.value })} style={inputStyle}>
                  {PERSONALITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>口調</label>
                <select value={avatar.tone} onChange={e => setAvatar({ ...avatar, tone: e.target.value })} style={inputStyle}>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>決めゼリフ</label>
              <input value={avatar.catchphrase} onChange={e => setAvatar({ ...avatar, catchphrase: e.target.value })} placeholder="例：未来はもう始まってる！🚀" style={inputStyle} />
            </div>
          </div>

          {/* プラットフォーム選択 */}
          <div style={cardStyle}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>プラットフォーム</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
              {PLATFORMS.map(pf => (
                <button
                  key={pf.value}
                  onClick={() => setPlatform(pf.value)}
                  style={{
                    padding: '10px 4px', borderRadius: 8, cursor: 'pointer',
                    border: platform === pf.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: platform === pf.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                    color: platform === pf.value ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: platform === pf.value ? 700 : 500,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{pf.icon}</span>
                  <span>{pf.label}</span>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>トピック *</label>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="例：ChatGPTの活用法5選" style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>投稿タイプ</label>
                <select value={postType} onChange={e => setPostType(e.target.value)} style={inputStyle}>
                  {POST_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>生成数</label>
                <select value={count} onChange={e => setCount(e.target.value)} style={inputStyle}>
                  {COUNTS.map(c => <option key={c} value={c}>{c}投稿</option>)}
                </select>
              </div>
            </div>

            <button onClick={generate} disabled={loading || !avatar.name.trim() || !topic.trim()} style={{
              width: '100%', padding: '12px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: (loading || !avatar.name.trim() || !topic.trim()) ? 0.5 : 1,
            }}>
              {loading ? '生成中...' : '🎭 投稿を生成'}
            </button>
          </div>
        </div>

        {/* ========== 右カラム: 結果 ========== */}
        <div>
          {/* エラー */}
          {error && (
            <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* ローディング */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
              <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              {avatar.name}が投稿を考えています...
            </div>
          )}

          {/* 結果なし初期状態 */}
          {!result && !loading && !error && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 50, marginBottom: 12 }}>🎭</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                アバターの投稿を生成しよう
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                左のパネルでアバターを設定し、トピックを入力して「投稿を生成」を押してください
              </div>
            </div>
          )}

          {/* 結果表示 */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* アクションバー */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SaveToLibraryButton
                  title={`${avatar.name}の投稿: ${topic}`}
                  content={JSON.stringify(result, null, 2)}
                  type="avatar-post"
                  groupName="SNSアバター"
                  tags={`SNS,${PLATFORMS.find(p => p.value === platform)?.label || platform},${avatar.name}`}
                />
                <button onClick={exportAll} style={{
                  padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  📄 全投稿エクスポート
                </button>
              </div>

              {/* 投稿タブナビ */}
              <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
                {result.posts.map((post, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePost(idx)}
                    style={{
                      padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      border: 'none', borderBottom: activePost === idx ? '3px solid var(--accent)' : '3px solid transparent',
                      background: 'transparent',
                      color: activePost === idx ? 'var(--text-primary)' : 'var(--text-muted)',
                      transition: 'all 0.15s', marginBottom: -2,
                    }}
                  >
                    投稿 {post.post_num}
                  </button>
                ))}
              </div>

              {/* アクティブ投稿 */}
              {result.posts[activePost] && (() => {
                const post = result.posts[activePost];
                return (
                  <div style={cardStyle}>
                    {/* アバターヘッダー */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: '#fff', fontWeight: 700,
                      }}>
                        {avatar.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{avatar.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{post.type} / {post.best_time}</div>
                      </div>
                      <button onClick={() => copyPost(activePost)} style={{
                        marginLeft: 'auto', padding: '5px 14px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                      }}>
                        {copiedIdx === activePost ? '✓ コピー済み' : 'コピー'}
                      </button>
                    </div>

                    {/* 投稿本文 */}
                    <div style={{
                      fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.9,
                      whiteSpace: 'pre-wrap', padding: 16, background: 'var(--bg-primary)',
                      borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12,
                    }}>
                      {post.content}
                    </div>

                    {/* ハッシュタグ */}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {post.hashtags.map((tag, i) => (
                          <span key={i} style={{
                            fontSize: 12, padding: '3px 10px', borderRadius: 20,
                            background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                            color: '#6c63ff',
                          }}>#{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* メタ情報 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>推奨投稿時間</div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{post.best_time}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>期待エンゲージメント</div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{post.expected_engagement}</div>
                      </div>
                    </div>

                    {/* 画像プロンプト */}
                    {post.image_prompt && (
                      <div style={{
                        padding: 12, background: 'rgba(0,212,184,0.05)',
                        border: '1px solid rgba(0,212,184,0.2)', borderRadius: 8,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4b8', marginBottom: 4 }}>
                          🎨 画像プロンプト（Midjourney / DALL-E）
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'monospace' }}>
                          {post.image_prompt}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* シリーズ展開案 */}
              {result.series_plan && (
                <div style={{ ...cardStyle, borderLeft: '4px solid #f5a623' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>
                    📅 シリーズ展開案
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {result.series_plan}
                  </div>
                </div>
              )}

              {/* アバターボイスガイド */}
              {result.avatar_voice_guide && (
                <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>
                    🎭 アバターボイスガイド
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {result.avatar_voice_guide}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '380px 1fr'"],
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
