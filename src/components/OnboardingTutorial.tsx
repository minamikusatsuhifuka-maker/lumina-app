'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  {
    title: 'xLUMINAへようこそ！🎉',
    description: 'AIが情報収集から文章作成まで一気通貫で支援するプラットフォームです。まず主要機能をご案内します。',
    emoji: '🚀',
    action: null,
  },
  {
    title: 'Intelligence Hub',
    description: '8つのモードでニュース・SNS・市場・学術情報を一度に収集。競合調査や市場分析に最適です。',
    emoji: '🧠',
    action: { label: '試してみる', href: '/dashboard/intelligence' },
  },
  {
    title: 'AIワークフロー',
    description: '目的を入力するだけでAIが最適な機能の順序を提案・自動実行。複雑な調査も全自動で完了します。',
    emoji: '⚡',
    action: { label: '試してみる', href: '/dashboard/workflow' },
  },
  {
    title: '文章作成',
    description: 'ブログ・SNS・レポートなど15モードで高品質な文章を生成。バズり予測・読みやすさスコアも確認できます。',
    emoji: '✍️',
    action: { label: '試してみる', href: '/dashboard/write' },
  },
  {
    title: 'ライブラリ',
    description: '調査・分析・文章をすべて保存・管理。フォルダ分け・お気に入り・AI統合サマリーで情報を活用できます。',
    emoji: '📚',
    action: { label: '試してみる', href: '/dashboard/library' },
  },
  {
    title: '準備完了！',
    description: 'Cmd+K でいつでもコマンドパレットを開いて機能を素早く実行できます。右下のAIアシスタントも活用してください。',
    emoji: '✅',
    action: { label: 'はじめる', href: '/dashboard' },
  },
];

export function OnboardingTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const done = localStorage.getItem('xlumina_onboarding_done');
    if (!done) {
      const savedStep = localStorage.getItem('xlumina_onboarding_step');
      if (savedStep) setCurrentStep(Number(savedStep));
      setTimeout(() => setIsOpen(true), 1000);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(prev => prev + 1);
  };

  const handleSkip = () => {
    localStorage.setItem('xlumina_onboarding_done', 'true');
    setIsOpen(false);
  };

  const handleAction = (href: string) => {
    if (currentStep === STEPS.length - 1) {
      localStorage.setItem('xlumina_onboarding_done', 'true');
      setIsOpen(false);
    } else {
      localStorage.setItem('xlumina_onboarding_step', String(currentStep + 1));
      router.push(href);
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 20, border: '1px solid var(--border)',
        padding: 32, width: '100%', maxWidth: 420, margin: '0 16px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }}>
        {/* プログレスバー */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= currentStep ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* コンテンツ */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{step.emoji}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{step.title}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>{step.description}</p>
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSkip} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
          }}>スキップ</button>
          {step.action ? (
            <>
              <button onClick={handleNext} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
              }}>次へ →</button>
              <button onClick={() => handleAction(step.action!.href)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>{step.action.label}</button>
            </>
          ) : (
            <button onClick={handleNext} style={{
              flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>次へ →</button>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
          {currentStep + 1} / {STEPS.length}
        </p>
      </div>
    </div>
  );
}
