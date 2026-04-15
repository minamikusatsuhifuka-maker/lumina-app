import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text, imageBase64 } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  type ContentBlock =
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'text'; text: string };

  const content: ContentBlock[] = [];
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
    });
  }
  content.push({
    type: 'text',
    text: `以下のテキスト・画像から、スタッフの入社・登録情報を読み取って整理してください。

${text ? `テキスト：\n${text}` : ''}

以下の情報を抽出できれば抽出してください（不明な項目はnullにする）：
- staff_name: スタッフ名
- email: メールアドレス
- phone: 電話番号
- emergency_contact: 緊急連絡先
- chatwork_registered: Chatwork登録済み（true/false/null）
- freee_registered: freee登録済み（true/false/null）
- qliolock_registered: Qlio Lock登録済み（true/false/null）
- attendance_card_handed: 勤怠カード手渡し済み（true/false/null）
- security_card_handed: セキュリティカード手渡し済み（true/false/null）
- key_type: 鍵の種類（例：「玄関鍵・裏口鍵」など）
- key_handed: 鍵の手渡し済み（true/false/null）
- tax_accountant_submitted: 税理士提出済み（true/false/null）
- labor_consultant_submitted: 社労士提出済み（true/false/null）
- todos: 入社手続きTODOのリスト（文字列の配列）
- trainings: 研修受講済みのリスト（文字列の配列）
- ai_summary: 全体のまとめ（2〜3文）
- notes: その他気になるメモ

必ずJSON形式のみで返してください（説明不要）：
{
  "staff_name": null,
  "email": null,
  ...
}`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content }],
    }),
  });

  const data = await response.json();
  const raw = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: '解析に失敗しました', raw });
  }
}
