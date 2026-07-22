// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 医療広告規制チェック 共通モジュール（医療法・医療広告ガイドライン／薬機法）
// 145 の口コミ返信AI（reviews/reply-draft）で実装した NG 文言＋ad_check 出力仕様を集約。
// reply-draft の挙動を変えないため、各文字列は従来プロンプトと同一テキストを保持する。
// MEO の投稿下書き（147B）など、生成系から流用する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GEMINI_TEXT_MODEL } from '@/lib/ai-models';

// 生成物1件ごとに併記する医療広告チェック結果
export interface AdCheck {
  status: 'ok' | 'warn';
  findings: string[];
}

// プロンプトに差し込む NG 表現の列挙（reply-draft と完全同一の文言）
export const MEDICAL_AD_NG_RULES = `- 効果・効能の保証（「必ず治る」「絶対」「効果を保証」等）
- 誇大・最上級（「日本一」「最高」「No.1」根拠なし）
- ビフォーアフターや他患者の体験談的表現の誘導
- 割引・キャンペーンなどの利益誘導
- 未承認・自由診療の不適切な効果訴求`;

// 「## 医療広告規制チェック（必須）…」セクションを生成。
// subjectNoun を変えるだけで返信案／投稿案など対象に合わせられる。
// subjectNoun='返信案' のとき reply-draft の従来テキストと一致する。
export function medicalAdCheckSection(subjectNoun: string): string {
  return `## 医療広告規制チェック（必須）— 以下に該当する表現は使わない
${MEDICAL_AD_NG_RULES}
各${subjectNoun}について、上記NG表現が含まれないか自己チェックし、結果（status と findings）を返す。`;
}

// 出力フォーマット末尾に置く ad_check の説明（reply-draft と完全同一の文言）
export const AD_CHECK_OUTPUT_NOTE = `- ad_check.status: NG表現が無ければ "ok"、懸念があれば "warn"
- ad_check.findings: warn の場合に該当箇所と理由を簡潔に列挙（ok なら空配列）`;

// 生成済みテキストを後段でチェックする実行関数（記事生成・競合提案などから流用）。
// Gemini で判定し AdCheck を返す。失敗時は安全側の ok（findings空）でフォールスルー。
export async function checkMedicalAd(text: string): Promise<AdCheck> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text?.trim()) return { status: 'ok', findings: [] };
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { robustJsonParse } = await import('@/lib/ai-json-parser');
    const prompt = `あなたは医療広告規制（医療法・医療広告ガイドライン／薬機法）に精通した校正者です。
次の文章に医療広告規制上のNG表現が含まれないか確認してください。

## 対象文章
${text.slice(0, 8000)}

## NG表現（該当があれば findings に簡潔に指摘）
${MEDICAL_AD_NG_RULES}

## 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "status": "ok", "findings": [] }
${AD_CHECK_OUTPUT_NOTE}`;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_TEXT_MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // 3.6 Flashは思考既定medium（1000前後）が枠を消費するため2048→4096に拡大
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    });
    const parsed = robustJsonParse(result.response.text()) as { status?: string; findings?: unknown };
    const status = parsed.status === 'warn' ? 'warn' : 'ok';
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map((f) => String(f)) : [];
    return { status, findings };
  } catch {
    return { status: 'ok', findings: [] };
  }
}
