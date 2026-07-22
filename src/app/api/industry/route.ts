import { NextRequest, NextResponse } from 'next/server';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM } from '@/lib/ai-models';
import type { AIModel } from '@/lib/ai-client';
import { requireAuth } from '@/lib/require-auth';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { industry, model = 'claude' }: { industry: string; model?: AIModel } = await req.json();

  const prompt = `「${industry}」業界について、最新の情報を調査して包括的な業界レポートを作成してください。

## 📊 業界概要
- 市場規模（日本・世界）
- 成長率・CAGR
- 業界の定義と範囲

## 📈 市場トレンド（2025〜2026年最新）
- 主要トレンド3〜5点
- 技術革新・DX動向
- 規制・法律の変化

## 🏆 主要プレイヤー
- 国内トップ5社（シェア・特徴）
- 海外主要プレイヤー
- 注目のスタートアップ

## 💰 ビジネスモデル分析
- 主な収益モデル
- バリューチェーン
- 利益率の特徴

## 🎯 参入機会・ホワイトスペース
- 未開拓市場
- 新規参入のチャンス
- 差別化のポイント

## ⚠️ リスク・課題
- 業界固有のリスク
- 競合激化の懸念
- 規制リスク

## 🔮 今後の展望（3〜5年）
- 市場予測
- ゲームチェンジャーとなりうる変化
- 推奨アクション

必ず全セクションを最後まで完全に出力してください。途中で途切れないようにしてください。`;

  // Claudeの場合はweb_search対応のため直接API呼び出し
  if (model === 'claude') {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    return NextResponse.json({ result });
  }

  // Gemini
  // 長文リサーチ＝品質優先で medium を明示（枠16000で空出力リスクなし。claude時は無視される）
  const result = await generateWithModel(model, prompt, 'あなたは優秀なリサーチアナリストです。日本語で詳しくまとめてください。', 16000, GEMINI_TEXT_THINKING_MEDIUM);
  return NextResponse.json({ result });
}
