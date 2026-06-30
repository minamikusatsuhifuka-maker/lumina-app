import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { medicalAdCheckSection, AD_CHECK_OUTPUT_NOTE } from '@/lib/medical-ad-check';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GBP（Googleビジネスプロフィール）投稿の下書きをテーマ別に生成。
// 自動投稿はしない＝下書き→医療広告チェック併記→院長が確認して手動投稿。
// テーマは gbp_post_themes（院長編集可）から渡される。クリニック情報は背景資料から供給。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { themeLabel, themeDescription, details } = await req.json();
    const theme =
      [themeLabel, themeDescription].filter((s) => s && String(s).trim()).join('：') ||
      '季節に応じた皮膚トラブルの予防・受診の呼びかけ';

    // クリニック背景情報（背景資料）を owner スコープで供給。未設定なら空でフォールスルー。
    const clinicContext = await getClinicSystemPrompt('meo-post', owner);

    const prompt = `あなたは皮膚科クリニックの広報担当で、医療広告規制（医療法・医療広告ガイドライン／薬機法）にも精通しています。
南草津皮フ科クリニック（滋賀県）の Googleビジネスプロフィール（GBP）への投稿文案を3パターン作成し、各案に医療広告規制チェックを併記してください。
${clinicContext ? `\n${clinicContext}\n` : ''}
## 投稿テーマ
${theme}

## 補足情報（院長メモ。無ければ一般的な内容で）
${details && String(details).trim() ? String(details).trim() : '（特になし）'}

## 作成ルール
- GBP投稿向けに、丁寧で読みやすい日本語。1パターンあたり80〜150文字程度
- 来院・予約・電話などの自然な行動喚起を1つ含める（押し付けがましくしない）
- 患者個人の症状・体験談には触れない
- 3パターンは切り口・文体を変えて差別化する

${medicalAdCheckSection('投稿案')}

## 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{
  "drafts": [
    {
      "style": "パターン名",
      "text": "投稿本文（NG表現を含まないこと）",
      "ad_check": { "status": "ok", "findings": [] }
    }
  ]
}
${AD_CHECK_OUTPUT_NOTE}
- drafts は3件`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    });
    const resText = result.response.text();

    let parsed: { drafts?: Array<Record<string, unknown>> };
    try {
      parsed = robustJsonParse(resText);
    } catch {
      return NextResponse.json({
        drafts: [{ style: '標準', text: resText.slice(0, 400), ad_check: { status: 'ok', findings: [] } }],
      });
    }
    return NextResponse.json({ drafts: parsed.drafts || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-post-draft] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
