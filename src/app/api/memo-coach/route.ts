import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MINIMAL } from '@/lib/ai-models';

export const runtime = 'nodejs';

// AIメモ Phase3: 第2象限フォーカス時の短文コーチング。
// 院長の理念(アチーブメント/選択理論=インサイドアウト・同心円・代価の先払い)のトーンで
// 1〜2文・押し付けない。既存Geminiを流用し、新キー不要。AI失敗時は空で返しUIは非表示。

// トーンの調整用(説教臭くしない・短く・前向き)
const TONE_GUIDE = [
  '相手を評価・説教しない。背中をそっと押す一言にする。',
  'インサイドアウト(自分の内側=目標起点)・同心円(影響の輪)・代価の先払い(重要だが緊急でないことに先に時間を払う)の発想を、専門用語を出しすぎず自然に滲ませる。',
  '1〜2文。40〜80字程度。前向きで具体。',
].join('\n');

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 200) : '';
  const goal = typeof body.goal === 'string' ? body.goal.slice(0, 200) : '';
  if (!summary) return NextResponse.json({ message: '' });

  const prompt = `あなたは「第2象限(重要×非緊急)に意図的に時間を投資する」ことを後押しするコーチです。
# トーン
${TONE_GUIDE}

# 対象のタスク/メモ
${summary}
${goal ? `\n# これが寄与する目標\n${goal}` : ''}

上記について、第2象限への先払い投資を後押しする短いコーチングを1〜2文だけ返してください。前置き・引用符・絵文字・箇条書きは付けず、本文だけを返すこと。`;

  try {
    // 枠256は思考トークンで溢れるため minimal（機械的な短文生成・thoughts=0）
    const raw = await generateWithModel('gemini', prompt, undefined, 256, GEMINI_TEXT_THINKING_MINIMAL);
    const message = (raw || '').trim().replace(/^["「『]|["」』]$/g, '').slice(0, 160);
    return NextResponse.json({ message });
  } catch {
    // 失敗時は非表示(フォールバック)
    return NextResponse.json({ message: '' });
  }
}
