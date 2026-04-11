'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';

interface StorytellingResult {
  title: string;
  hook: string;
  story: string;
  key_message: string;
  emotional_arc: string;
  metaphors_used: string[];
  suggested_visuals: string[];
}

const STRUCTURES = [
  { value: 'kishoten', label: '起承転結', icon: '🏯', desc: '日本の伝統的な4段構成' },
  { value: 'hero', label: 'ヒーローズジャーニー', icon: '⚔️', desc: '変容と成長の物語' },
  { value: 'problem_solution', label: '問題解決型', icon: '💡', desc: '課題→解決→結果' },
  { value: 'sparkline', label: 'スパークライン', icon: '✨', desc: '理想と現実の対比' },
  { value: 'peel', label: 'PEEL', icon: '📐', desc: 'Point→Evidence→Explain→Link' },
];

const TARGET_OPTIONS = [
  { value: 'general', label: '一般' },
  { value: 'business', label: 'ビジネスパーソン' },
  { value: 'student', label: '学生' },
  { value: 'expert', label: '専門家' },
  { value: 'patient', label: '患者・一般市民' },
  { value: 'investor', label: '投資家・経営者' },
];

const LENGTH_OPTIONS = [
  { value: 'short', label: '短め（400〜600文字）' },
  { value: 'standard', label: '標準（800〜1200文字）' },
  { value: 'long', label: '長め（1500〜2000文字）' },
  { value: 'very_long', label: '詳細（2500文字以上）' },
];

const SAMPLE = {
  topic: 'AI画像診断が救った患者の命 - 医療現場のAI活用ストーリー',
  content: '2025年、ある地方のクリニックでAI画像診断システムが導入された。初期段階で見逃されやすい皮膚がんをAIが検出し、早期治療に繋がった事例。AIと人間の医師の協力が患者の命を救った。',
  structure: 'hero',
  targetReader: 'general',
  length: 'standard',
};

export default function StorytellingPage() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [structure, setStructure] = useState('kishoten');
  const [targetReader, setTargetReader] = useState('general');
  const [length, setLength] = useState('standard');
  const [result, setResult] = useState<StorytellingResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setTopic(SAMPLE.topic);
    setContent(SAMPLE.content);
    setStructure(SAMPLE.structure);
    setTargetReader(SAMPLE.targetReader);
    setLength(SAMPLE.length);
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');
    setCopied(false);

    try {
      const res = await fetch('/api/storytelling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, content, structure, targetReader, length }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
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

  const copyStory = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.story);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendToWrite = () => {
    if (!result) return;
    sessionStorage.setItem('brainstorm_to_write', JSON.stringify({
      prompt: `以下のストーリーをもとに、ブログ記事やコンテンツを作成してください：\n\nタイトル: ${result.title}\n\n${result.story}`,
      mode: 'blog',
    }));
    router.push('/dashboard/write');
  };

  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【ストーリー】${result.title}`);
    lines.push(`構造: ${STRUCTURES.find(s => s.value === structure)?.label || structure}`);
    lines.push(`感情の流れ: ${result.emotional_arc}`);
    lines.push('');
    lines.push('--- フック ---');
    lines.push(result.hook);
    lines.push('');
    lines.push('--- 本文 ---');
    lines.push(result.story);
    lines.push('');
    lines.push('--- 核心メッセージ ---');
    lines.push(result.key_message);
    lines.push('');
    if (result.metaphors_used && result.metaphors_used.length > 0) {
      lines.push('--- 使用した比喩表現 ---');
      result.metaphors_used.forEach(m => lines.push(`・${m}`));
      lines.push('');
    }
    if (result.suggested_visuals && result.suggested_visuals.length > 0) {
      lines.push('--- ビジュアル提案 ---');
      result.suggested_visuals.forEach(v => lines.push(`・${v}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `story_${structure}_${Date.now()}.txt`;
    a.click();
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={progressLoading} progress={progress} label="ストーリーを生成中..." />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📖 ストーリーテリング変換
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        情報やデータを心に響くストーリーに変換します。起承転結・ヒーローズジャーニーなどの構造を選択可能
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
          { href: '/dashboard/brainstorm', icon: '💡', label: 'ブレスト' },
          { href: '/dashboard/infographic', icon: '📊', label: 'インフォグラフィック' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>ストーリーを生成</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        {/* 物語構造選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>物語構造</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {STRUCTURES.map(s => (
              <button
                key={s.value}
                onClick={() => setStructure(s.value)}
                style={{
                  padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                  border: structure === s.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: structure === s.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                  color: structure === s.value ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 11, fontWeight: structure === s.value ? 700 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s', textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <span>{s.label}</span>
                <span style={{ fontSize: 9, opacity: 0.7 }}>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* トピック */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>トピック *</label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例：AI画像診断が救った患者の命"
            style={inputStyle}
          />
        </div>

        {/* コンテンツ */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>参考情報・素材（任意）</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="ストーリーの素材となる情報、データ、エピソードなどを入力してください..."
            rows={5}
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* ターゲット読者・文章量 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲット読者</label>
            <select
              value={targetReader}
              onChange={e => setTargetReader(e.target.value)}
              style={inputStyle}
            >
              {TARGET_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>文章量</label>
            <select
              value={length}
              onChange={e => setLength(e.target.value)}
              style={inputStyle}
            >
              {LENGTH_OPTIONS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
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
            {loading ? '生成中...' : 'ストーリーを生成'}
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
          ストーリーをAIが紡いでいます...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`ストーリー: ${result.title}`}
              content={rawText}
              type="storytelling"
              groupName="ストーリーテリング"
              tags={`ストーリー,${STRUCTURES.find(s => s.value === structure)?.label || structure}`}
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
            <button
              onClick={sendToWrite}
              style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              ✍️ 文章作成に送る
            </button>
          </div>

          {/* タイトル・感情の流れ */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              {result.title}
            </div>
            {result.emotional_arc && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 14px', borderRadius: 20,
                background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
                fontSize: 12, color: '#6c63ff', fontWeight: 600,
              }}>
                🎭 {result.emotional_arc}
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
              <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 600 }}>
                {result.hook}
              </div>
            </div>
          )}

          {/* ストーリー本文 */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ストーリー本文</div>
              <button
                onClick={copyStory}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
              >
                {copied ? '✓ コピー済み' : 'コピー'}
              </button>
            </div>
            <div style={{
              fontSize: 14, color: 'var(--text-secondary)', lineHeight: 2.0, whiteSpace: 'pre-wrap',
              padding: '16px 20px', background: 'var(--bg-primary)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              {result.story}
            </div>
          </div>

          {/* 核心メッセージ */}
          {result.key_message && (
            <div style={{
              background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
              border: '2px solid #6c63ff40',
              borderRadius: 12, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>KEY MESSAGE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {result.key_message}
              </div>
            </div>
          )}

          {/* 比喩表現 */}
          {result.metaphors_used && result.metaphors_used.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                🎭 使用した比喩表現
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.metaphors_used.map((m, i) => (
                  <span key={i} style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 20,
                    background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)',
                    color: 'var(--text-secondary)',
                  }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ビジュアル提案 */}
          {result.suggested_visuals && result.suggested_visuals.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
              borderLeft: '4px solid #4ade80',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 10 }}>
                🖼️ ビジュアル提案
              </div>
              {result.suggested_visuals.map((v, i) => (
                <div key={i} style={{
                  fontSize: 13, color: 'var(--text-secondary)', padding: '5px 0',
                  display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6,
                }}>
                  <span style={{ color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>•</span>
                  {v}
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
