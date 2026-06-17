'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ProofreadModal, type AppliedFix } from '@/components/proofread/ProofreadModal';
import { ProofreadComparison } from '@/components/proofread/ProofreadComparison';

// テキスト校正（DermaPDF Pro から移植）。検出 → レビュー（個別/一括）→ 適用 → 左右比較 → 保存。
// AI検出はサーバルート /api/proofread/detect 経由。保存は text_analysis_saves（保存一覧）に集約。
export default function ProofreadPage() {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [comparison, setComparison] = useState<{
    before: string;
    after: string;
    fixes: AppliedFix[];
  } | null>(null);

  const effectiveTitle = title.trim() || '無題テキスト';

  const startProofread = () => {
    if (!text.trim()) {
      showToast('校正するテキストを入力してください', 'warning');
      return;
    }
    setComparison(null);
    setShowModal(true);
  };

  // モーダル内「保存」: 校正後=content、校正前(原文)=inputText。folder はカテゴリに使わない。
  const saveCard = async (cardTitle: string, content: string, before: string) => {
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cardTitle,
          content,
          inputText: before,
          analysisType: 'proofread',
          analysisLabel: '校正済み',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '保存に失敗しました');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        🔎 テキスト校正
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        誤字・脱字・表記揺れをAIが検出。個別/一括で適用し、校正前｜校正後を並べて確認・保存できます。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/text-analysis', icon: '📝', label: 'テキスト分析' },
          { href: '/dashboard/simplifier', icon: '🔁', label: '難易度変換' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
          { href: '/dashboard/text-analysis?tab=saved', icon: '📁', label: '保存一覧' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 20,
              border: '1px solid var(--border)', color: 'var(--text-muted)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>{link.icon}</span>
            {link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
            タイトル（任意）
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: お知らせ原稿 / ブログ下書き など"
            style={{
              width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
            校正したいテキスト *
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="校正したい本文を貼り付けてください..."
            rows={12}
            style={{
              width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.7,
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {text.length}文字 / {text.split('\n').length}行
          </div>
          <button
            onClick={startProofread}
            style={{
              padding: '10px 24px', borderRadius: 10, cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              color: '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            🔎 校正を開始
          </button>
        </div>
      </div>

      {/* 左右比較（適用後に「メイン画面で大きく前後比較」を押すと表示） */}
      {comparison && (
        <ProofreadComparison
          before={comparison.before}
          after={comparison.after}
          title={effectiveTitle}
          fixes={comparison.fixes}
          onClose={() => setComparison(null)}
        />
      )}

      {/* 校正モーダル */}
      {showModal && (
        <ProofreadModal
          sourceText={text}
          sourceTitle={effectiveTitle}
          onSaveCard={saveCard}
          onClose={() => setShowModal(false)}
          onComparison={(before, after, fixes) => setComparison({ before, after, fixes })}
        />
      )}
    </div>
  );
}
