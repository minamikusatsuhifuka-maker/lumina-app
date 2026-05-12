import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type MemberData = Record<string, unknown> & {
  name?: string;
  role?: string | null;
  department?: string | null;
  current_level?: string | null;
  target_level?: string | null;
  notes?: string | null;
};

type ExtraData = Record<string, string | undefined>;

const GENERATORS: Record<string, (m: MemberData, e: ExtraData) => string> = {
  possibility: (member, extra) => `あなたは人の可能性を最大限に引き出す人材育成の専門家です。
アチーブメントの原理原則（7つの実・ゴール達成・選択理論心理学・インサイドアウト）を
基盤として、一人ひとりの固有の可能性を発見し、具体的な成長ストーリーを描きます。

【対象者情報】
名前: ${member.name ?? '未設定'}
役職: ${member.role ?? '未設定'}
部署: ${member.department ?? '未設定'}
現在のレベル: ${member.current_level ?? '未設定'}
目標レベル: ${member.target_level ?? '未設定'}
メモ: ${member.notes ?? 'なし'}
${extra?.interviewAnswers ? `\n【ヒアリング回答】\n${extra.interviewAnswers}` : ''}

【出力内容】
## 🌟 発見した強み・才能（5つ）
各強みを具体的なエピソードや行動パターンと結びつけて説明

## 💫 潜在的可能性
まだ発揮されていない隠れた才能・可能性

## 🗺 成長ロードマップ
### 3ヶ月後の姿
### 6ヶ月後の姿
### 1年後の姿

## 📚 推奨学習・経験
具体的なアクション・学習リソース

## 💬 本人への言葉
可能性を信じ、行動を促す温かいメッセージ

## 🎯 1on1で深掘りすべき質問（5問）`,

  roadmap: (member, extra) => `あなたは人材育成の専門家です。
以下の情報を元に、具体的で実現可能な成長ロードマップを作成してください。

【対象者】
${JSON.stringify(member, null, 2)}

【目標・背景】
${extra?.goalDescription ?? '未設定'}

【出力形式】
## 現在地の整理
強み・課題・リソースの棚卸し

## 成長ロードマップ

### Phase 1（1ヶ月目）：基盤づくり
- 目標
- 具体的行動（週次）
- マイルストーン
- 支援内容

### Phase 2（2〜3ヶ月目）：実践・挑戦
（同上）

### Phase 3（4〜6ヶ月目）：深化・拡張
（同上）

### Phase 4（7〜12ヶ月目）：自律・貢献
（同上）

## 評価・振り返りのポイント
## 上司・メンターの関わり方`,

  evaluation: (member, extra) => `あなたは公平で建設的な評価シートを作成する専門家です。
以下の情報を元に、${member.name ?? ''}さんの評価シートを作成してください。

【対象者情報】
${JSON.stringify(member, null, 2)}

【評価期間】${extra?.period ?? '今期'}

【評価軸（5軸・各25点満点）】
1. 理念体現・姿勢
2. 専門スキル・知識
3. 自己管理・目標達成
4. 学習継続・成長
5. チーム貢献・人間関係

【出力形式】
各評価軸について：
- 評価基準（4段階：改善必要/基準内/期待超/卓越）
- 具体的な観察ポイント（3〜5項目）
- 自己評価記入欄
- 上司評価記入欄
- コメント欄

最後に：
- 総合コメント欄
- 次期目標設定欄
- 署名欄`,

  one_on_one: (member, extra) => `あなたは1on1面談のファシリテーションの専門家です。
${member.name ?? ''}さんとの1on1面談を効果的に進めるためのアジェンダと質問集を作成してください。

【対象者情報】
${JSON.stringify(member, null, 2)}

【前回からの経緯】${extra?.previousNotes ?? 'なし'}
【今回のテーマ】${extra?.theme ?? '定期面談'}

【出力内容】

## 1on1の目的と心構え
選択理論心理学に基づく関わり方のポイント

## アジェンダ（60分想定）
- 00〜05分：アイスブレイク
- 05〜20分：近況・振り返り
- 20〜40分：メインテーマの対話
- 40〜55分：今後のアクション確認
- 55〜60分：クロージング

## 振り返り質問（過去）
相手の思考を引き出す質問（5問）

## 可能性・未来質問（未来）
ビジョンを描かせる質問（5問）

## 行動・コミットメント質問
具体的なアクションを決める質問（3問）

## 注意：使ってはいけない表現
批判・評価・アドバイスを避ける具体例

## 記録フォーマット
面談後に記録する項目`,

  skill_map: (member) => `あなたはスキルマップ設計の専門家です。
${member.role ?? ''}（${member.department ?? ''}）のスキルマップを作成してください。

【対象者情報】
${JSON.stringify(member, null, 2)}

【出力内容】

## スキルマップ概要
役職・部署に求められる能力の全体像

## スキル一覧（カテゴリ別）

### 1. 専門スキル
| スキル | 現在レベル | 目標レベル | 習得方法 |
|--------|-----------|-----------|---------|
（5〜8項目）

### 2. ビジネスマインド・姿勢
（同上）

### 3. コミュニケーション・チームワーク
（同上）

### 4. 自己成長・学習力
（同上）

## レベル定義
1: 基礎知識 / 2: 実践可能 / 3: 指導可能 / 4: 専門家

## 現在地と目標のギャップ分析
## 優先的に強化すべきスキルTop3`,
};

interface GenerateRequest {
  generateType: string;
  memberData: MemberData;
  extraData?: ExtraData;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { generateType, memberData, extraData } = body;

  const promptFn = GENERATORS[generateType];
  if (!promptFn) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '不明な生成タイプ' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const clinicPrompt = await getClinicSystemPrompt('hr', userId);
  // extraData.contextInfo に背景情報が入っているので分離して扱う
  const { contextInfo: extraContextInfo, ...extraDataRest } =
    (extraData ?? {}) as Record<string, string>;
  const basePrompt = promptFn(memberData ?? {}, extraDataRest);
  let fullPrompt = clinicPrompt
    ? basePrompt + `\n\n【クリニック・組織の背景情報】\n${clinicPrompt}`
    : basePrompt;
  if (extraContextInfo) {
    fullPrompt += `\n\n【参考背景情報】\n${extraContextInfo}`;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          stream: true,
          messages: [{ role: 'user', content: fullPrompt }],
        });
        let usageInput = 0;
        let usageOutput = 0;
        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`,
              ),
            );
          }
          if (event.type === 'message_start' && event.message?.usage) {
            usageInput = event.message.usage.input_tokens ?? 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            usageOutput = event.usage.output_tokens ?? 0;
          }
        }
        await trackUsage({
          userId,
          featureKey: 'hr',
          stepLabel: generateType,
          inputTokens: usageInput,
          outputTokens: usageOutput,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usageInput, output_tokens: usageOutput } })}\n\n`,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
