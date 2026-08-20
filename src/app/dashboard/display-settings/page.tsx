'use client';

// 243: 画面右下の追従ボタンの表示設定。
// 既定は3つとも off（常時表示だと本文や操作ボタンに重なるため）。
// 保存先はテーマ・文字サイズと同じ localStorage（ThemeProvider が一元管理）。
//
// 247: 「生成結果の自動ストック保存」もこの画面に追加（既定on）。
// 追従ボタンと違って表示ではなく挙動の設定だが、院長指定でこの🎛表示設定に置く。

import { useEffect, useState } from 'react';
import { useTheme, FLOATING_BUTTONS } from '@/components/ThemeProvider';
import { useAutoStockSave } from '@/lib/auto-stock-save';

export default function DisplaySettingsPage() {
  const { floating, setFloating } = useTheme();
  const autoStock = useAutoStockSave();
  // localStorage の読み込みは ThemeProvider の useEffect 後に確定するため、
  // サーバー描画との食い違い（ハイドレーション不一致）を避けてマウント後に描く
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onCount = FLOATING_BUTTONS.filter((b) => floating[b.key]).length;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>🎛 表示設定</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.7 }}>
        画面の右下に出る追従ボタンの表示と、生成結果の自動ストック保存を切り替えます。
        設定はこのブラウザに保存されます。
      </p>

      <section
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>右下の追従ボタン</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          既定はすべて非表示です。使うものだけ表示に切り替えてください。
          表示中のボタンは右下に縦一列で並びます。
        </p>

        {!mounted ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>読み込み中…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FLOATING_BUTTONS.map((b) => {
              const on = floating[b.key];
              return (
                <label
                  key={b.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${on ? 'var(--border-accent, #6c63ff)' : 'var(--border)'}`,
                    background: on ? 'rgba(108,99,255,0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{b.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{b.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {b.hint}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setFloating(b.key, e.target.checked)}
                    aria-label={`${b.label}を表示する`}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6c63ff' }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: on ? '#6c63ff' : 'var(--text-muted)', width: 42, textAlign: 'right' }}>
                    {on ? '表示' : '非表示'}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.7 }}>
          {mounted && onCount === 0
            ? '現在はすべて非表示です。右下には「↑ トップへ戻る」だけが出ます。'
            : `現在 ${onCount} 個を表示中です。`}
        </p>
      </section>

      {/* 247: 生成結果の自動ストック保存（対象は📝テキスト分析・🔭ディープリサーチの2画面） */}
      <section
        style={{
          marginTop: 16,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>💾 生成結果の自動ストック保存</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          生成が終わった時点で、結果を自動でストックへ保存します。対象は
          <strong>📝 テキスト分析</strong>と<strong>🔭 ディープリサーチ</strong>の2画面です。
          手動の「💾 ストック保存」と同じ場所に入り、保存済みのボタンは「✅ 保存済み」に変わります
          （同じ内容が二重に入ることはありません）。
        </p>

        {!autoStock.mounted ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>読み込み中…</div>
        ) : (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${autoStock.enabled ? 'var(--border-accent, #6c63ff)' : 'var(--border)'}`,
              background: autoStock.enabled ? 'rgba(108,99,255,0.08)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>💾</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>自動でストックに保存する</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                既定はオンです。オフにすると、これまでどおり「💾 ストック保存」を押したときだけ保存します。
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoStock.enabled}
              onChange={(e) => autoStock.setEnabled(e.target.checked)}
              aria-label="生成結果を自動でストックに保存する"
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6c63ff' }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: autoStock.enabled ? '#6c63ff' : 'var(--text-muted)',
                width: 42,
                textAlign: 'right',
              }}
            >
              {autoStock.enabled ? 'オン' : 'オフ'}
            </span>
          </label>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.7 }}>
          保存に失敗しても生成結果は画面に残ります。そのときはボタンが「⚠️ 保存に失敗・再試行」に変わるので、
          押し直せば保存できます。
        </p>
      </section>

      <section
        style={{
          marginTop: 16,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>↑ トップへ戻る</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          常に有効です。300pxより下へスクロールしたときだけ、追従ボタン列の一番上に出ます。
          押すとページの先頭へ戻ります。
        </p>
      </section>
    </div>
  );
}
