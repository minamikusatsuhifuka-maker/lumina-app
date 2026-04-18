import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { report, tone } = await req.json();

  const toneGuide: Record<string, string> = {
    lead: `
【リードマネジメント型】
- 外的コントロール（命令・批判・強制）は一切使わない
- スタッフの内発的動機・自律性を引き出す問いかけや言葉を使う
- 「どうしたいか？」「あなたはどう思う？」という主体性を促す表現
- 可能性・強み・成長に焦点を当てる
- 200〜280文字でまとめる`,

    praise: `
【労い・感謝・承認型】
- シェアしてくれたことへの深い感謝と労いを伝える
- このシェアがチーム全員の助けになっていることを具体的に伝える
- 報告者の勇気・誠実さ・チームへの貢献を温かく承認する
- 「あなたのおかげで」「あなたが伝えてくれたから」という言葉を使う
- 200〜280文字でまとめる`,

    growth: `
【成長・可能性引き出し型】
- このシェアが報告者自身の成長につながっていることを伝える
- 気づきを言語化することが自分の力になると伝える
- 周りへのポジティブな影響力・存在価値を伝える
- 「あなたが成長するとチームが変わる」という視点
- 将来の姿・可能性への期待を伝える
- 200〜280文字でまとめる`,

    team: `
【チーム・組織への影響型】
- このシェアがチーム全体の学びと安全につながると伝える
- 一人の気づきが組織全体を守ると伝える
- ティール組織的な「全員が主役・全員で守り合う」精神を表現
- 「あなたの声がチームの文化をつくる」という視点
- 心理的安全性の大切さを温かく伝える
- 200〜280文字でまとめる`,

    action: `
【理念・アクションプラン型】
- クリニックの理念（先払い哲学・四方よし・インサイドアウト）と結びつける
- 具体的で実行しやすい次のアクションを提案する
- 「〜しましょう」「〜を試してみましょう」など前向きな言葉で
- 大切な気づきを1点だけ深く掘り下げる
- 200〜280文字でまとめる`,
  };

  const selectedTone = toneGuide[tone ?? 'lead'];

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `あなたはクリニックの院長・管理者として、スタッフのシェアに対してコメントを書いてください。

## 大切にする哲学・理念
- リードマネジメント：外的コントロールをせず、内発的動機を引き出す
- インサイドアウト：変化は自分の内側から。自分が変われば周りが変わる
- 先払い哲学：与えることから始める。貢献が自分に返ってくる
- ティール組織：全員が主役・自律分散・共鳴で動く
- 四方よし：患者・スタッフ・クリニック・社会すべてにとって良い選択
- 7つの実：実行・実績・実力・実現・充実・誠実・結実
- 同心円モデル：中心（スタッフ）が変わることで外側（患者・社会）に広がる

## 絶対にしないこと
- 批判・責める・命令・評価する言葉
- 「〜すべき」「〜しなければ」という外的コントロール
- 上から目線・管理者目線

## スタッフのシェア内容
種類：${report.report_type === 'near_miss' ? 'ヒヤリハット' : '気づきシェア'}
報告者：${report.reporter_name}
内容：${report.incident}
${report.direct_cause ? `直接要因：${report.direct_cause}` : ''}
${report.prevention_personal ? `個人の改善策：${report.prevention_personal}` : ''}
${report.prevention_team ? `チームの改善策：${report.prevention_team}` : ''}
${report.reflection ? `振り返り：${report.reflection}` : ''}

## コメントのトーン
${selectedTone}

コメントのみを出力してください。前置き・説明・署名不要。`,
      },
    ],
  });

  const comment = message.content[0].type === 'text' ? message.content[0].text : '';
  return NextResponse.json({ comment });
}
