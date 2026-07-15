'use client';
import { useEffect, useRef, useState } from 'react';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { ImageModelSelector } from '@/components/image/ImageModelSelector';
import { ImageCompareGrid } from '@/components/image/ImageCompareGrid';
import { useMultiImageGen } from '@/lib/useMultiImageGen';
import {
  ASPECT_OPTIONS,
  DEFAULT_MODELS,
  type ImageAspect,
  type ImageModelKey,
  type ImageQuality,
} from '@/lib/image-providers';

const QUALITY_OPTIONS = [
  { value: 'high', label: '高品質（high）— コスト高め' },
  { value: 'medium', label: '標準（medium）— コスト中・既定' },
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
  aspect?: ImageAspect;
  quality?: ImageQuality;
  models?: ImageModelKey[];
}

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<ImageAspect>('square');
  const [quality, setQuality] = useState<ImageQuality>('medium');
  const [models, setModels] = useState<ImageModelKey[]>(DEFAULT_MODELS);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // 複数モデルの並列生成（個別ローディング・部分成功）
  const { slots, generating, run, reset } = useMultiImageGen();

  // 復元取得が返ってきた時点で既に入力/実行が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current = generating || slots.length > 0 || !!prompt.trim();

  // マウント時に前回の生成条件（自動下書き）を復元。画像は保存していないため再生成する
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<ImageGenDraftPayload>('image-gen');
      if (cancelled || !draft?.payload?.prompt) return;
      if (draftGuardRef.current) return;
      const p = draft.payload;
      setPrompt(p.prompt ?? '');
      if (p.aspect) setAspect(p.aspect);
      if (p.quality) setQuality(p.quality);
      if (p.models && p.models.length > 0) setModels(p.models);
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
    setAspect('square');
    setQuality('medium');
    setModels(DEFAULT_MODELS);
    reset();
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
    if (!prompt.trim() || generating || models.length === 0) return;
    setError('');
    setRestoredAt(null); // 新規実行は「復元」ではない
    // 生成条件を自動下書き保存（画像base64は重いため保存しない。復元時は再生成）
    saveFeatureDraft('image-gen', { prompt, aspect, quality, models } satisfies ImageGenDraftPayload);
    await run(prompt, models, aspect, quality);
    // 履歴を更新（fire-and-forget）
    loadHistory();
  };

  // 履歴の条件を入力欄へ反映（プロンプトのみ。モデル/比率は現在の選択を維持）
  const applyHistory = (h: HistoryItem) => {
    setPrompt(h.prompt);
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
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🎨 画像生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        GPT Image 2 / Nano Banana 2 / Nano Banana Pro から選んで生成。複数選べば同時生成して見比べられます。
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

        {/* モデル選択（複数可・最低1つ） */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            モデル（複数選ぶと同時生成して比較）
          </div>
          <ImageModelSelector selected={models} onChange={setModels} disabled={generating} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              比率
            </div>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as ImageAspect)} style={inputStyle}>
              {ASPECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              品質（GPT Image 2 のみ）
            </div>
            <select value={quality} onChange={(e) => setQuality(e.target.value as ImageQuality)} style={inputStyle}>
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          ※ 品質は GPT Image 2 のコストに直結します。Nano Banana 系は解像度・比率で決まり、品質指定はありません。透過背景は指定できません
        </p>

        <button
          type="button"
          onClick={generate}
          disabled={generating || !prompt.trim() || models.length === 0}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: 'none',
            cursor: generating || !prompt.trim() ? 'not-allowed' : 'pointer',
            background:
              generating || !prompt.trim()
                ? 'rgba(108,99,255,0.4)'
                : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {generating ? '🎨 生成中...' : `🎨 画像を生成（${models.length}枚）`}
        </button>
      </div>

      {/* エラー（通信レベル） */}
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

      {/* 生成結果（モデルごとに横並び比較・個別ローディング・部分成功） */}
      {slots.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            🖼 生成結果
          </div>
          <ImageCompareGrid slots={slots} prompt={prompt} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.7 }}>
            ⚠️ 生成画像を広告・院内掲示・Webサイト等に使う場合は、医療広告ガイドライン（誇大表現・
            ビフォーアフター規制等）に適合するか必ずご確認ください。
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
            プロンプトと設定のみ保存しています（画像は未保存）。「この条件で再生成」でプロンプトが入力欄に反映されます
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
