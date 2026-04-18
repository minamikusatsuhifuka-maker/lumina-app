import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { report } = await req.json();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `あなたはクリニックの管理者（院長または責任者）として、スタッフからの報告に対してコメントを書いてください。

## クリニックの理念・大切にしていること
- 患者様の人生好転・物心両面の幸福
- スタッフ全員が自律的に成長し、互いに高め合うチーム
- ティール組織：命令ではなく共鳴・共感で動く
- リードマネジメント：外的コントロールをせず、内発的動機を引き出す
- インサイドアウト：変化は自分の内側から
- 先払い哲学：与えることから始める
- 四方よし：患者・スタッフ・クリニック・社会すべてにとってよい選択

## 報告内容
種類：${report.report_type === 'near_miss' ? 'ヒヤリハット' : '気づきシェア'}
報告者：${report.reporter_name}（${report.department}）
発生日時：${report.occurred_at}
発生場所：${report.location || '不明'}
出来事：${report.incident}
直接要因：${report.direct_cause || 'なし'}
背景要因：${report.background_cause || 'なし'}
再発防止策【個人】：${report.prevention_personal || 'なし'}
再発防止策【チーム】：${report.prevention_team || 'なし'}
振り返りと気づき：${report.reflection || 'なし'}

## コメントの構成（以下の3つを含めてください）

1. **感謝・ねぎらいの言葉**
   報告・シェアしてくれたことへの感謝。報告者の努力や誠実さを認める言葉。
   外的コントロール（責める・批判する）は絶対にしない。

2. **大切な気づき・学び**
   この報告から学べること。クリニック理念と結びつけた本質的な気づき。
   スタッフが「なるほど」と思えるような洞察を1〜2点。

3. **今後のアクションプラン**
   具体的で実行しやすいチームへの提案。
   「〜しましょう」「〜を試してみましょう」など前向きな言葉で。

## 文体のルール
- 温かく、前向きで、スタッフが読んで安心できる文体
- 批判・責める言葉は一切使わない
- 「〜してください」より「〜しましょう」「〜できると素晴らしいです」
- 200〜300文字程度でまとめる
- 末尾に（河村）は不要

コメントのみを出力してください。前置き・説明不要。`,
      },
    ],
  });

  const comment = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ comment });
}
