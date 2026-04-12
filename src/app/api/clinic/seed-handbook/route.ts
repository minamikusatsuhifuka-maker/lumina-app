import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  // 既存のサンプルを削除（冪等性のため）
  const existing = await sql`SELECT id FROM handbooks WHERE title = '【テスト用】南草津皮フ科 スタッフハンドブック'`;
  if (existing.length > 0) {
    await sql`DELETE FROM handbook_chapters WHERE handbook_id = ${existing[0].id as string}`;
    await sql`DELETE FROM handbooks WHERE id = ${existing[0].id as string}`;
  }

  // ハンドブック作成
  const handbookId = uuidv4();
  await sql`
    INSERT INTO handbooks (id, title, description, status)
    VALUES (
      ${handbookId},
      '【テスト用】南草津皮フ科 スタッフハンドブック',
      'AI改善機能のテスト用サンプルハンドブックです。ボスマネ表現・命令型の文章を意図的に含んでいます。',
      'draft'
    )
  `;

  // 章を投入
  const chapters = [
    {
      orderIndex: 0,
      title: 'はじめに',
      content: `このハンドブックは、南草津皮フ科で働くスタッフが守るべきルールと行動基準を定めたものです。
全スタッフは必ずこのハンドブックを熟読し、内容を理解した上で業務を行ってください。
ルールを守れない場合は、指導・注意の対象となります。

クリニックの理念：患者様に最高の医療を提供し、地域医療に貢献する。
スタッフは院長の指示に従い、チームとして業務を遂行しなければなりません。

クリニックは人材育成に力を入れており、定期的な研修への参加を義務付けています。
欠席する場合は必ず事前に届け出を行うこと。無断欠席は厳禁です。`
    },
    {
      orderIndex: 1,
      title: '患者様への対応マニュアル',
      content: `患者様への対応は、以下のルールを必ず守ること。

1. 患者様が来院したら、必ず3秒以内に「いらっしゃいませ」と声をかけること。
2. 待ち時間が15分を超えた場合は、必ずお声がけをすること。怠った場合はクレームの原因となるため注意すること。
3. 患者様のプライバシーに関わる情報を漏らすことは禁止されています。違反した場合は懲戒の対象となります。
4. 接遇マナーの研修を年2回受講すること。受講しなかったスタッフには評価に影響があります。
5. クレームが発生した場合は、直ちに上長に報告すること。自己判断での対応は禁止します。

患者満足度向上のため、スタッフ全員が同じ水準のサービスを提供することが求められます。`
    },
    {
      orderIndex: 2,
      title: 'チームワークと報告・連絡・相談',
      content: `チームとして業務を行うために、以下のことを徹底してください。

報告・連絡・相談（ほうれんそう）は社会人として当然の義務です。
何か問題が発生した場合は、隠蔽せず必ず上長に報告しなければなりません。
報告が遅れた場合や隠蔽が発覚した場合は、厳重に対処します。

シフトの変更は、最低2週間前までに申し出ること。
急な欠勤は他のスタッフに迷惑をかける行為であるため、やむを得ない場合を除き認めません。

チームの和を乱す行為は厳禁です。
スタッフ間のトラブルは速やかに管理職へ報告し、指示を仰いでください。
自己判断での解決は認めません。`
    },
    {
      orderIndex: 3,
      title: '成長と評価について',
      content: `当クリニックでは、スタッフの成長を管理・評価するために以下の制度を設けています。

評価制度：
- 年2回の評価面談を実施します。評価結果によって給与・等級が決定されます。
- 目標を達成できなかった場合は、その理由を報告書として提出しなければなりません。
- 評価が一定基準を下回った場合は、改善計画書の提出と指導の対象となります。

研修制度：
- 指定された研修は全員参加が義務です。
- 自己学習が不十分なスタッフは、追加研修の受講を命じる場合があります。
- 資格取得については、クリニックが定めた期限内に取得すること。

キャリアアップ：
- 昇格するためには、院長が定めた条件を全てクリアしなければなりません。
- 自己申告での昇格希望は認めません。院長の判断によって昇格が決定されます。`
    },
  ];

  for (const ch of chapters) {
    const chId = uuidv4();
    await sql`
      INSERT INTO handbook_chapters (id, handbook_id, order_index, title, content)
      VALUES (${chId}, ${handbookId}, ${ch.orderIndex}, ${ch.title}, ${ch.content})
    `;
  }

  return NextResponse.json({
    success: true,
    handbookId,
    message: 'テスト用ハンドブックを投入しました（4章）',
    url: `/admin/handbook/${handbookId}`,
    chapters: chapters.map(c => c.title),
  });
}
