import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel, type AIModel } from '@/lib/ai-client';
import { safeJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 120;

// テキスト校正の「検出」をサーバ側で実行（AI鍵をクライアントに出さない）。
// 本文に行番号を付与してAIへ渡し、JSON配列のみを返させる。
// 適用（置換）はAI不要のローカル処理なのでクライアント側で行う。

interface RawIssue {
  line?: number | string;
  type?: string;
  original?: string;
  suggestion?: string;
  reason?: string;
  scope?: string;
}

export interface DetectedIssue {
  line: number;
  type: string;
  original: string;
  suggestion: string;
  reason: string;
  scope: 'line' | 'all';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ error: '本文が空です' }, { status: 400 });
    }
    const model: AIModel = body.model === 'gemini' ? 'gemini' : 'claude';

    // 行番号付与（後段のローカル行指定置換に対応させるため）
    const numbered = text
      .split('\n')
      .map((l: string, i: number) => `${i + 1}: ${l}`)
      .join('\n');

    // 検出プロンプト（DermaPDF Pro の proofread-modal.tsx から流用）
    const prompt = `あなたは日本語の校正者です。以下の行番号付きテキストから、誤字・脱字・表記揺れ（送り仮名・漢字/かな・カタカナ・全角/半角・西暦/和暦などの不統一）を検出してください。
医療用語・固有名詞・意図的な表現は過剰に修正しないでください。
JSONのみを返してください（前置き・コードフェンス・説明は一切不要）。各要素は次の形式の配列:
{"line": 行番号(整数), "type": "誤字"|"脱字"|"表記揺れ", "original": "本文に現れる通りの完全一致の誤り部分", "suggestion": "修正後の文字列", "reason": "簡潔な理由", "scope": "line"|"all"}
- original は本文に出現する通りの完全一致で抜き出すこと（後段のローカル置換に使用するため厳守）。
- 表記揺れで全箇所を統一すべきものは scope を "all"、それ以外は "line"。
- 問題が無ければ [] を返す。

【行番号付きテキスト】
${numbered}`;

    const raw = await generateWithModel(model, prompt, undefined, 16000);

    // 配列部分だけを取り出して堅牢にパース
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : '[]';
    const arr = safeJsonParse<RawIssue[]>(slice, []);

    const issues: DetectedIssue[] = (Array.isArray(arr) ? arr : []).map((it) => ({
      line: Number(it.line) || 0,
      type: String(it.type || '修正'),
      original: String(it.original || ''),
      suggestion: String(it.suggestion || ''),
      reason: String(it.reason || ''),
      scope: it.scope === 'all' ? 'all' : 'line',
    }));

    return NextResponse.json({ success: true, issues });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[proofread/detect] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
