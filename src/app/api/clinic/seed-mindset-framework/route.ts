import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  const items = [
    // 💎 自己愛
    { gradeLevel: 1, coreValue: 'self_love', stageDescription: '自分の体・心・生活を大切にし、働く自分を責めず整えている', behavioralIndicators: JSON.stringify(['体調管理を自分の責任として行っている', '疲れた時に無理をせず適切に休息を取れる', '自分を否定せず、失敗を学びとして受け取れる']), growthActions: JSON.stringify(['毎日の体調を記録する習慣をつくる', '「今日の自分を労う」一言を日記に書く']) },
    { gradeLevel: 2, coreValue: 'self_love', stageDescription: '自分の強みと弱みを受け入れ、ありのままの自分で仲間と関われる', behavioralIndicators: JSON.stringify(['苦手なことを素直に仲間に打ち明けられる', '自分の強みを言語化して伝えられる', '比較せず自分のペースで成長できる']), growthActions: JSON.stringify(['強みリストを作り定期的に更新する', '仲間に「お願いします」と言える場面を増やす']) },
    { gradeLevel: 3, coreValue: 'self_love', stageDescription: '自分の軸（価値観・使命）を言語化でき、ブレずに行動できる', behavioralIndicators: JSON.stringify(['自分の価値観を3つ以上言葉にできる', 'プレッシャー下でも自分らしい判断ができる', '自己評価と他者評価のズレを把握している']), growthActions: JSON.stringify(['パーソナルミッションを文章にする', '月1回、自分の軸を振り返るセルフ1on1を行う']) },
    { gradeLevel: 4, coreValue: 'self_love', stageDescription: '自己犠牲なく患者さんと関われる。満たされた自分から先払いできる', behavioralIndicators: JSON.stringify(['自分が満たされている状態で患者さんに関われる', '燃え尽きることなく高い状態を継続できる', '感謝を受け取ることも自然にできる']), growthActions: JSON.stringify(['自己充電の時間を意図的にスケジュールする', '「先払いできた場面」を記録し振り返る']) },
    { gradeLevel: 5, coreValue: 'self_love', stageDescription: '自分の存在価値を確信し、それを言葉と行動で体現し続けている', behavioralIndicators: JSON.stringify(['自分の存在がチームと患者さんに与える影響を語れる', '揺れることなく自己肯定感を保ち続けられる', 'ロールモデルとして自己愛を体現している']), growthActions: JSON.stringify(['後輩に自己愛の大切さを語る機会を持つ', '年1回、自分の存在意義を書き直す']) },
    // 🎯 セルフマネジメント
    { gradeLevel: 1, coreValue: 'self_management', stageDescription: '時間・感情・行動の基本を守れる。遅刻・無断欠勤がない', behavioralIndicators: JSON.stringify(['時間通りに出勤し準備が整っている', '感情的にならず丁寧な言葉で話せる', '指示された業務を期限内に完了できる']), growthActions: JSON.stringify(['前日夜に翌日の準備を整える習慣をつくる', '感情が乱れた時の対処法を一つ決めておく']) },
    { gradeLevel: 2, coreValue: 'self_management', stageDescription: '優先順位をつけて動ける。感情的にならず丁寧に対応できる', behavioralIndicators: JSON.stringify(['複数業務の優先度を自分で判断して動ける', '忙しい時でも患者さんへの対応の質を保てる', 'ストレスを適切に発散・処理できる']), growthActions: JSON.stringify(['毎朝タスクに優先度をつける習慣をつくる', 'ストレスログをつけてパターンを把握する']) },
    { gradeLevel: 3, coreValue: 'self_management', stageDescription: '自分の状態を客観視し、ストレスを適切に処理しながら高パフォーマンスを維持する', behavioralIndicators: JSON.stringify(['自分のコンディションを数値化して把握している', '高ストレス下でも冷静に判断できる', 'チームに自分の状態を適切に伝えられる']), growthActions: JSON.stringify(['週次でコンディションを自己採点する', 'ピークパフォーマンスの条件を言語化する']) },
    { gradeLevel: 4, coreValue: 'self_management', stageDescription: 'チーム全体の状態を把握しながら自分を律し、模範の行動を継続できる', behavioralIndicators: JSON.stringify(['チームメンバーの状態変化に気づける', '自分が見られていることを意識して行動できる', '長期間にわたり高い状態を維持できる']), growthActions: JSON.stringify(['チームの状態を週次でチェックする', '自分の行動が与える影響を意識的に観察する']) },
    { gradeLevel: 5, coreValue: 'self_management', stageDescription: 'どんな状況でも自律し、チームの安心の軸として機能する', behavioralIndicators: JSON.stringify(['危機的状況でも冷静さを保ちチームを安定させられる', '自律した行動でチームの規範を創り出している', '管理なしに最高の状態を継続できる']), growthActions: JSON.stringify(['困難な状況を振り返り自己管理の精度を高める', 'チームが自律できる環境づくりに貢献する']) },
    // 🌱 自己成長
    { gradeLevel: 1, coreValue: 'self_growth', stageDescription: '知らないことを素直に認め、聞ける。学ぶ姿勢が言動に現れている', behavioralIndicators: JSON.stringify(['わからないことをすぐに質問できる', '1on1や研修で素直に吸収しようとしている', '失敗を隠さず報告し、そこから学べる']), growthActions: JSON.stringify(['毎日一つ「今日学んだこと」をメモする', '先輩に質問した数を週次で振り返る']) },
    { gradeLevel: 2, coreValue: 'self_growth', stageDescription: '業務外でも自主的に学び、学んだことをチームにアウトプットできる', behavioralIndicators: JSON.stringify(['自主的に本・研修・情報収集を行っている', '学んだことを朝礼や共有の場で伝えられる', '学習計画を自分で立て実行できる']), growthActions: JSON.stringify(['月1冊以上、専門書または自己啓発書を読む', 'チームへの学びシェアを月1回以上行う']) },
    { gradeLevel: 3, coreValue: 'self_growth', stageDescription: '専門性を深め、他者に教えられるレベルに達している', behavioralIndicators: JSON.stringify(['自分の専門領域で後輩から頼られる存在になっている', '教えることで自分の理解も深まっている', '専門知識をわかりやすく説明できる']), growthActions: JSON.stringify(['専門分野の勉強会・学会に参加する', '後輩への指導記録をつけ改善する']) },
    { gradeLevel: 4, coreValue: 'self_growth', stageDescription: '自分の成長がチームと患者さんの成果につながっている実績がある', behavioralIndicators: JSON.stringify(['自分の成長が数字・事実として患者満足度に現れている', 'チームのスキルアップに直接貢献している', '成長の連鎖を自分から生み出せている']), growthActions: JSON.stringify(['自分の成長とチーム成果の相関を記録する', '年間成長計画をチームと共有して実行する']) },
    { gradeLevel: 5, coreValue: 'self_growth', stageDescription: '自己成長を通じて業界の水準を引き上げる存在になっている', behavioralIndicators: JSON.stringify(['クリニック外でも評価される専門性を持っている', '業界の最新情報を取り込みチームに還元している', '自分の成長が業界水準を動かし始めている']), growthActions: JSON.stringify(['業界の発信・登壇・執筆に挑戦する', '次世代の育成を自分の使命として取り組む']) },
    // 👨‍👩‍👧 身近な人を豊かに
    { gradeLevel: 1, coreValue: 'enrich_others', stageDescription: 'チームの一員として挨拶・感謝・報連相が自然にできる', behavioralIndicators: JSON.stringify(['毎日全員に挨拶ができる', '感謝の言葉を自然に言える', '報連相を適切なタイミングで行える']), growthActions: JSON.stringify(['今日感謝した人を一人名前で記録する', '報連相のタイミングを意識して記録する']) },
    { gradeLevel: 2, coreValue: 'enrich_others', stageDescription: '後輩や同僚の困りごとに気づき、声をかけて手を貸せる', behavioralIndicators: JSON.stringify(['困っている仲間に自分から声をかけられる', '頼まれる前に気づいてサポートできる', 'チームの雰囲気を明るくする言動ができる']), growthActions: JSON.stringify(['一日一回、誰かの困りごとに気づいて声をかける', 'チームの空気を変えた場面を記録する']) },
    { gradeLevel: 3, coreValue: 'enrich_others', stageDescription: 'チームの成長を自分の喜びとして関われる。育てる場面が増えている', behavioralIndicators: JSON.stringify(['後輩の成功を心から喜べる', '教えることに時間を惜しまずに関われる', '「育てたい」という意欲が言動に現れている']), growthActions: JSON.stringify(['後輩の成長を記録して本人に伝える', '月1回、育成について振り返る時間を持つ']) },
    { gradeLevel: 4, coreValue: 'enrich_others', stageDescription: '患者さんの人生に寄り添い「来てよかった」と言われる関わりができる', behavioralIndicators: JSON.stringify(['患者さんから感謝の言葉・メッセージをもらっている', '一人ひとりの背景を大切にした関わりができる', '患者さんの人生全体を視野に入れた対応ができる']), growthActions: JSON.stringify(['患者さんからの言葉を記録して振り返る', '「この患者さんの人生にどう貢献できるか」を考える習慣']) },
    { gradeLevel: 5, coreValue: 'enrich_others', stageDescription: 'チーム・患者・家族全員が豊かになる環境をデザインできる', behavioralIndicators: JSON.stringify(['チーム全体の幸福度を高める働きかけができる', '患者さんの家族も含めたケアの視点がある', '豊かさの連鎖を意図してデザインできる']), growthActions: JSON.stringify(['チーム全体の充実度を定期的に測定する', '「豊かさの連鎖」の事例を積み重ねて語れるようにする']) },
    // 🌍 社会貢献
    { gradeLevel: 1, coreValue: 'social_contribution', stageDescription: '患者さんへの対応が「地域医療の一端」であることを理解している', behavioralIndicators: JSON.stringify(['自分の仕事が地域の人々の健康を支えていると語れる', '一つひとつの対応を誠実に行う意識がある', 'クリニックの存在意義を自分の言葉で説明できる']), growthActions: JSON.stringify(['クリニックのミッションを自分の言葉で書いてみる', '患者さんの人生背景を想像しながら接する']) },
    { gradeLevel: 2, coreValue: 'social_contribution', stageDescription: '自分の仕事が社会につながっていることを語れる', behavioralIndicators: JSON.stringify(['日々の仕事と社会貢献のつながりを具体的に語れる', '地域の医療課題に関心を持って情報収集している', 'クリニックの社会的役割を誇りに感じている']), growthActions: JSON.stringify(['地域医療のニュースや情報を月1回収集する', 'チームで「私たちの社会貢献」を語り合う場を提案する']) },
    { gradeLevel: 3, coreValue: 'social_contribution', stageDescription: 'クリニックの理念を体現し、地域から信頼される存在になっている', behavioralIndicators: JSON.stringify(['患者さん・地域の方から名指しで信頼される', 'クリニックの評判向上に具体的に貢献している', '理念を体現した行動が日常的に観察できる']), growthActions: JSON.stringify(['患者満足度・口コミに自分がどう影響しているか把握する', '理念を体現した行動を月1回振り返る']) },
    { gradeLevel: 4, coreValue: 'social_contribution', stageDescription: 'クリニックを超えた社会的価値を意識した行動・発信ができる', behavioralIndicators: JSON.stringify(['クリニック外の活動（勉強会・地域活動）に参加している', '自分の専門性で地域に貢献できる場面がある', 'クリニックの社会的価値を外に向けて発信できる']), growthActions: JSON.stringify(['地域の医療・健康イベントに年1回以上参加する', '自分の専門性で地域貢献できることを考え実行する']) },
    { gradeLevel: 5, coreValue: 'social_contribution', stageDescription: '地域・業界に対してクリニックの哲学を広げるアンバサダーとして機能する', behavioralIndicators: JSON.stringify(['クリニック外でもクリニックの哲学を体現している', '業界や地域に対して影響力ある発信ができている', '「南草津皮フ科」の名前が地域・業界で語られている']), growthActions: JSON.stringify(['年1回、クリニックの哲学を外部に発信する機会を創る', '業界全体の水準向上に貢献できることを考え実行する']) },
    // ✨ 自己実現×理念
    { gradeLevel: 1, coreValue: 'self_realization', stageDescription: 'なぜここで働くかを自分の言葉で語れる（理念と自分のつながり）', behavioralIndicators: JSON.stringify(['「なぜここで働くか」を自分の言葉で話せる', 'クリニックの理念と自分の価値観のつながりを感じている', '仕事に意味を感じる場面が増えている']), growthActions: JSON.stringify(['「私がここで働く理由」を文章にする', '理念ページを読んで自分のコメントを書き込む']) },
    { gradeLevel: 2, coreValue: 'self_realization', stageDescription: '自分のやりたいことと理念が重なる部分を見つけ、仕事に意味を感じている', behavioralIndicators: JSON.stringify(['やりがいを感じる場面を具体的に語れる', '自分のやりたいことと理念が重なる部分がある', '仕事を「やらされ」ではなく「選んでいる」感覚がある']), growthActions: JSON.stringify(['やりがいマップを作成する', '理念と自分の夢の交差点を探る対話を1on1で行う']) },
    { gradeLevel: 3, coreValue: 'self_realization', stageDescription: '自分の使命を理念と一致させ、それが日々の行動として現れている', behavioralIndicators: JSON.stringify(['個人の使命とクリニックの理念が一致していると感じている', '使命に基づいた行動が日常に観察できる', '仕事を通じて自己実現している実感がある']), growthActions: JSON.stringify(['パーソナルミッションと理念の重なりを文章化する', '使命に基づいた行動の事例を月1件記録する']) },
    { gradeLevel: 4, coreValue: 'self_realization', stageDescription: '自己実現と患者貢献が同時に起きている状態を体現できている', behavioralIndicators: JSON.stringify(['仕事を通じて自分の夢に近づいている実感がある', '患者さんへの貢献が自己実現の喜びと一致している', '充実感と使命感の両方を持ちながら働いている']), growthActions: JSON.stringify(['半年に一度、自己実現の進捗を振り返る', '「患者さんへの貢献 × 自己成長」の事例を記録する']) },
    { gradeLevel: 5, coreValue: 'self_realization', stageDescription: '理念を自らの言葉で語り、次世代に伝えるロールモデルになっている', behavioralIndicators: JSON.stringify(['理念を自分の言葉で語り人の心を動かせる', '自分の存在自体がクリニックの理念を体現している', '次世代スタッフの理念理解に貢献している']), growthActions: JSON.stringify(['理念を語るストーリーを持ち、スタッフに伝える', 'ロールモデルとして意識した行動を継続する']) },
    // 🤝 パワーパートナー
    { gradeLevel: 1, coreValue: 'power_partner', stageDescription: '見返りを求めずに「先払い」できる場面が自然に増えている', behavioralIndicators: JSON.stringify(['頼まれる前に挨拶・手伝いができる', '感謝を期待せずに行動できる', '「先払い」という言葉の意味を自分の体験と結びつけられる']), growthActions: JSON.stringify(['毎日一つ「見返りを求めない行動」を記録する', '先払いした体験を1on1で振り返る']) },
    { gradeLevel: 2, coreValue: 'power_partner', stageDescription: '仲間の成功を自分のことのように喜べる。ギブを継続できる', behavioralIndicators: JSON.stringify(['仲間の成功を心から喜ぶ言動ができる', '継続的にギブする習慣が身についている', '見返りを意識せずに与え続けられる']), growthActions: JSON.stringify(['仲間の成功に対する「貢献した点」を探す習慣をつくる', '週1回、誰かへの先払い行動を意図的に行う']) },
    { gradeLevel: 3, coreValue: 'power_partner', stageDescription: 'チーム全体のパフォーマンスを引き上げる先払い行動が習慣になっている', behavioralIndicators: JSON.stringify(['チーム全体に先払い的な関わりができている', '自分の貢献がチームの成果に現れている', '先払い文化をチームに広める言動ができる']), growthActions: JSON.stringify(['チームへの先払い行動の影響を記録する', '先払い文化を広める具体的な提案を行う']) },
    { gradeLevel: 4, coreValue: 'power_partner', stageDescription: '院長・患者・チームのパワーパートナーとして、全方位に与え続けられる', behavioralIndicators: JSON.stringify(['院長・患者さん・チーム全員に対して先払い的に関われる', '与えることが自然な生き方として定着している', '与えることで豊かさの循環が生まれている']), growthActions: JSON.stringify(['「与えた結果、何が戻ってきたか」を振り返る', '三方よし（チーム・患者・社会）の事例を積み重ねる']) },
    { gradeLevel: 5, coreValue: 'power_partner', stageDescription: '先払いを体現した存在として、出会う人すべての可能性を広げられる', behavioralIndicators: JSON.stringify(['先払いを体現したロールモデルとしてチームに語られる', '出会う人に可能性を見出し、それを言葉と行動で広げられる', 'パワーパートナーの連鎖を意図してデザインできる']), growthActions: JSON.stringify(['先払いで生まれた豊かさの循環事例をチームと共有する', '次のパワーパートナーを育てることを自分の使命とする']) },
  ];

  // 既存データを削除
  await sql`DELETE FROM mindset_growth_framework`;

  // 新規投入
  for (const item of items) {
    const id = uuidv4();
    await sql`
      INSERT INTO mindset_growth_framework (
        id, grade_level, core_value, stage_description,
        behavioral_indicators, growth_actions
      ) VALUES (
        ${id}, ${item.gradeLevel}, ${item.coreValue},
        ${item.stageDescription}, ${item.behavioralIndicators},
        ${item.growthActions}
      )
    `;
  }

  return NextResponse.json({
    success: true,
    message: `マインド成長フレームワーク ${items.length}件を投入しました`,
    count: items.length,
  });
}
