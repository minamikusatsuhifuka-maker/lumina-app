import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  // 既存のサンプルスタッフを削除（冪等性のため）
  const sampleNames = ['田中さくら', '山田あおい', '鈴木はると'];
  for (const name of sampleNames) {
    const existing = await sql`SELECT id FROM staff WHERE name = ${name}`;
    if (existing.length > 0) {
      const staffId = existing[0].id as string;
      await sql`DELETE FROM one_on_one_meetings WHERE staff_name = ${name}`;
      await sql`DELETE FROM staff_evaluations WHERE staff_name = ${name}`;
      await sql`DELETE FROM staff WHERE id = ${staffId}`;
    }
  }

  // ── スタッフ1：田中さくら（看護師 G3・データ豊富）──
  const id1 = uuidv4();
  await sql`
    INSERT INTO staff (id, name, name_kana, position, department, hired_at, status, memo)
    VALUES (
      ${id1}, '田中さくら', 'タナカサクラ', '看護師', '外来',
      '2021-04-01', 'active',
      'テスト用サンプルスタッフ。患者さんへの対応が丁寧で、後輩への指導も積極的。'
    )
  `;

  // 田中さくら：1on1 × 4件（成長ステージ変化あり）
  const meetings1 = [
    {
      date: '2024-06-15',
      goals: '接遇スキルの向上と後輩指導の方法を学ぶ',
      achievements: '患者さんからの感謝のお言葉をいただくことが増えた。先月比で患者満足度が上がった。',
      challenges: '忙しい時間帯に後輩へのフォローが追いつかないことがある',
      action_items: '週1回後輩との振り返りタイムを設ける',
      mindset_score: 7,
      motivation_level: 75,
      growth_stage: 'Lv2わかる',
    },
    {
      date: '2024-09-20',
      goals: 'チームのまとめ役として動けるようになる',
      achievements: '後輩2名への指導を自主的に行い、チームの連携が改善された',
      challenges: '自分の業務と指導の両立がまだ難しい',
      action_items: '指導マニュアルを1枚で作成して共有する',
      mindset_score: 8,
      motivation_level: 80,
      growth_stage: 'Lv3行う',
    },
    {
      date: '2025-01-10',
      goals: '等級G3としての役割を体現する',
      achievements: '新人研修の一部を担当。患者さんの不安を先読みした対応ができるようになった。',
      challenges: '自己成長の時間が取れていない',
      action_items: '月1冊は専門書を読む。院内勉強会に参加する',
      mindset_score: 8,
      motivation_level: 85,
      growth_stage: 'Lv3行う',
    },
    {
      date: '2025-04-05',
      goals: '強みを活かしてチーム全体を引き上げる存在になる',
      achievements: 'チームのシフト調整を自主的に改善し、業務効率が上がった。後輩の成長を心から喜べるようになった。',
      challenges: 'G4に向けてリーダーシップをもっと発揮したい',
      action_items: 'G4の昇格条件を確認して、自己評価シートを記入する',
      mindset_score: 9,
      motivation_level: 88,
      growth_stage: 'Lv4できる',
    },
  ];

  for (const m of meetings1) {
    const mid = uuidv4();
    await sql`
      INSERT INTO one_on_one_meetings (
        id, staff_name, staff_id, meeting_date,
        goals, achievements, challenges, action_items,
        mindset_score, motivation_level, growth_stage
      ) VALUES (
        ${mid}, '田中さくら', ${id1}, ${m.date},
        ${m.goals}, ${m.achievements}, ${m.challenges}, ${m.action_items},
        ${m.mindset_score}, ${m.motivation_level}, ${m.growth_stage}
      )
    `;
  }

  // 田中さくら：評価 × 2件
  const evalId1a = uuidv4();
  await sql`
    INSERT INTO staff_evaluations (
      id, staff_name, period, current_grade,
      knowledge_score, skill_score, mindset_score, total_score,
      recommended_grade, promotion_approved
    ) VALUES (
      ${evalId1a}, '田中さくら', '2024-Q4', '看護師 G3',
      22, 20, 42, 84,
      '看護師 G4', false
    )
  `;
  const evalId1b = uuidv4();
  await sql`
    INSERT INTO staff_evaluations (
      id, staff_name, period, current_grade,
      knowledge_score, skill_score, mindset_score, total_score,
      recommended_grade, promotion_approved
    ) VALUES (
      ${evalId1b}, '田中さくら', '2025-Q1', '看護師 G3',
      23, 22, 45, 90,
      '看護師 G4', false
    )
  `;

  // ── スタッフ2：山田あおい（医療事務 G2・1on1あり・評価未実施）──
  const id2 = uuidv4();
  await sql`
    INSERT INTO staff (id, name, name_kana, position, department, hired_at, status, memo)
    VALUES (
      ${id2}, '山田あおい', 'ヤマダアオイ', 'マルチタスク医療事務', '受付',
      '2023-01-15', 'active',
      'テスト用サンプルスタッフ。受付業務を素早く覚え、患者さんへの声かけが自然にできる。'
    )
  `;

  // 山田あおい：1on1 × 2件
  const meetings2 = [
    {
      date: '2024-11-10',
      goals: '業務の流れを完全に把握して一人でこなせるようになる',
      achievements: 'レセプト業務の基本ができるようになった。先輩に確認しなくても動けることが増えた。',
      challenges: 'イレギュラーな対応になると焦ってしまう',
      action_items: 'イレギュラー対応のパターンを書き出して整理する',
      mindset_score: 6,
      motivation_level: 70,
      growth_stage: 'Lv2わかる',
    },
    {
      date: '2025-02-20',
      goals: 'チームの一員として自分から動けるようになる',
      achievements: '混雑時間帯の業務分担を自分から提案できた。患者さんからお名前を覚えてもらえた。',
      challenges: '他の職種のスタッフとのコミュニケーションをもっと取りたい',
      action_items: '朝礼で一言発言することを意識する',
      mindset_score: 7,
      motivation_level: 75,
      growth_stage: 'Lv3行う',
    },
  ];

  for (const m of meetings2) {
    const mid = uuidv4();
    await sql`
      INSERT INTO one_on_one_meetings (
        id, staff_name, staff_id, meeting_date,
        goals, achievements, challenges, action_items,
        mindset_score, motivation_level, growth_stage
      ) VALUES (
        ${mid}, '山田あおい', ${id2}, ${m.date},
        ${m.goals}, ${m.achievements}, ${m.challenges}, ${m.action_items},
        ${m.mindset_score}, ${m.motivation_level}, ${m.growth_stage}
      )
    `;
  }

  // ── スタッフ3：鈴木はると（看護師 G1・入職3ヶ月・データ最小限）──
  const id3 = uuidv4();
  await sql`
    INSERT INTO staff (id, name, name_kana, position, department, hired_at, status, memo)
    VALUES (
      ${id3}, '鈴木はると', 'スズキハルト', '看護師', '外来',
      '2025-01-06', 'active',
      'テスト用サンプルスタッフ。新卒入職3ヶ月目。素直で吸収が早い。'
    )
  `;

  // 鈴木はると：1on1 × 1件
  const mid3 = uuidv4();
  await sql`
    INSERT INTO one_on_one_meetings (
      id, staff_name, staff_id, meeting_date,
      goals, achievements, challenges, action_items,
      mindset_score, motivation_level, growth_stage
    ) VALUES (
      ${mid3}, '鈴木はると', ${id3}, '2025-04-01',
      'クリニックの業務の流れを覚える',
      '基本的な採血・バイタル測定が一人でできるようになった',
      '先輩に質問するタイミングがまだ掴めていない',
      '毎日終業前に「今日わからなかったこと」を1つメモして翌日確認する',
      5, 65, 'Lv1知る'
    )
  `;

  return NextResponse.json({
    success: true,
    message: 'サンプルスタッフ3名を投入しました',
    staff: [
      { name: '田中さくら', id: id1, note: '看護師G3・1on1×4件・評価×2件' },
      { name: '山田あおい', id: id2, note: '医療事務G2・1on1×2件・評価未実施' },
      { name: '鈴木はると', id: id3, note: '看護師G1・1on1×1件・入職3ヶ月' },
    ],
  });
}
