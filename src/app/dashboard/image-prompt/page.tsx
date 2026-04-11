'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const TOOLS = [
  { id: 'midjourney', label: '🎨 Midjourney', desc: '高品質アート・イラスト', color: '#6c63ff' },
  { id: 'stable_diffusion', label: '🖼️ Stable Diffusion', desc: 'オープンソース・細かい制御', color: '#00d4b8' },
  { id: 'dalle', label: '🤖 DALL-E', desc: 'OpenAI・自然言語に強い', color: '#f5a623' },
  { id: 'firefly', label: '✨ Firefly', desc: 'Adobe・商用利用安心', color: '#ff6b6b' },
  { id: 'nano_banana', label: '🍌 Nano Banana 2', desc: '日本語対応・高速生成', color: '#eab308' },
];

const STYLES = [
  { value: 'realistic', label: 'リアル' },
  { value: 'anime', label: 'アニメ' },
  { value: 'watercolor', label: '水彩画' },
  { value: 'oil_painting', label: '油絵' },
  { value: 'minimal', label: 'ミニマル' },
  { value: 'cyberpunk', label: 'サイバーパンク' },
  { value: 'fantasy', label: 'ファンタジー' },
  { value: 'business', label: 'ビジネス' },
];

const MOODS = [
  { value: 'bright', label: '明るい・爽やか' },
  { value: 'dark', label: 'ダーク・シック' },
  { value: 'warm', label: '温かい・やさしい' },
  { value: 'cool', label: 'クール・洗練' },
  { value: 'dramatic', label: 'ドラマチック' },
  { value: 'playful', label: 'ポップ・楽しい' },
  { value: 'elegant', label: 'エレガント' },
  { value: 'natural', label: 'ナチュラル' },
];

const USAGES = [
  { value: 'sns', label: 'SNS' },
  { value: 'blog', label: 'ブログ' },
  { value: 'lp', label: 'LP' },
  { value: 'ad', label: '広告' },
  { value: 'product', label: '商品' },
  { value: 'presentation', label: 'プレゼン' },
];

interface ImageForm {
  description: string;
  style: string;
  mood: string;
  usage: string;
}

interface Variation {
  label: string;
  prompt: string;
}

interface ImageResult {
  main_prompt: string;
  style_tags: string;
  technical_params: string;
  negative_prompt: string;
  tips: string[];
  variations: Variation[];
}

export default function ImagePromptPage() {
  const [tool, setTool] = useState('midjourney');
  const [form, setForm] = useState<ImageForm>({ description: '', style: 'realistic', mood: 'bright', usage: 'sns' });
  const [result, setResult] = useState<ImageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedNeg, setCopiedNeg] = useState(false);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const updateForm = (key: keyof ImageForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const generate = async () => {
    if (!form.description.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tool }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  const copyText = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const copyVariation = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  /** メインプロンプトの結合テキスト */
  const fullPrompt = result ? [result.main_prompt, result.style_tags, result.technical_params].filter(Boolean).join('\n\n') : '';

  const selectedTool = TOOLS.find(t => t.id === tool);

  const selectStyle = {
    width: '100%' as const,
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23999\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="🎨 画像プロンプト生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🎨 画像プロンプト最適化
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
        画像生成AIに最適化されたプロンプトを自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/hp-generator', icon: '🏠', label: 'HP内容生成' },
          { href: '/dashboard/doc-prompt', icon: '📋', label: '資料プロンプト' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* ツール選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} style={{
            padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
            textAlign: 'center' as const, transition: 'all 0.15s',
            border: tool === t.id ? `2px solid ${t.color}` : '1px solid var(--border)',
            background: tool === t.id ? `${t.color}15` : 'var(--bg-secondary)',
            color: tool === t.id ? t.color : 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => {
          const samples: Record<string, Partial<typeof form>> = {
            midjourney: { description: '青い空と海が広がる沖縄の海岸で、白いリゾートウェアを着た30代女性がコーヒーを飲んでいる。朝の清々しい雰囲気。', style: 'realistic', mood: 'bright', usage: 'sns' },
            stable_diffusion: { description: '東京の夜景をバックに、スーツを着たビジネスマンがスマホを見ている。近未来的なサイバーパンクな雰囲気。', style: 'cyberpunk', mood: 'cool', usage: 'blog' },
            dalle: { description: '白を基調としたオフィスで複数の人がノートPCで作業。窓から自然光。チームワーク感。', style: 'business', mood: 'bright', usage: 'lp' },
            firefly: { description: '森の中の小川のそばに有機野菜や果物が並んでいる。自然光。温かみのある色調。', style: 'watercolor', mood: 'soft', usage: 'product' },
            nano_banana: { description: '可愛い猫がキーボードの上で丸くなって眠っている。暖かい室内光。', style: 'anime', mood: 'warm', usage: 'sns' },
          };
          const s = samples[tool];
          if (s) setForm(f => ({ ...f, ...s }));
        }} style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
        }}>📋 サンプルを入力</button>
      </div>
      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${selectedTool?.color}30`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selectedTool?.color, marginBottom: 16 }}>
          {selectedTool?.label} 用プロンプトを生成
        </div>

        {/* 説明 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>生成したい画像の説明 *</label>
          <textarea
            value={form.description}
            onChange={e => updateForm('description', e.target.value)}
            placeholder="例：桜並木の下で微笑む女性、カフェのテーブルに置かれたラテアート、未来都市の夜景..."
            style={{ width: '100%', minHeight: 100, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* スタイル */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>スタイル</label>
            <select
              value={form.style}
              onChange={e => updateForm('style', e.target.value)}
              style={selectStyle}
            >
              {STYLES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {/* ムード */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ムード</label>
            <select
              value={form.mood}
              onChange={e => updateForm('mood', e.target.value)}
              style={selectStyle}
            >
              {MOODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          {/* 用途 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>用途</label>
            <select
              value={form.usage}
              onChange={e => updateForm('usage', e.target.value)}
              style={selectStyle}
            >
              {USAGES.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {form.description.length.toLocaleString()}文字入力
          </div>
          <button onClick={generate} disabled={loading || !form.description.trim()} style={{
            padding: '12px 36px',
            background: `linear-gradient(135deg, ${selectedTool?.color}, ${selectedTool?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !form.description.trim()) ? 0.5 : 1,
          }}>
            {loading ? '⏳ 生成中...' : '🎨 プロンプト生成'}
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${selectedTool?.color}40`, borderTopColor: selectedTool?.color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          最適なプロンプトを生成中...
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ライブラリ保存 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SaveToLibraryButton
              title={`画像プロンプト: ${form.description.slice(0, 30)}`}
              content={fullPrompt + (result.negative_prompt ? `\n\n--- Negative ---\n${result.negative_prompt}` : '')}
              type="image-prompt"
              groupName="画像プロンプト"
              tags={`${selectedTool?.label},${STYLES.find(s => s.value === form.style)?.label}`}
            />
          </div>

          {/* メインプロンプト */}
          <div style={{ background: 'var(--bg-secondary)', border: `2px solid ${selectedTool?.color}40`, borderRadius: 12, padding: 20, position: 'relative' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: selectedTool?.color }}>
                {selectedTool?.label} プロンプト
              </div>
              <button onClick={() => copyText(fullPrompt, setCopiedMain)} style={{
                padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, transition: 'all 0.2s',
                background: copiedMain ? 'rgba(74,222,128,0.15)' : 'var(--bg-primary)',
                border: copiedMain ? '1px solid #4ade80' : '1px solid var(--border)',
                color: copiedMain ? '#4ade80' : 'var(--text-secondary)',
              }}>
                {copiedMain ? '✅ コピー済み' : '📋 コピー'}
              </button>
            </div>

            {/* メインプロンプト本文 */}
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const, fontFamily: 'monospace' }}>
                {result.main_prompt}
              </div>
            </div>

            {/* スタイルタグ */}
            {result.style_tags && (
              <div style={{ background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>スタイルタグ</div>
                <div style={{ fontSize: 13, color: '#6c63ff', fontFamily: 'monospace', lineHeight: 1.6 }}>
                  {result.style_tags}
                </div>
              </div>
            )}

            {/* テクニカルパラメータ */}
            {result.technical_params && (
              <div style={{ background: 'rgba(0,212,184,0.06)', border: '1px solid rgba(0,212,184,0.15)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>テクニカルパラメータ</div>
                <div style={{ fontSize: 13, color: '#00d4b8', fontFamily: 'monospace', lineHeight: 1.6 }}>
                  {result.technical_params}
                </div>
              </div>
            )}
          </div>

          {/* ネガティブプロンプト（SD用） */}
          {result.negative_prompt && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ff6b6b' }}>
                  🚫 ネガティブプロンプト
                </div>
                <button onClick={() => copyText(result.negative_prompt, setCopiedNeg)} style={{
                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: copiedNeg ? 'rgba(74,222,128,0.15)' : 'var(--bg-primary)',
                  border: copiedNeg ? '1px solid #4ade80' : '1px solid var(--border)',
                  color: copiedNeg ? '#4ade80' : 'var(--text-secondary)',
                }}>
                  {copiedNeg ? '✅ コピー済み' : '📋 コピー'}
                </button>
              </div>
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
                {result.negative_prompt}
              </div>
            </div>
          )}

          {/* Tips */}
          {result.tips && result.tips.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f5a623', marginBottom: 10 }}>
                💡 Tips
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.tips.map((tip, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.12)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* バリエーション */}
          {result.variations && result.variations.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6', marginBottom: 12 }}>
                🔄 バリエーション
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.variations.map((v, i) => (
                  <div key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>{v.label}</span>
                      <button onClick={() => copyVariation(v.prompt, i)} style={{
                        padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        background: copiedIdx === i ? 'rgba(74,222,128,0.15)' : 'var(--bg-secondary)',
                        border: copiedIdx === i ? '1px solid #4ade80' : '1px solid var(--border)',
                        color: copiedIdx === i ? '#4ade80' : 'var(--text-muted)',
                      }}>
                        {copiedIdx === i ? '✅' : '📋'}
                      </button>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
                      {v.prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
