'use client';
import { useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';

interface InfographicSection {
  heading: string;
  icon: string;
  key_number: string;
  body: string;
  bullet_points: string[];
}

interface InfographicResult {
  title: string;
  subtitle: string;
  sections: InfographicSection[];
  key_takeaway: string;
  cta: string;
  hashtags: string[];
  color_suggestion: string;
  layout_suggestion: string;
}

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'x', label: 'X', icon: '𝕏' },
  { value: 'pinterest', label: 'Pinterest', icon: '📌' },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { value: 'note', label: 'note', icon: '📝' },
];

const STYLE_OPTIONS = [
  { value: 'modern', label: 'モダン・ミニマル' },
  { value: 'colorful', label: 'カラフル・ポップ' },
  { value: 'corporate', label: 'コーポレート・ビジネス' },
  { value: 'infographic', label: 'データ可視化重視' },
  { value: 'storytelling', label: 'ストーリーテリング型' },
];

const SAMPLE = {
  topic: '2026年のAIトレンド予測 - 生成AIが変える5つの産業',
  content: '生成AIの市場規模は2026年に約1000億ドルに到達見込み。医療、教育、製造、金融、クリエイティブの5分野で特に大きな変革が起きている。医療分野ではAI診断の精度が人間の専門医と同等レベルに。教育分野では個別最適化学習が主流に。',
  style: 'modern',
  platform: 'instagram',
};

export default function InfographicPage() {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [style, setStyle] = useState('modern');
  const [platform, setPlatform] = useState('instagram');
  const [result, setResult] = useState<InfographicResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setTopic(SAMPLE.topic);
    setContent(SAMPLE.content);
    setStyle(SAMPLE.style);
    setPlatform(SAMPLE.platform);
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/infographic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, content, style, platform }),
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

  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【インフォグラフィック】${result.title}`);
    lines.push(result.subtitle);
    lines.push(`プラットフォーム: ${platform}`);
    lines.push('');
    result.sections.forEach((s, i) => {
      lines.push(`--- セクション ${i + 1}: ${s.icon} ${s.heading} ---`);
      if (s.key_number) lines.push(`キーナンバー: ${s.key_number}`);
      lines.push(s.body);
      s.bullet_points.forEach(b => lines.push(`・${b}`));
      lines.push('');
    });
    lines.push('--- 重要ポイント ---');
    lines.push(result.key_takeaway);
    lines.push('');
    if (result.cta) {
      lines.push('--- CTA ---');
      lines.push(result.cta);
      lines.push('');
    }
    if (result.color_suggestion) lines.push(`カラー提案: ${result.color_suggestion}`);
    if (result.layout_suggestion) lines.push(`レイアウト提案: ${result.layout_suggestion}`);
    lines.push('');
    lines.push(`ハッシュタグ: ${(result.hashtags || []).join(' ')}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `infographic_${platform}_${Date.now()}.txt`;
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
      <ProgressBar loading={progressLoading} progress={progress} label="インフォグラフィックを生成中..." />

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📊 インフォグラフィック用テキスト生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        情報をインフォグラフィック向けに構造化し、視覚的に伝わるテキストを自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/image-prompt', icon: '🎨', label: '画像プロンプト' },
          { href: '/dashboard/copy-generator', icon: '💬', label: 'コピー生成' },
          { href: '/dashboard/storytelling', icon: '📖', label: 'ストーリーテリング' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>インフォグラフィックを生成</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        {/* プラットフォーム選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>プラットフォーム</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {PLATFORMS.map(p => (
              <button
                key={p.value}
                onClick={() => setPlatform(p.value)}
                style={{
                  padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                  border: platform === p.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: platform === p.value ? 'linear-gradient(135deg, var(--accent-soft), rgba(0,212,184,0.08))' : 'var(--bg-primary)',
                  color: platform === p.value ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: platform === p.value ? 700 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                {p.label}
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
            placeholder="例：2026年のAIトレンド予測"
            style={inputStyle}
          />
        </div>

        {/* コンテンツ */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>参考情報・素材（任意）</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="インフォグラフィックの素材となる情報を入力してください..."
            rows={5}
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* スタイル */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>スタイル</label>
          <select
            value={style}
            onChange={e => setStyle(e.target.value)}
            style={inputStyle}
          >
            {STYLE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
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
            {loading ? '生成中...' : 'インフォグラフィックを生成'}
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
          インフォグラフィックをAIが構成しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`インフォグラフィック: ${result.title}`}
              content={rawText}
              type="infographic"
              groupName="インフォグラフィック"
              tags={`インフォグラフィック,${platform}`}
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
          </div>

          {/* タイトル・サブタイトル */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {result.title}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {result.subtitle}
            </div>
          </div>

          {/* セクションカード */}
          {result.sections && result.sections.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {result.sections.map((section, i) => (
                <div key={i} style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 28 }}>{section.icon}</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{section.heading}</div>
                  </div>
                  {section.key_number && (
                    <div style={{
                      fontSize: 28, fontWeight: 800, color: '#6c63ff',
                      background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
                      borderRadius: 8, padding: '8px 14px', textAlign: 'center',
                    }}>
                      {section.key_number}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {section.body}
                  </div>
                  {section.bullet_points && section.bullet_points.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {section.bullet_points.map((point, j) => (
                        <div key={j} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ color: '#6c63ff', fontWeight: 700, flexShrink: 0 }}>•</span>
                          {point}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 重要ポイント */}
          {result.key_takeaway && (
            <div style={{
              background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
              border: '2px solid #6c63ff40',
              borderRadius: 12, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>KEY TAKEAWAY</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {result.key_takeaway}
              </div>
            </div>
          )}

          {/* CTA */}
          {result.cta && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
              borderLeft: '4px solid #4ade80',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>CTA（行動喚起）</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{result.cta}</div>
            </div>
          )}

          {/* カラー・レイアウト提案 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {result.color_suggestion && (
              <div style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>🎨 カラー提案</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.color_suggestion}</div>
              </div>
            )}
            {result.layout_suggestion && (
              <div style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>📐 レイアウト提案</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.layout_suggestion}</div>
              </div>
            )}
          </div>

          {/* ハッシュタグ */}
          {result.hashtags && result.hashtags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.hashtags.map((tag, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 16,
                  background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
                  color: '#6c63ff', cursor: 'pointer',
                }} onClick={() => navigator.clipboard.writeText(tag)}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
