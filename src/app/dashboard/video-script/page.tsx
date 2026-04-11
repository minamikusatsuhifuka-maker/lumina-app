'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

interface ScriptSection {
  heading: string;
  script: string;
  visual_note: string;
  duration_sec: number;
}

interface VideoScriptResult {
  title: string;
  thumbnail_text: string;
  hook: string;
  sections: ScriptSection[];
  cta: string;
  hashtags: string[];
  description: string;
  tips: string[];
}

const PLATFORMS = [
  { value: 'youtube', label: 'YouTube', icon: '\u25B6\uFE0F' },
  { value: 'reels', label: 'Reels', icon: '\uD83D\uDCF1' },
  { value: 'shorts', label: 'Shorts', icon: '\u26A1' },
  { value: 'presentation', label: 'プレゼン', icon: '\uD83C\uDFAF' },
];

const DURATION_OPTIONS: Record<string, { value: string; label: string }[]> = {
  youtube: [
    { value: '5分', label: '5分（ショート）' },
    { value: '10分', label: '10分（標準）' },
    { value: '15分', label: '15分（詳細）' },
    { value: '20分以上', label: '20分以上（長編）' },
  ],
  reels: [
    { value: '15秒', label: '15秒' },
    { value: '30秒', label: '30秒' },
    { value: '60秒', label: '60秒' },
    { value: '90秒', label: '90秒' },
  ],
  shorts: [
    { value: '15秒', label: '15秒' },
    { value: '30秒', label: '30秒' },
    { value: '60秒', label: '60秒（最大）' },
  ],
  presentation: [
    { value: '5分', label: '5分（LT）' },
    { value: '10分', label: '10分' },
    { value: '15分', label: '15分' },
    { value: '30分', label: '30分' },
  ],
};

const TONE_OPTIONS = [
  { value: 'casual', label: 'カジュアル' },
  { value: 'professional', label: 'プロフェッショナル' },
  { value: 'educational', label: '教育的' },
  { value: 'entertaining', label: 'エンタメ' },
  { value: 'inspirational', label: '感動・モチベーション' },
];

const SAMPLE = {
  topic: '2025年のAI活用術 - 生成AIで業務効率を3倍にする方法',
  platform: 'youtube',
  duration: '10分',
  tone: 'educational',
  sourceContent: '生成AIツール（ChatGPT、Claude、Gemini）の最新機能と、実際のビジネス活用事例。特に文章作成、データ分析、コード生成での具体的な時短テクニックを紹介。',
};

export default function VideoScriptPage() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('youtube');
  const [duration, setDuration] = useState('10分');
  const [tone, setTone] = useState('educational');
  const [sourceContent, setSourceContent] = useState('');
  const [result, setResult] = useState<VideoScriptResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const handlePlatformChange = (p: string) => {
    setPlatform(p);
    const durations = DURATION_OPTIONS[p];
    if (durations && durations.length > 0) {
      setDuration(durations[0].value);
    }
  };

  const fillSample = () => {
    setTopic(SAMPLE.topic);
    setPlatform(SAMPLE.platform);
    setDuration(SAMPLE.duration);
    setTone(SAMPLE.tone);
    setSourceContent(SAMPLE.sourceContent);
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');
    setActiveTab(0);

    try {
      const res = await fetch('/api/video-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, platform, duration, tone, sourceContent }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      setResult(data);
      setRawText(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【動画スクリプト】${result.title}`);
    lines.push(`サムネイル: ${result.thumbnail_text}`);
    lines.push(`プラットフォーム: ${platform}`);
    lines.push('');
    lines.push('--- フック ---');
    lines.push(result.hook);
    lines.push('');
    result.sections.forEach((s, i) => {
      lines.push(`--- セクション ${i + 1}: ${s.heading} (${s.duration_sec}秒) ---`);
      lines.push('[読み上げ原稿]');
      lines.push(s.script);
      lines.push('[映像演出]');
      lines.push(s.visual_note);
      lines.push('');
    });
    lines.push('--- CTA ---');
    lines.push(result.cta);
    lines.push('');
    lines.push('--- 説明文 ---');
    lines.push(result.description);
    lines.push('');
    lines.push(`ハッシュタグ: ${(result.hashtags || []).join(' ')}`);
    lines.push('');
    lines.push('--- 撮影・編集のコツ ---');
    (result.tips || []).forEach(t => lines.push(`・${t}`));

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `script_${platform}_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="スクリプトを生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        動画スクリプト
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        YouTube・Reels・Shorts・プレゼン向けの動画スクリプトをAIが自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/write', icon: '\u270D\uFE0F', label: '文章作成' },
          { href: '/dashboard/copy-generator', icon: '\uD83D\uDCAC', label: 'コピー生成' },
          { href: '/dashboard/image-prompt', icon: '\uD83C\uDFA8', label: '画像プロンプト' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>動画スクリプトを生成</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        {/* プラットフォーム選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>プラットフォーム</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {PLATFORMS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePlatformChange(p.value)}
                style={{
                  padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                  border: platform === p.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: platform === p.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                  color: platform === p.value ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: platform === p.value ? 700 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 24 }}>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* トピック */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>トピック・テーマ *</label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例：2025年のAI活用術"
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* 尺・トーン */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>目標尺</label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {(DURATION_OPTIONS[platform] || []).map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>トーン</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {TONE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 参考情報 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>参考情報（任意）</label>
          <textarea
            value={sourceContent}
            onChange={e => setSourceContent(e.target.value)}
            placeholder="スクリプト作成の参考にしたい情報があれば貼り付けてください..."
            rows={4}
            style={{
              width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>* は必須項目です</div>
          <button onClick={generate} disabled={loading || !topic.trim()} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !topic.trim()) ? 0.5 : 1,
          }}>
            {loading ? '生成中...' : 'スクリプトを生成'}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          動画スクリプトをAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`動画スクリプト: ${result.title}`}
              content={rawText}
              type="video-script"
              groupName="動画スクリプト"
              tags="動画,スクリプト"
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
          </div>

          {/* タイトル・サムネイル・ハッシュタグ */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              {result.title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              {result.thumbnail_text && (
                <span style={{
                  fontSize: 13, fontWeight: 700, padding: '6px 16px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff',
                }}>
                  {result.thumbnail_text}
                </span>
              )}
            </div>
            {result.hashtags && result.hashtags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.hashtags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 12,
                    background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
                    color: '#6c63ff',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* フック */}
          {result.hook && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
              borderLeft: '4px solid #ff6b6b',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b6b', marginBottom: 6 }}>
                HOOK（冒頭フック）
              </div>
              <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 600 }}>
                {result.hook}
              </div>
            </div>
          )}

          {/* セクション（タブ） */}
          {result.sections && result.sections.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
            }}>
              {/* タブヘッダー */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
                {result.sections.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    style={{
                      padding: '12px 18px', border: 'none', cursor: 'pointer',
                      background: activeTab === i ? 'var(--bg-primary)' : 'transparent',
                      color: activeTab === i ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: activeTab === i ? 700 : 500,
                      fontSize: 13, borderBottom: activeTab === i ? '2px solid #6c63ff' : '2px solid transparent',
                      whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}
                  >
                    {s.heading}
                    <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>{s.duration_sec}秒</span>
                  </button>
                ))}
              </div>

              {/* タブコンテンツ */}
              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>読み上げ原稿</div>
                  <div style={{
                    fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap',
                    padding: '14px 18px', background: 'var(--bg-primary)', borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}>
                    {result.sections[activeTab]?.script}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f5a623', marginBottom: 6 }}>映像・演出ノート</div>
                  <div style={{
                    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
                    padding: '12px 16px', background: 'rgba(245,166,35,0.05)', borderRadius: 8,
                    border: '1px solid rgba(245,166,35,0.15)',
                  }}>
                    {result.sections[activeTab]?.visual_note}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CTA */}
          {result.cta && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
              borderLeft: '4px solid #4ade80',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
                CTA（行動喚起）
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.cta}
              </div>
            </div>
          )}

          {/* 説明文 */}
          {result.description && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                動画説明文
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {result.description}
              </div>
            </div>
          )}

          {/* 撮影のコツ */}
          {result.tips && result.tips.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
              border: '1px solid #6c63ff30', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6c63ff', marginBottom: 10 }}>
                撮影・編集のコツ
              </div>
              {result.tips.map((tip, i) => (
                <div key={i} style={{
                  fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                  padding: '6px 0', display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span style={{ color: '#6c63ff', fontWeight: 700, flexShrink: 0 }}>{'\u2022'}</span>
                  {tip}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
