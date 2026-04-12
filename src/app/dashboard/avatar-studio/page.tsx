'use client';
import { useState, useEffect } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

/* ========== 型定義 ========== */
interface AvatarProfile {
  name: string;
  expertise: string;
  personality: string;
  tone: string;
  catchphrase: string;
}

interface AvatarDesign {
  age: string;
  gender: string;
  occupation: string;
  personality: string;
  appearance: string;
  fashion: string;
  background: string;
  expertise: string;
}

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

/* ========== 定数 ========== */
const STUDIO_TABS = [
  { key: 'design', label: '🎭 アバター設計' },
  { key: 'content', label: '📝 コンテンツ戦略' },
  { key: 'post', label: '📮 投稿生成' },
  { key: 'engage', label: '💬 エンゲージ' },
  { key: 'grow', label: '📈 成長戦略' },
  { key: 'monetize', label: '💰 収益化' },
];

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

const EMOTIONS = [
  { value: 'empathy', label: '共感・感動' },
  { value: 'surprise', label: '驚き・意外性' },
  { value: 'motivation', label: 'やる気・勇気' },
  { value: 'humor', label: '笑い・ユーモア' },
  { value: 'nostalgia', label: '懐かしさ・郷愁' },
];

const PRODUCT_TYPES = [
  { value: '電子書籍', label: '電子書籍' },
  { value: 'オンライン講座', label: 'オンライン講座' },
  { value: 'テンプレート', label: 'テンプレート' },
  { value: 'コンサル', label: 'コンサル' },
];

const DEFAULT_AVATAR: AvatarProfile = {
  name: 'AIみらい',
  expertise: 'AI活用術・副業・時短テクニック',
  personality: 'friendly',
  tone: 'casual',
  catchphrase: '未来はもう始まってる！🚀',
};

const DEFAULT_DESIGN: AvatarDesign = {
  age: '25',
  gender: '女性',
  occupation: 'AIコンサルタント',
  personality: '明るく好奇心旺盛',
  appearance: '黒髪ロング、キリッとした目元',
  fashion: 'スマートカジュアル、テック感のあるアクセサリー',
  background: '東京を拠点にAI活用を広める',
  expertise: 'AI活用術・副業',
};

const STORAGE_KEY = 'xlumina_avatar_profile';

/* ========== スタイル定数 ========== */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20, marginBottom: 16,
};

const btnPrimary: React.CSSProperties = {
  width: '100%', padding: '12px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
  color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12,
  paddingBottom: 8, borderBottom: '2px solid var(--border)',
};

/* ========== コンポーネント ========== */
export default function AvatarStudioPage() {
  /* --- 共有アバター設定 --- */
  const [avatar, setAvatar] = useState<AvatarProfile>(DEFAULT_AVATAR);
  const [activeTab, setActiveTab] = useState('design');

  /* --- Design タブ --- */
  const [design, setDesign] = useState<AvatarDesign>(DEFAULT_DESIGN);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [designResult, setDesignResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [backstoryResult, setBackstoryResult] = useState<any>(null);

  /* --- Content タブ --- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [calendarResult, setCalendarResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [buzzResult, setBuzzResult] = useState<any>(null);
  const [calendarPlatforms, setCalendarPlatforms] = useState('Instagram, X');
  const [calendarFrequency, setCalendarFrequency] = useState('毎日1投稿');
  const [buzzPlatform, setBuzzPlatform] = useState('instagram');
  const [targetAudience, setTargetAudience] = useState('');

  /* --- Post タブ --- */
  const [platform, setPlatform] = useState<string>('instagram');
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState('normal');
  const [count, setCount] = useState('3');
  const [postResult, setPostResult] = useState<GenerateResult | null>(null);
  const [activePost, setActivePost] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [multiOriginal, setMultiOriginal] = useState('');
  const [multiOriginalPlatform, setMultiOriginalPlatform] = useState('instagram');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [multiResult, setMultiResult] = useState<any>(null);

  /* --- Engage タブ --- */
  const [replyComment, setReplyComment] = useState('');
  const [replyGoal, setReplyGoal] = useState('エンゲージメント向上');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [replyResult, setReplyResult] = useState<any>(null);

  /* --- Grow タブ --- */
  const [currentFollowers, setCurrentFollowers] = useState('100');
  const [targetFollowers, setTargetFollowers] = useState('10000');
  const [monthsToGoal, setMonthsToGoal] = useState('6');
  const [growPlatforms, setGrowPlatforms] = useState('Instagram, X');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [growthResult, setGrowthResult] = useState<any>(null);
  const [viralEmotion, setViralEmotion] = useState('empathy');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viralResult, setViralResult] = useState<any>(null);

  /* --- Monetize タブ --- */
  const [targetIncome, setTargetIncome] = useState('300000');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [monetizeResult, setMonetizeResult] = useState<any>(null);
  const [productType, setProductType] = useState('電子書籍');
  const [productPrice, setProductPrice] = useState('3980');
  const [productAudience, setProductAudience] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [productResult, setProductResult] = useState<any>(null);

  /* --- 共通 --- */
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('AI処理中...');
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  /* --- localStorage 読み込み --- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAvatar(JSON.parse(saved));
    } catch { /* 無視 */ }
  }, []);

  const saveAvatar = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
  };

  const loadDefault = () => {
    setAvatar(DEFAULT_AVATAR);
  };

  /* --- 汎用API呼び出し --- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callApi = async (url: string, body: Record<string, unknown>, label: string): Promise<any> => {
    setLoading(true);
    setLoadingLabel(label);
    startProgress();
    setError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      resetProgress();
      return null;
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  /* --- コピー --- */
  const copyText = (text: string, idx?: number) => {
    navigator.clipboard.writeText(text);
    if (idx !== undefined) {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  /* --- Design タブのハンドラー --- */
  const handleDesign = async () => {
    const data = await callApi('/api/avatar/design', {
      age: design.age, gender: design.gender, occupation: design.occupation,
      personality: design.personality, appearance: design.appearance,
      fashion: design.fashion, background: design.background, expertise: design.expertise,
    }, 'アバターを設計中...');
    if (data) setDesignResult(data);
  };

  const handleBackstory = async () => {
    const data = await callApi('/api/avatar/backstory', {
      avatarName: avatar.name, occupation: design.occupation,
      expertise: avatar.expertise, personality: avatar.personality,
      targetAudience: targetAudience || '一般',
    }, 'バックストーリーを生成中...');
    if (data) setBackstoryResult(data);
  };

  /* --- Content タブのハンドラー --- */
  const handleCalendar = async () => {
    const data = await callApi('/api/avatar/calendar', {
      avatarName: avatar.name, expertise: avatar.expertise,
      targetAudience: targetAudience || '一般',
      platforms: calendarPlatforms, postFrequency: calendarFrequency,
    }, '30日カレンダーを生成中...');
    if (data) setCalendarResult(data);
  };

  const handleBuzz = async () => {
    const data = await callApi('/api/avatar/buzz-ideas', {
      avatarName: avatar.name, expertise: avatar.expertise,
      targetAudience: targetAudience || '一般', platform: buzzPlatform,
    }, 'バズアイデアを生成中...');
    if (data) setBuzzResult(data);
  };

  /* --- Post タブのハンドラー --- */
  const handleGeneratePost = async () => {
    if (!avatar.name.trim() || !topic.trim()) return;
    const data = await callApi('/api/avatar/generate-post', {
      avatarName: avatar.name,
      avatarPersonality: PERSONALITIES.find(p => p.value === avatar.personality)?.label || avatar.personality,
      avatarExpertise: avatar.expertise,
      avatarTone: TONES.find(t => t.value === avatar.tone)?.label || avatar.tone,
      avatarCatchphrase: avatar.catchphrase,
      platform, topic,
      postType: POST_TYPES.find(p => p.value === postType)?.label || postType,
      count: parseInt(count),
    }, `${avatar.name}が投稿を考えています...`);
    if (data) { setPostResult(data); setActivePost(0); }
  };

  const handleMultiPlatform = async () => {
    if (!multiOriginal.trim()) return;
    const data = await callApi('/api/avatar/multi-platform', {
      originalPost: multiOriginal,
      originalPlatform: PLATFORMS.find(p => p.value === multiOriginalPlatform)?.label || multiOriginalPlatform,
      targetPlatforms: ['Instagram', 'X', 'Threads', 'Reels'],
    }, 'マルチプラットフォーム変換中...');
    if (data) setMultiResult(data);
  };

  /* --- Engage タブのハンドラー --- */
  const handleReply = async () => {
    if (!replyComment.trim()) return;
    const data = await callApi('/api/avatar/reply-ai', {
      comment: replyComment, avatarName: avatar.name,
      avatarTone: TONES.find(t => t.value === avatar.tone)?.label || avatar.tone,
      avatarExpertise: avatar.expertise, replyGoal,
    }, '返信を生成中...');
    if (data) setReplyResult(data);
  };

  /* --- Grow タブのハンドラー --- */
  const handleGrowth = async () => {
    const data = await callApi('/api/avatar/growth-strategy', {
      avatarName: avatar.name, expertise: avatar.expertise,
      currentFollowers: parseInt(currentFollowers) || 0,
      targetFollowers: parseInt(targetFollowers) || 10000,
      platforms: growPlatforms, monthsToGoal: parseInt(monthsToGoal) || 6,
    }, '成長戦略を策定中...');
    if (data) setGrowthResult(data);
  };

  const handleViral = async () => {
    const data = await callApi('/api/avatar/viral-story', {
      avatarName: avatar.name, expertise: avatar.expertise,
      personality: PERSONALITIES.find(p => p.value === avatar.personality)?.label || avatar.personality,
      targetEmotion: EMOTIONS.find(e => e.value === viralEmotion)?.label || viralEmotion,
    }, 'バイラルストーリーを生成中...');
    if (data) setViralResult(data);
  };

  /* --- Monetize タブのハンドラー --- */
  const handleMonetize = async () => {
    const data = await callApi('/api/avatar/monetize-roadmap', {
      avatarName: avatar.name, expertise: avatar.expertise,
      currentFollowers: parseInt(currentFollowers) || 0,
      targetIncome: parseInt(targetIncome) || 300000,
    }, '収益化ロードマップを生成中...');
    if (data) setMonetizeResult(data);
  };

  const handleProduct = async () => {
    const data = await callApi('/api/avatar/product-design', {
      avatarName: avatar.name, expertise: avatar.expertise,
      productType, targetPrice: productPrice + '円',
      targetAudience: productAudience || '一般',
    }, '商品を設計中...');
    if (data) setProductResult(data);
  };

  /* --- エクスポート --- */
  const exportPosts = () => {
    if (!postResult) return;
    const lines: string[] = [];
    lines.push(`【${avatar.name}の投稿一覧】`);
    lines.push(`プラットフォーム: ${PLATFORMS.find(p => p.value === platform)?.label || platform}`);
    lines.push(`トピック: ${topic}`);
    lines.push('');
    postResult.posts.forEach(post => {
      lines.push(`=== 投稿 ${post.post_num} ===`);
      lines.push(`タイプ: ${post.type}`);
      lines.push(`投稿時間: ${post.best_time}`);
      lines.push('');
      lines.push(post.content);
      lines.push('');
      lines.push(`ハッシュタグ: ${post.hashtags.map(h => `#${h}`).join(' ')}`);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `avatar_posts_${avatar.name}_${Date.now()}.txt`;
    a.click();
  };

  /* ========== レンダリング ========== */
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={progressLoading} progress={progress} label={loadingLabel} />

      {/* ヘッダー */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🎭 SNSアバター発信スタジオ
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
        アバター設計からコンテンツ戦略、収益化まで一貫サポート
      </p>

      {/* アバター基本設定バー */}
      <div style={{ ...cardStyle, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}>
            {avatar.name.charAt(0)}
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={avatar.name} onChange={e => setAvatar({ ...avatar, name: e.target.value })}
              placeholder="アバター名" style={{ ...inputStyle, width: 140, padding: '6px 10px', fontSize: 13 }} />
            <input value={avatar.expertise} onChange={e => setAvatar({ ...avatar, expertise: e.target.value })}
              placeholder="専門分野" style={{ ...inputStyle, width: 200, padding: '6px 10px', fontSize: 13 }} />
            <select value={avatar.personality} onChange={e => setAvatar({ ...avatar, personality: e.target.value })}
              style={{ ...inputStyle, width: 140, padding: '6px 10px', fontSize: 13 }}>
              {PERSONALITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={avatar.tone} onChange={e => setAvatar({ ...avatar, tone: e.target.value })}
              style={{ ...inputStyle, width: 120, padding: '6px 10px', fontSize: 13 }}>
              {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={avatar.catchphrase} onChange={e => setAvatar({ ...avatar, catchphrase: e.target.value })}
              placeholder="決めゼリフ" style={{ ...inputStyle, width: 180, padding: '6px 10px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={saveAvatar} style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
            }}>💾 保存</button>
            <button onClick={loadDefault} style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
            }}>リセット</button>
          </div>
        </div>
      </div>

      {/* タブナビ */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {STUDIO_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: 'none', borderBottom: activeTab === tab.key ? '3px solid #6c63ff' : '3px solid transparent',
              background: 'transparent', whiteSpace: 'nowrap',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s', marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* エラー表示 */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20, marginBottom: 16 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          {loadingLabel}
        </div>
      )}

      {/* ========== Design タブ ========== */}
      {activeTab === 'design' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
          {/* 左: 設定フォーム */}
          <div>
            <div style={cardStyle}>
              <div style={sectionTitle}>🎨 アバターデザイン設定</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>年齢</label>
                  <input value={design.age} onChange={e => setDesign({ ...design, age: e.target.value })} placeholder="25" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>性別</label>
                  <input value={design.gender} onChange={e => setDesign({ ...design, gender: e.target.value })} placeholder="女性" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>職業</label>
                <input value={design.occupation} onChange={e => setDesign({ ...design, occupation: e.target.value })} placeholder="AIコンサルタント" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>性格</label>
                <input value={design.personality} onChange={e => setDesign({ ...design, personality: e.target.value })} placeholder="明るく好奇心旺盛" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>外見</label>
                <input value={design.appearance} onChange={e => setDesign({ ...design, appearance: e.target.value })} placeholder="黒髪ロング、キリッとした目元" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>ファッション</label>
                <input value={design.fashion} onChange={e => setDesign({ ...design, fashion: e.target.value })} placeholder="スマートカジュアル" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>背景・世界観</label>
                <input value={design.background} onChange={e => setDesign({ ...design, background: e.target.value })} placeholder="東京を拠点にAI活用を広める" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>専門分野</label>
                <input value={design.expertise} onChange={e => setDesign({ ...design, expertise: e.target.value })} placeholder="AI活用術・副業" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDesign} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                  🎭 アバターを設計
                </button>
              </div>
              {designResult && (
                <button onClick={handleBackstory} disabled={loading} style={{
                  ...btnSecondary, width: '100%', marginTop: 10,
                  opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                  📖 バックストーリーを生成
                </button>
              )}
            </div>
          </div>

          {/* 右: 結果表示 */}
          <div>
            {!designResult && !backstoryResult && !loading && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 50, marginBottom: 12 }}>🎭</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>アバターを設計しよう</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>左のフォームに情報を入力して「アバターを設計」を押してください</div>
              </div>
            )}

            {designResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <SaveToLibraryButton title={`アバター設計: ${avatar.name}`} content={JSON.stringify(designResult, null, 2)} type="avatar-design" groupName="SNSアバター" tags={`アバター設計,${avatar.name}`} />

                {/* 名前候補 */}
                {designResult.avatar_name && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>💡 名前候補</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {designResult.avatar_name.map((n: string, i: number) => (
                        <button key={i} onClick={() => setAvatar({ ...avatar, name: n })} style={{
                          padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                          border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.06)',
                          color: '#6c63ff', fontWeight: 600, fontSize: 14,
                        }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* マスタープロンプト */}
                {designResult.master_prompt && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8', marginBottom: 12 }}>🎨 画像生成プロンプト</div>
                    {(['midjourney', 'stable_diffusion', 'dalle'] as const).map(tool => (
                      designResult.master_prompt[tool] && (
                        <div key={tool} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              {tool === 'midjourney' ? 'Midjourney' : tool === 'stable_diffusion' ? 'Stable Diffusion' : 'DALL-E'}
                            </span>
                            <button onClick={() => copyText(designResult.master_prompt[tool])} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
                            }}>コピー</button>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'monospace', padding: 10, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {designResult.master_prompt[tool]}
                          </div>
                        </div>
                      )
                    ))}
                    {designResult.master_prompt.seed_note && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, background: 'rgba(245,166,35,0.08)', borderRadius: 6, borderLeft: '3px solid #f5a623' }}>
                        🔑 {designResult.master_prompt.seed_note}
                      </div>
                    )}
                  </div>
                )}

                {/* シーンプロンプト */}
                {designResult.scene_prompts && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 10 }}>🎬 シーンプロンプト（5種）</div>
                    {designResult.scene_prompts.map((s: { scene: string; prompt_suffix: string; use_case: string }, i: number) => (
                      <div key={i} style={{ padding: 10, marginBottom: 8, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.scene}</span>
                          <button onClick={() => copyText(s.prompt_suffix)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>{s.prompt_suffix}</div>
                        <div style={{ fontSize: 11, color: '#00d4b8', marginTop: 4 }}>用途: {s.use_case}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 一貫性のコツ */}
                {designResult.consistency_tips && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🔄 一貫性を保つコツ</div>
                    {designResult.consistency_tips.map((tip: string, i: number) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 0', borderBottom: i < designResult.consistency_tips.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        ✅ {tip}
                      </div>
                    ))}
                  </div>
                )}

                {/* キャラクターシート */}
                {designResult.character_sheet && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>📋 キャラクターシート</div>
                    {Object.entries(designResult.character_sheet).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 80 }}>
                          {key === 'full_name' ? '名前' : key === 'age' ? '年齢' : key === 'occupation' ? '職業' : key === 'location' ? '拠点' : key === 'hobbies' ? '趣味' : key === 'values' ? '価値観' : key === 'dream' ? '夢' : key}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {Array.isArray(val) ? (val as string[]).join('、') : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* バックストーリー結果 */}
            {backstoryResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: designResult ? 16 : 0 }}>
                <div style={{ ...cardStyle, borderLeft: '4px solid #e040fb' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e040fb', marginBottom: 14 }}>📖 バックストーリー</div>
                  {(['origin_story', 'struggle_story', 'turning_point', 'current_mission'] as const).map(key => (
                    backstoryResult[key] && (
                      <div key={key} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                          {key === 'origin_story' ? '🌱 誕生ストーリー' : key === 'struggle_story' ? '💪 挫折と苦労' : key === 'turning_point' ? '✨ 転機' : '🎯 現在のミッション'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{backstoryResult[key]}</div>
                      </div>
                    )
                  ))}
                </div>

                {/* プロフィールテキスト */}
                {backstoryResult.profile_text && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>📝 プロフィールテキスト</div>
                    {(['long', 'short', 'twitter_bio'] as const).map(key => (
                      backstoryResult.profile_text[key] && (
                        <div key={key} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                              {key === 'long' ? '長文版' : key === 'short' ? '短文版' : 'X Bio'}
                            </span>
                            <button onClick={() => copyText(backstoryResult.profile_text[key])} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, padding: 10, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {backstoryResult.profile_text[key]}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* 自己紹介投稿 */}
                {backstoryResult.self_intro_posts && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8', marginBottom: 10 }}>📮 自己紹介投稿</div>
                    {backstoryResult.self_intro_posts.map((p: { platform: string; content: string }, i: number) => (
                      <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff' }}>{p.platform}</span>
                          <button onClick={() => copyText(p.content)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{p.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 信頼性・人間味 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {backstoryResult.credibility_points && (
                    <div style={cardStyle}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>🏆 信頼性ポイント</div>
                      {backstoryResult.credibility_points.map((p: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>• {p}</div>
                      ))}
                    </div>
                  )}
                  {backstoryResult.human_moments && (
                    <div style={cardStyle}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e040fb', marginBottom: 8 }}>💕 人間味エピソード</div>
                      {backstoryResult.human_moments.map((m: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>• {m}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== Content タブ ========== */}
      {activeTab === 'content' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* カレンダー生成 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>📅 30日コンテンツカレンダー</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>プラットフォーム</label>
                <input value={calendarPlatforms} onChange={e => setCalendarPlatforms(e.target.value)} placeholder="Instagram, X" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>投稿頻度</label>
                <input value={calendarFrequency} onChange={e => setCalendarFrequency(e.target.value)} placeholder="毎日1投稿" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ターゲット読者</label>
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="一般" style={inputStyle} />
              </div>
            </div>
            <button onClick={handleCalendar} disabled={loading} style={{ ...btnPrimary, maxWidth: 300, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              📅 30日カレンダーを生成
            </button>
          </div>

          {/* カレンダー結果 */}
          {calendarResult && (
            <div>
              <SaveToLibraryButton title={`${avatar.name}の30日カレンダー`} content={JSON.stringify(calendarResult, null, 2)} type="avatar-calendar" groupName="SNSアバター" tags={`カレンダー,${avatar.name}`} />

              {/* コンテンツ比率 */}
              {calendarResult.content_ratio && (
                <div style={{ ...cardStyle, marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>📊 コンテンツ比率</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {Object.entries(calendarResult.content_ratio).map(([key, val]) => (
                      <div key={key} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{key === 'educational' ? '教育' : key === 'entertaining' ? 'エンタメ' : key === 'promotional' ? '宣伝' : '個人'}</span>
                        <span style={{ color: '#6c63ff', fontWeight: 700, marginLeft: 6 }}>{String(val)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 月間テーマ */}
              {calendarResult.monthly_themes && (
                <div style={{ ...cardStyle, marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>🎯 月間テーマ</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {calendarResult.monthly_themes.map((theme: string, i: number) => (
                      <div key={i} style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>第{i + 1}週</div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{theme}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* カレンダー一覧 */}
              {calendarResult.calendar && (
                <div style={{ ...cardStyle, marginTop: 12, maxHeight: 600, overflowY: 'auto' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📋 30日カレンダー</div>
                  {[1, 2, 3, 4, 5].map(week => {
                    const weekItems = calendarResult.calendar.filter((c: { day: number }) => c.day > (week - 1) * 7 && c.day <= Math.min(week * 7, 30));
                    if (weekItems.length === 0) return null;
                    return (
                      <div key={week} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8, padding: '4px 10px', background: 'rgba(108,99,255,0.06)', borderRadius: 4, display: 'inline-block' }}>
                          第{week}週
                        </div>
                        {weekItems.map((item: { day: number; weekday: string; platform: string; post_type: string; topic: string; hook: string; best_time: string; hashtags: string[] }) => (
                          <div key={item.day} style={{ display: 'grid', gridTemplateColumns: '60px 80px 1fr', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Day {item.day}<br /><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{item.weekday}</span></div>
                            <div style={{ fontSize: 11, color: '#00d4b8', fontWeight: 600 }}>{item.platform}<br /><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.best_time}</span></div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.topic}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.hook}</div>
                              {item.hashtags && (
                                <div style={{ fontSize: 10, color: '#6c63ff', marginTop: 2 }}>{item.hashtags.map(h => `#${h}`).join(' ')}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* バズアイデア */}
          <div style={cardStyle}>
            <div style={sectionTitle}>🔥 バズ投稿アイデア（10選）</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>プラットフォーム</label>
                <select value={buzzPlatform} onChange={e => setBuzzPlatform(e.target.value)} style={inputStyle}>
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                </select>
              </div>
              <button onClick={handleBuzz} disabled={loading} style={{ ...btnPrimary, maxWidth: 240, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                🔥 バズアイデア生成
              </button>
            </div>
          </div>

          {/* バズ結果 */}
          {buzzResult?.ideas && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b6b', marginBottom: 12 }}>🔥 バズ投稿アイデア</div>
              {buzzResult.ideas.map((idea: { rank: number; title: string; hook: string; format: string; viral_score: number; reason: string; timing: string }) => (
                <div key={idea.rank} style={{ padding: 12, marginBottom: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#6c63ff' }}>#{idea.rank}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{idea.title}</span>
                    </div>
                    <div style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: idea.viral_score >= 80 ? 'rgba(255,107,107,0.12)' : idea.viral_score >= 60 ? 'rgba(245,166,35,0.12)' : 'rgba(108,99,255,0.08)',
                      color: idea.viral_score >= 80 ? '#ff6b6b' : idea.viral_score >= 60 ? '#f5a623' : '#6c63ff',
                    }}>
                      🔥 {idea.viral_score}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#00d4b8', fontWeight: 600, marginBottom: 4 }}>{idea.hook}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {idea.format} / {idea.timing} — {idea.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== Post タブ ========== */}
      {activeTab === 'post' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
          {/* 左: 投稿設定 */}
          <div>
            {/* 投稿生成 */}
            <div style={cardStyle}>
              <div style={sectionTitle}>📮 投稿を生成</div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>プラットフォーム</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
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
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>トピック *</label>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="例：ChatGPTの活用法5選" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>投稿タイプ</label>
                  <select value={postType} onChange={e => setPostType(e.target.value)} style={inputStyle}>
                    {POST_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>生成数</label>
                  <select value={count} onChange={e => setCount(e.target.value)} style={inputStyle}>
                    {COUNTS.map(c => <option key={c} value={c}>{c}投稿</option>)}
                  </select>
                </div>
              </div>
              <button onClick={handleGeneratePost} disabled={loading || !avatar.name.trim() || !topic.trim()} style={{
                ...btnPrimary, opacity: (loading || !avatar.name.trim() || !topic.trim()) ? 0.5 : 1,
                cursor: (loading || !avatar.name.trim() || !topic.trim()) ? 'not-allowed' : 'pointer',
              }}>
                🎭 投稿を生成
              </button>
            </div>

            {/* マルチプラットフォーム変換 */}
            <div style={cardStyle}>
              <div style={sectionTitle}>🔄 マルチプラットフォーム変換</div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>元のプラットフォーム</label>
                <select value={multiOriginalPlatform} onChange={e => setMultiOriginalPlatform(e.target.value)} style={inputStyle}>
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>投稿テキスト *</label>
                <textarea value={multiOriginal} onChange={e => setMultiOriginal(e.target.value)} placeholder="変換したい投稿を貼り付け..." style={textareaStyle} />
              </div>
              <button onClick={handleMultiPlatform} disabled={loading || !multiOriginal.trim()} style={{
                ...btnSecondary, width: '100%', opacity: (loading || !multiOriginal.trim()) ? 0.5 : 1,
                cursor: (loading || !multiOriginal.trim()) ? 'not-allowed' : 'pointer',
              }}>
                🔄 全プラットフォームに変換
              </button>
            </div>
          </div>

          {/* 右: 結果 */}
          <div>
            {!postResult && !multiResult && !loading && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 50, marginBottom: 12 }}>📮</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>投稿を生成しよう</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>トピックを入力して「投稿を生成」を押してください</div>
              </div>
            )}

            {/* 投稿結果 */}
            {postResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <SaveToLibraryButton title={`${avatar.name}の投稿: ${topic}`} content={JSON.stringify(postResult, null, 2)} type="avatar-post" groupName="SNSアバター" tags={`SNS,${PLATFORMS.find(p => p.value === platform)?.label || platform},${avatar.name}`} />
                  <button onClick={exportPosts} style={btnSecondary}>📄 全投稿エクスポート</button>
                </div>

                <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
                  {postResult.posts.map((post, idx) => (
                    <button key={idx} onClick={() => setActivePost(idx)} style={{
                      padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      border: 'none', borderBottom: activePost === idx ? '3px solid var(--accent)' : '3px solid transparent',
                      background: 'transparent',
                      color: activePost === idx ? 'var(--text-primary)' : 'var(--text-muted)',
                      transition: 'all 0.15s', marginBottom: -2,
                    }}>
                      投稿 {post.post_num}
                    </button>
                  ))}
                </div>

                {postResult.posts[activePost] && (() => {
                  const post = postResult.posts[activePost];
                  return (
                    <div style={cardStyle}>
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
                        <button onClick={() => { copyText(`${post.content}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`, activePost); }} style={{
                          marginLeft: 'auto', padding: '5px 14px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }}>
                          {copiedIdx === activePost ? '✓ コピー済み' : 'コピー'}
                        </button>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.9, whiteSpace: 'pre-wrap', padding: 16, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                        {post.content}
                      </div>
                      {post.hashtags?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {post.hashtags.map((tag, i) => (
                            <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', color: '#6c63ff' }}>#{tag}</span>
                          ))}
                        </div>
                      )}
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
                      {post.image_prompt && (
                        <div style={{ padding: 12, background: 'rgba(0,212,184,0.05)', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4b8', marginBottom: 4 }}>🎨 画像プロンプト</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'monospace' }}>{post.image_prompt}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {postResult.series_plan && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #f5a623' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>📅 シリーズ展開案</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{postResult.series_plan}</div>
                  </div>
                )}

                {postResult.avatar_voice_guide && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>🎭 アバターボイスガイド</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{postResult.avatar_voice_guide}</div>
                  </div>
                )}
              </div>
            )}

            {/* マルチプラットフォーム結果 */}
            {multiResult?.conversions && (
              <div style={{ marginTop: postResult ? 20 : 0 }}>
                <div style={{ ...cardStyle, borderLeft: '4px solid #00d4b8' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#00d4b8', marginBottom: 14 }}>🔄 マルチプラットフォーム変換結果</div>
                  {multiResult.conversions.map((c: { platform: string; content: string; hashtags: string[]; image_prompt: string; character_count: number; tips: string }, i: number) => (
                    <div key={i} style={{ padding: 14, marginBottom: 12, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff' }}>{c.platform}</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.character_count}文字</span>
                          <button onClick={() => copyText(c.content)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{c.content}</div>
                      {c.hashtags?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {c.hashtags.map((h, j) => (
                            <span key={j} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(108,99,255,0.06)', color: '#6c63ff' }}>#{h}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 6, background: 'rgba(245,166,35,0.06)', borderRadius: 4 }}>💡 {c.tips}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== Engage タブ ========== */}
      {activeTab === 'engage' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={cardStyle}>
              <div style={sectionTitle}>💬 リプライAI</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                コメントを貼り付けて、アバターの声で返信を生成
              </p>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>コメント *</label>
                <textarea value={replyComment} onChange={e => setReplyComment(e.target.value)} placeholder="返信したいコメントを貼り付け..." style={textareaStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>返信の目的</label>
                <select value={replyGoal} onChange={e => setReplyGoal(e.target.value)} style={inputStyle}>
                  <option value="エンゲージメント向上">エンゲージメント向上</option>
                  <option value="信頼構築">信頼構築</option>
                  <option value="ファン化">ファン化</option>
                  <option value="セールス誘導">セールス誘導</option>
                  <option value="共感・寄り添い">共感・寄り添い</option>
                </select>
              </div>
              <button onClick={handleReply} disabled={loading || !replyComment.trim()} style={{
                ...btnPrimary, opacity: (loading || !replyComment.trim()) ? 0.5 : 1,
                cursor: (loading || !replyComment.trim()) ? 'not-allowed' : 'pointer',
              }}>
                💬 返信を生成
              </button>
            </div>
          </div>

          <div>
            {!replyResult && !loading && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 50, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>アバターの声で返信</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>コメントを貼り付けて返信を生成しましょう</div>
              </div>
            )}

            {replyResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>💬 {avatar.name}の返信</span>
                    <button onClick={() => copyText(replyResult.reply)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, padding: 14, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                    {replyResult.reply}
                  </div>
                </div>

                {replyResult.tone_check && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #00d4b8' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4b8', marginBottom: 6 }}>🎯 トーンチェック</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{replyResult.tone_check}</div>
                  </div>
                )}

                {replyResult.engagement_tip && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #f5a623' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 6 }}>💡 エンゲージメントTip</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{replyResult.engagement_tip}</div>
                  </div>
                )}

                {replyResult.follow_up_question && (
                  <div style={{ ...cardStyle, borderLeft: '4px solid #e040fb' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e040fb', marginBottom: 6 }}>❓ フォローアップ質問</div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 600 }}>{replyResult.follow_up_question}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== Grow タブ ========== */}
      {activeTab === 'grow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 成長戦略入力 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>📈 フォロワー成長戦略</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>現在のフォロワー</label>
                <input value={currentFollowers} onChange={e => setCurrentFollowers(e.target.value)} placeholder="100" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>目標フォロワー</label>
                <input value={targetFollowers} onChange={e => setTargetFollowers(e.target.value)} placeholder="10000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>達成期間（月）</label>
                <input value={monthsToGoal} onChange={e => setMonthsToGoal(e.target.value)} placeholder="6" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>プラットフォーム</label>
                <input value={growPlatforms} onChange={e => setGrowPlatforms(e.target.value)} placeholder="Instagram, X" style={inputStyle} />
              </div>
            </div>
            <button onClick={handleGrowth} disabled={loading} style={{ ...btnPrimary, maxWidth: 300, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              📈 成長戦略を策定
            </button>
          </div>

          {/* 成長戦略結果 */}
          {growthResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SaveToLibraryButton title={`${avatar.name}の成長戦略`} content={JSON.stringify(growthResult, null, 2)} type="avatar-growth" groupName="SNSアバター" tags={`成長戦略,${avatar.name}`} />

              {growthResult.current_analysis && (
                <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>📊 現状分析</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{growthResult.current_analysis}</div>
                </div>
              )}

              {/* 成長予測 */}
              {growthResult.growth_projections && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8', marginBottom: 10 }}>📈 成長予測</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>月</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>フォロワー</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>戦略</th>
                        </tr>
                      </thead>
                      <tbody>
                        {growthResult.growth_projections.map((p: { month: number; followers: number; strategy: string }) => (
                          <tr key={p.month} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.month}ヶ月目</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6c63ff', fontWeight: 700 }}>{p.followers.toLocaleString()}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.strategy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 週次アクション・コラボ・コンテンツの柱 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {growthResult.weekly_actions && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>📋 週次アクション</div>
                    {growthResult.weekly_actions.map((a: string, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>☑ {a}</div>
                    ))}
                  </div>
                )}
                {growthResult.collaboration_ideas && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e040fb', marginBottom: 8 }}>🤝 コラボアイデア</div>
                    {growthResult.collaboration_ideas.map((c: string, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>• {c}</div>
                    ))}
                  </div>
                )}
              </div>

              {growthResult.hashtag_strategy && (
                <div style={{ ...cardStyle, borderLeft: '4px solid #00d4b8' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4b8', marginBottom: 6 }}>#️⃣ ハッシュタグ戦略</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{growthResult.hashtag_strategy}</div>
                </div>
              )}

              {growthResult.content_pillars && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>🏛️ コンテンツの柱</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {growthResult.content_pillars.map((p: string, i: number) => (
                      <span key={i} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', color: '#6c63ff', fontSize: 12, fontWeight: 600 }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* バイラルストーリー */}
          <div style={cardStyle}>
            <div style={sectionTitle}>🎭 バイラルストーリー生成</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>狙う感情</label>
                <select value={viralEmotion} onChange={e => setViralEmotion(e.target.value)} style={inputStyle}>
                  {EMOTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <button onClick={handleViral} disabled={loading} style={{ ...btnPrimary, maxWidth: 260, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                🎭 ストーリーを生成
              </button>
            </div>
          </div>

          {/* バイラルストーリー結果 */}
          {viralResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {viralResult.stories?.map((s: { title: string; hook: string; body: string; emotional_arc: string; call_to_action: string; platform_fit: string }, i: number) => (
                <div key={i} style={{ ...cardStyle, borderLeft: `4px solid ${['#6c63ff', '#00d4b8', '#e040fb'][i % 3]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Story {i + 1}: {s.title}</span>
                    <button onClick={() => copyText(`${s.hook}\n\n${s.body}\n\n${s.call_to_action}`)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>コピー</button>
                  </div>
                  <div style={{ fontSize: 14, color: '#00d4b8', fontWeight: 600, marginBottom: 8 }}>{s.hook}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{s.body}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>感情の流れ</div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 2 }}>{s.emotional_arc}</div>
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CTA</div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 2 }}>{s.call_to_action}</div>
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>最適プラットフォーム</div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 2 }}>{s.platform_fit}</div>
                    </div>
                  </div>
                </div>
              ))}
              {viralResult.storytelling_tips && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>📝 ストーリーテリングのコツ</div>
                  {viralResult.storytelling_tips.map((t: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '5px 0' }}>💡 {t}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== Monetize タブ ========== */}
      {activeTab === 'monetize' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 収益化ロードマップ入力 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>💰 収益化ロードマップ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>現在のフォロワー数</label>
                <input value={currentFollowers} onChange={e => setCurrentFollowers(e.target.value)} placeholder="100" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>目標月収（円）</label>
                <input value={targetIncome} onChange={e => setTargetIncome(e.target.value)} placeholder="300000" style={inputStyle} />
              </div>
            </div>
            <button onClick={handleMonetize} disabled={loading} style={{ ...btnPrimary, maxWidth: 300, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              💰 ロードマップを生成
            </button>
          </div>

          {/* ロードマップ結果 */}
          {monetizeResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SaveToLibraryButton title={`${avatar.name}の収益化ロードマップ`} content={JSON.stringify(monetizeResult, null, 2)} type="avatar-monetize" groupName="SNSアバター" tags={`収益化,${avatar.name}`} />

              {/* フェーズ */}
              {monetizeResult.roadmap_phases && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>🗺️ ロードマップフェーズ</div>
                  {monetizeResult.roadmap_phases.map((phase: { phase: string; followers_needed: number; revenue_sources: string[]; monthly_income: number; timeline: string }, i: number) => (
                    <div key={i} style={{ padding: 14, marginBottom: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `4px solid ${['#6c63ff', '#00d4b8', '#f5a623', '#e040fb', '#ff6b6b'][i % 5]}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{phase.phase}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8' }}>¥{phase.monthly_income.toLocaleString()}/月</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        必要フォロワー: {phase.followers_needed.toLocaleString()} / 期間: {phase.timeline}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {phase.revenue_sources.map((src, j) => (
                          <span key={j} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(108,99,255,0.06)', color: '#6c63ff' }}>{src}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* おすすめ初商品 */}
              {monetizeResult.recommended_first_product && (
                <div style={{ ...cardStyle, borderLeft: '4px solid #f5a623' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 6 }}>🎯 最初に作るべき商品</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{monetizeResult.recommended_first_product}</div>
                </div>
              )}

              {/* 収益シミュレーション */}
              {monetizeResult.income_simulation && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8', marginBottom: 10 }}>💹 12ヶ月収益シミュレーション</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>月</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>収入</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>主な収益源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monetizeResult.income_simulation.map((s: { month: number; income: number; source: string }) => (
                          <tr key={s.month} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.month}ヶ月目</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#00d4b8', fontWeight: 700 }}>¥{s.income.toLocaleString()}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{s.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* アクションアイテム */}
              {monetizeResult.action_items && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e040fb', marginBottom: 8 }}>✅ アクションアイテム</div>
                  {monetizeResult.action_items.map((a: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>☑ {a}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 商品設計 */}
          <div style={cardStyle}>
            <div style={sectionTitle}>🛍️ デジタル商品設計</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>商品タイプ</label>
                <select value={productType} onChange={e => setProductType(e.target.value)} style={inputStyle}>
                  {PRODUCT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>目標価格（円）</label>
                <input value={productPrice} onChange={e => setProductPrice(e.target.value)} placeholder="3980" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ターゲット</label>
                <input value={productAudience} onChange={e => setProductAudience(e.target.value)} placeholder="副業初心者" style={inputStyle} />
              </div>
            </div>
            <button onClick={handleProduct} disabled={loading} style={{ ...btnPrimary, maxWidth: 300, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              🛍️ 商品を設計
            </button>
          </div>

          {/* 商品設計結果 */}
          {productResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SaveToLibraryButton title={`${avatar.name}の商品: ${productResult.product_name || productType}`} content={JSON.stringify(productResult, null, 2)} type="avatar-product" groupName="SNSアバター" tags={`商品設計,${avatar.name}`} />

              {/* 商品概要 */}
              <div style={{ ...cardStyle, borderLeft: '4px solid #6c63ff' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{productResult.product_name}</div>
                {productResult.tagline && (
                  <div style={{ fontSize: 14, color: '#6c63ff', fontWeight: 600 }}>{productResult.tagline}</div>
                )}
              </div>

              {/* カリキュラム */}
              {productResult.curriculum && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4b8', marginBottom: 10 }}>📚 カリキュラム</div>
                  {productResult.curriculum.map((m: { module: number; title: string; description: string; duration: string }) => (
                    <div key={m.module} style={{ padding: 10, marginBottom: 8, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Module {m.module}: {m.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.duration}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{m.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* セールスページコピー */}
              {productResult.sales_page && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e040fb', marginBottom: 12 }}>📄 セールスページコピー</div>

                  <div style={{ padding: 14, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{productResult.sales_page.headline}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{productResult.sales_page.subheadline}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div style={{ padding: 10, background: 'rgba(255,107,107,0.05)', borderRadius: 8, border: '1px solid rgba(255,107,107,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6b6b', marginBottom: 6 }}>😣 こんな悩みありませんか？</div>
                      {productResult.sales_page.pain_points.map((p: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>❌ {p}</div>
                      ))}
                    </div>
                    <div style={{ padding: 10, background: 'rgba(0,212,184,0.05)', borderRadius: 8, border: '1px solid rgba(0,212,184,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4b8', marginBottom: 6 }}>✨ 手に入るもの</div>
                      {productResult.sales_page.benefits.map((b: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>✅ {b}</div>
                      ))}
                    </div>
                  </div>

                  {productResult.sales_page.testimonial_templates && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>💬 お客様の声テンプレート</div>
                      {productResult.sales_page.testimonial_templates.map((t: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 8, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 6, fontStyle: 'italic' }}>
                          &ldquo;{t}&rdquo;
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>💰 価格の見せ方</div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 4 }}>{productResult.sales_page.pricing_text}</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>🚀 CTA</div>
                      <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 700, marginTop: 4 }}>{productResult.sales_page.cta}</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>🛡️ 保証</div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 4 }}>{productResult.sales_page.guarantee}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ローンチプラン */}
              {productResult.launch_plan && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 10 }}>🚀 ローンチプラン</div>
                  {productResult.launch_plan.map((step: string, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
