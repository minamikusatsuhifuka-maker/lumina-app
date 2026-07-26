import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM } from '@/lib/ai-models';
import { HP_WRITING_DESIGN, HP_AD_PROHIBITED } from '@/lib/hp-writing';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 185①: HP掲載用のブログ記事生成。
// - HP掲載＝患者が読む公開情報。執筆設計・禁止事項は184の hp-writing.ts を流用（一元管理）
// - 医療広告チェックはクライアント側が生成完了後に /api/hp-guard で必ず実行（184と同じ人間承認型）
// - 出力は Markdown 1本。記事の保存は既存の library（SaveToLibraryButton type='hp-blog'）＝新テーブルなし

type Length = 'short' | 'medium' | 'long';
const LENGTH_CONFIG: Record<Length, { label: string; chars: string }> = {
  short: { label: '短め', chars: '1000〜1800字' },
  medium: { label: '標準', chars: '2000〜3000字' },
  long: { label: '長め', chars: '3500〜5000字' },
};

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
    if (!theme) {
      return NextResponse.json({ error: 'テーマを入力してください' }, { status: 400 });
    }
    const target = typeof body.target === 'string' ? body.target.trim() : '';
    const tone = typeof body.tone === 'string' ? body.tone.trim() : '';
    const contextInfo = typeof body.contextInfo === 'string' ? body.contextInfo : '';
    const length: Length =
      body.length === 'short' || body.length === 'long' ? body.length : 'medium';
    const aiModel = body.model === 'gemini' ? 'gemini' : 'claude';
    const config = LENGTH_CONFIG[length];

    const system = `あなたは医療クリニックのホームページに掲載するブログ記事を執筆するプロのライターです。患者さんが読む公開情報として、正確・誠実で読みやすい記事を書きます。

${HP_WRITING_DESIGN}

${HP_AD_PROHIBITED}`;

    const prompt = `以下の条件でクリニックのホームページに掲載するブログ記事を執筆してください。

# テーマ
${theme}
${target ? `\n# 読者（ターゲット）\n${target}\n` : ''}${tone ? `\n# トーン・文体\n${tone}\n` : ''}
# 記事の長さ
${config.label}（${config.chars}）
${contextInfo ? `\n# 参考背景情報（記事の根拠として使う。ここに無い数値・研究名を新たに作らない）\n${contextInfo}\n` : ''}
# 記事の構成
- 導入: 読者の不安・疑問を先に言語化して安心させてから本題へ
- 本論: 見出し（## / ###）で構造化。具体（症状・場面）→ 説明 → 次の一歩の順
- 結び: 事実ベースの「次の一歩」を1つだけ（受診の強制・煽りはしない）

# 出力形式
- Markdown 形式（先頭に # タイトルを置く。前置き・コードフェンス不要）
- ${config.chars} の範囲内で、必ず最後まで書ききる（プレースホルダ禁止）`;

    // 記事本文＝品質優先で medium を明示（claude時は geminiGenerationConfig は無視される）
    const content = await generateWithModel(aiModel, prompt, system, 10000, GEMINI_TEXT_THINKING_MEDIUM);
    if (!content || !content.trim()) {
      return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }

    return NextResponse.json({ success: true, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[hp-blog]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
