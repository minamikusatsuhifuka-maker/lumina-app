'use client';
import { useEffect, useRef, useState } from 'react';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '正方形（1024×1024）' },
  { value: '1536x1024', label: '横長（1536×1024）' },
  { value: '1024x1536', label: '縦長（1024×1536）' },
  { value: 'auto', label: 'おまかせ（auto）' },
];

const QUALITY_OPTIONS = [
  { value: 'high', label: '高品質（high）— コスト高め・既定' },
  { value: 'medium', label: '標準（medium）— コスト中' },
  { value: 'low', label: '軽量（low）— コスト低' },
];

interface HistoryItem {
  id: number;
  prompt: string;
  size: string;
  quality: string;
  created_at: string;
}

// 自動下書き（feature_result_drafts feature_key='image-gen'）のpayload
// 画像base64は重いため保存しない＝プロンプト＋設定のみ復元し、画像は再生成する
interface ImageGenDraftPayload {
  prompt?: string;
  size?: string;
  quality?: string;
}

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('high');
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // 復元取得が返ってきた時点で既に入力/実行が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current = loading || !!image || !!prompt.trim();

  // マウント時に前回の生成条件（自動下書き）を復元。画像は保存していないため再生成する
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<ImageGenDraftPayload>('image-gen');
      if (cancelled || !draft?.payload?.prompt) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setPrompt(p.prompt ?? '');
      if (p.size) setSize(p.size);
      if (p.quality) setQuality(p.quality);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す
  const handleClearDraft = () => {
    setRestoredAt(null);
    setPrompt('');
    setSize('1024x1024');
    setQuality('high');
    setImage(null);
    setError('');
    clearFeatureDraft('image-gen');
  };

  // 生成履歴を取得（直近20件・プロンプトと設定のみ）
  const loadHistory = async () => {
    try {
      const res = await fetch('/api/image-gen');
      if (!res.ok) return;
      const data = await res.json();
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {}
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    setRestoredAt(null); // 新規実行は「復元」ではない
    setImage(null);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size, quality }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '画像生成に失敗しました');
      }
      setImage(data.image);
      // 生成条件を自動下書き保存（画像base64は重いため保存しない。復元時は再生成）
      saveFeatureDraft('image-gen', {
        prompt,
        size,
        quality,
      } satisfies ImageGenDraftPayload);
      // 履歴を更新（fire-and-forget）
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像生成に失敗しました');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  // PNGダウンロード（base64 data URL を直接DL）
  const downloadPng = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = `data:${image.mimeType};base64,${image.base64}`;
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, '');
    a.download = `image_${stamp}.png`;
    a.click();
  };

  // 履歴の条件を入力欄へ反映（再生成はユーザーが「生成」を押す）
  const applyHistory = (h: HistoryItem) => {
    setPrompt(h.prompt);
    setSize(h.size);
    setQuality(h.quality);
    setRestoredAt(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🎨 画像生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        OpenAI GPT Image 2 で画像を生成します。日本語の文字入れ・細かい指示に強いモデルです（透過背景は非対応）
      </p>

      {/* 自動下書きからの復元バナー（プロンプト＋設定のみ。画像は再生成） */}
      {restoredAt && (
        <div style={{ marginBottom: 4 }}>
          <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
            ※ 画像は保存していません。「生成」を押すと同じ条件で再生成できます
          </p>
        </div>
      )}

      {/* 入力フォーム */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            プロンプト（日本語可）
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={'例：『南草津皮フ科』の文字を入れた、やわらかい水彩タッチの院内掲示風イラスト。清潔感のある色合いで。'}
            rows={5}
            style={{
              ...inputStyle,
              fontSize: 16, // スマホ(iOS Safari)の自動ズーム防止のため16px以上
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.7,
              minHeight: 110,
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              サイズ
            </div>
            <select value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle}>
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              品質
            </div>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} style={inputStyle}>
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          ※ 品質はコストに直結します（high が最も高品質・高コスト）。透過背景の指定はできません
        </p>

        <button
          type="button"
          onClick={generate}
          disabled={loading || !prompt.trim()}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: 'none',
            cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            background:
              loading || !prompt.trim()
                ? 'rgba(108,99,255,0.4)'
                : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {loading ? `🎨 生成中... ${elapsed}秒` : '🎨 画像を生成'}
        </button>
      </div>

      {/* 生成中表示（最大2分） */}
      {loading && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid rgba(108,99,255,0.25)',
              borderTopColor: '#6c63ff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
            GPT Image 2 が画像を生成しています...
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {elapsed}秒経過 / 生成には最大2分かかることがあります。このままお待ちください
          </div>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div
          style={{
            padding: 16,
            background: 'rgba(255,107,107,0.1)',
            border: '1px solid rgba(255,107,107,0.25)',
            borderRadius: 10,
            color: '#ff6b6b',
            fontSize: 14,
            marginBottom: 20,
            lineHeight: 1.7,
          }}
        >
          {error}
        </div>
      )}

      {/* 生成結果 */}
      {image && !loading && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              🖼 生成結果
            </span>
            <button
              type="button"
              onClick={downloadPng}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ⬇ PNGダウンロード
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${image.mimeType};base64,${image.base64}`}
            alt="生成画像"
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--border)',
              display: 'block',
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.7 }}>
            ⚠️ 生成画像を広告・院内掲示・Webサイト等に使う場合は、医療広告ガイドライン（誇大表現・
            ビフォーアフター規制等）に適合するか必ずご確認ください。
            プロンプトを編集して「画像を生成」を押すと作り直せます。
          </p>
        </div>
      )}

      {/* 生成履歴（プロンプト・設定のみ。画像は保存していない） */}
      {history.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            🕘 生成履歴（直近{history.length}件）
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            プロンプトと設定のみ保存しています（画像は未保存）。「この条件で再生成」で入力欄に反映されます
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={h.prompt}
                  >
                    {h.prompt}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {h.size} / {h.quality} /{' '}
                    {new Date(h.created_at).toLocaleString('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => applyHistory(h)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  この条件で再生成
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
