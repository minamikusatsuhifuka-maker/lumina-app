import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const maxDuration = 120;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const DOMAIN_LABELS: Record<string, string> = {
  all: '全体自動化戦略',
  agent: 'AIエージェント化',
  saas: '外部SaaS連携',
  creative: 'クリエイティブ自動化',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session?.user as any)?.id;
  const { sessionId } = await req.json();

  const [s] = await sql`
    SELECT * FROM automation_sessions
    WHERE id = ${sessionId} AND user_id = ${userId}
  `;
  if (!s) return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });

  const messages: any[] = s.messages ?? [];
  if (messages.length < 2) {
    return NextResponse.json({ error: '対話が少なすぎます' }, { status: 400 });
  }

  const conversationText = messages
    .map((m: any) => `**${m.role === 'user' ? '👤 ユーザー' : '🤖 AI'}**\n${m.content}`)
    .join('\n\n---\n\n');

  const domainLabel = DOMAIN_LABELS[s.domain] ?? '自動化戦略';

  const prompt = `あなたは自動化戦略の専門家です。
以下の対話セッションを分析して、構造化された対話レポートを作成してください。

## 対話テーマ
${domainLabel}

## 対話内容（${messages.length}メッセージ）
${conversationText}

---

## レポートの形式

# 📊 自動化戦略 対話レポート
**テーマ：** ${domainLabel}
**対話数：** ${Math.floor(messages.length / 2)}往復
**生成日：** ${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}

---

## 🎯 対話の目的・背景
（ユーザーが何を実現したかったか、現状の課題）

## 💡 主要な発見・気づき
（対話を通じて明らかになった重要な洞察を箇条書きで5〜8点）

## 🏗 議論した自動化アプローチ
（検討したアプローチ・技術・ツールをまとめる）

### 採用を検討したアプローチ
| アプローチ | メリット | デメリット | 優先度 |
|-----------|---------|-----------|--------|

## ⚡ 自動化の期待効果
- 削減できる作業時間：週XX時間
- 自動化率：XX%
- コスト削減/収益増加の見込み：¥X,XXX/月

## 🚦 推奨アクション（優先順位順）
1. **【今すぐ】** ...
2. **【1週間以内】** ...
3. **【1ヶ月以内】** ...
4. **【3ヶ月以内】** ...

## ⚠️ 注意点・リスク
（対話で出てきた懸念事項・対策）

## 📚 参考リソース・次のステップ
（学ぶべきこと・試すべきツール・読むべき情報）

## 💬 印象に残った対話
（特に重要だった質問と回答を1〜2セット抜粋）

---

*このレポートはxLUMINA 自動化戦略AIコンサルタントとの対話から自動生成されました*`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const reportText = response.content[0].type === 'text' ? response.content[0].text : '';

    await sql`
      UPDATE automation_sessions SET
        report_output = ${reportText},
        report_generated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${sessionId} AND user_id = ${userId}
    `;

    await trackUsage({
      userId,
      featureKey: 'automation',
      stepLabel: '対話レポート生成',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {});

    return NextResponse.json({ report: reportText });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
