import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

const CRITERIA_DATA = [
  // 理念
  { category: '理念', criterion: '【患者の感情に寄り添う】医療技術だけでなく、患者が抱える不安や期待に真摯に向き合う。診察は「治す」だけでなく「伝わる」ことを目指す。', priority: 5 },
  { category: '理念', criterion: '【誠実さを最上位に置く】患者への説明・スタッフへの対応・経営判断のすべてにおいて、短期的な利益より誠実さを優先する。', priority: 5 },
  { category: '理念', criterion: '【クリニックは「場」である】建物や機器ではなく、そこに集まる人とその関係性がクリニックの本質。その場を豊かにすることを意識する。', priority: 4 },
  { category: '理念', criterion: '【美と健康は分離しない】保険診療と自費診療を分けて考えない。患者の「なりたい自分」と「健康な皮膚」は同じ方向を向いている。', priority: 4 },
  { category: '理念', criterion: '【長期的な信頼を選ぶ】一時的な売上より患者との長期的な関係を優先する。短期的に見えにくくても、信頼の積み重ねが最大の資産。', priority: 5 },
  { category: '理念', criterion: '【問いを持ち続ける姿勢】「なぜそうするのか」を問い続けることを良しとする。慣習や前例への盲目的な従属を戒める。', priority: 3 },
  { category: '理念', criterion: '【余白を大切にする】忙しさを美徳としない。スタッフが考え・感じ・休む余白があってこそ、患者への質の高い関わりが生まれる。', priority: 4 },
  // 等級
  { category: '等級', criterion: '【等級は「責任の深さ」で決まる】年数や年齢ではなく、どれだけ自分の判断で動き、周囲に良い影響を与えられるかで等級を判断する。', priority: 5 },
  { category: '等級', criterion: '【上位等級は「引き上げる力」を持つ】G4以上のスタッフには、後輩の成長を加速させる関わりが期待される。自分だけが育つ段階を超えている。', priority: 4 },
  { category: '等級', criterion: '【昇格は「準備ができた時」に起きる】昇格を急がせない。本人が次のステージにいることが自然になった時が、承認のタイミング。', priority: 4 },
  { category: '等級', criterion: '【等級と給与は誠実に連動させる】評価結果と報酬が乖離すると信頼が壊れる。スコアと賞与の関係を透明に保つ。', priority: 5 },
  { category: '等級', criterion: '【降格は失敗ではなく再設計】等級が下がることを恥としない。その人に合った場所で再び輝くための再設計として捉える。', priority: 3 },
  { category: '等級', criterion: '【G1でも「プロ」である】新人であっても、患者の前に立つ時点でプロフェッショナル。等級に関わらず誠実な対応を求める。', priority: 4 },
  { category: '等級', criterion: '【等級制度はスタッフのためにある】管理のための等級ではなく、スタッフが自分の成長を可視化し、次の目標を描くためのものである。', priority: 5 },
  // 評価
  { category: '評価', criterion: '【評価は「点数」より「対話」】スコアは参考値。数字より、その背景にある行動・姿勢・変化を1on1で言語化することを重視する。', priority: 5 },
  { category: '評価', criterion: '【自己評価との差を大切にする】上長評価と自己評価のギャップは成長の種。否定ではなく「なぜそう感じたか」を一緒に探る。', priority: 4 },
  { category: '評価', criterion: '【強みを見つけてから弱みを語る】フィードバックは強みの発見から始める。弱点の改善より、強みを活かす方向を先に探る。', priority: 4 },
  { category: '評価', criterion: '【マインドスコアを軽く見ない】技術・知識は後から伸びやすい。マインド（在り方・姿勢）は変化に時間がかかるため、評価の重みを大きく置く。', priority: 5 },
  { category: '評価', criterion: '【評価期間は「成長の章」として区切る】Q1〜Q4の区切りを、ただの集計期間にしない。各期を「どんな章だったか」と振り返る習慣をつくる。', priority: 3 },
  { category: '評価', criterion: '【公平性より個別性】全員を同じ基準で測ることより、その人の文脈・状況を踏まえた評価を優先する。', priority: 4 },
  { category: '評価', criterion: '【評価結果はすぐに伝える】評価が確定したら速やかに本人へ。時間が空くと「何かあったのか」という不安が生まれる。', priority: 4 },
  { category: '評価', criterion: '【賞与は感謝の形のひとつ】加算率はルールだが、その背景に「ありがとう」の気持ちがあることをスタッフに伝える。', priority: 3 },
  // 戦略
  { category: '戦略', criterion: '【保険と自費の「統合」を目指す】両者を別々のビジネスと見なさない。患者が自然に行き来できる動線・体験設計を戦略の中心に置く。', priority: 5 },
  { category: '戦略', criterion: '【口コミが最強のマーケティング】広告費より、患者が「誰かに話したくなる体験」への投資を優先する。', priority: 4 },
  { category: '戦略', criterion: '【スタッフ満足が患者満足に直結する】スタッフが誇りを持って働ける環境こそ、患者体験の質を上げる最短経路である。', priority: 5 },
  { category: '戦略', criterion: '【新しい技術・機器は慎重に選ぶ】流行に乗るより、クリニックの理念と患者層に合うかを基準に導入を判断する。', priority: 4 },
  { category: '戦略', criterion: '【地域に根ざした存在であり続ける】患者が「うちのクリニック」と呼べる関係性を目指す。遠くから来る患者より、近くの患者との深い信頼を優先。', priority: 4 },
  { category: '戦略', criterion: '【数字は羅針盤であって目的地ではない】売上・患者数・予約率はすべて指標。それらを最大化することが目的にならないよう常に問い直す。', priority: 4 },
  { category: '戦略', criterion: '【意思決定はできるだけ現場に近い場所で】院長がすべてを決めない。スタッフが判断できる範囲を広げ、現場の知恵を活かす組織をつくる。', priority: 5 },
  // 採用
  { category: '採用', criterion: '【「一緒に育てる」人を採る】即戦力より、クリニックの理念に共鳴し、共に成長していける人を優先する。', priority: 5 },
  { category: '採用', criterion: '【正直さを最重要視する】面接での受け答えが「正直か」を重視する。華やかな経歴より、自分の失敗を語れる人を信頼する。', priority: 5 },
  { category: '採用', criterion: '【患者への共感力を見る】医療知識より、患者の気持ちを想像する力があるかを面接で確かめる。技術は教えられるが共感は育てにくい。', priority: 5 },
  { category: '採用', criterion: '【前職の退職理由を丁寧に聞く】退職理由に正解はない。ただし「自分の言葉で語れるか」「他責になっていないか」を確認する。', priority: 4 },
  { category: '採用', criterion: '【チームとの相性を大切にする】個人の能力より、既存チームとの関係性の中で力を発揮できるかを見る。', priority: 4 },
  { category: '採用', criterion: '【採用は「縁」でもある】スペックで判断しきれない部分がある。直感と対話から得た印象を、チームで共有して最終判断する。', priority: 3 },
  { category: '採用', criterion: '【スカウトは「共感」から始める】候補者のどこに共鳴したかを具体的に伝えるスカウトを送る。テンプレ文は送らない。', priority: 4 },
  { category: '採用', criterion: '【入社後のギャップを最小化する】採用時に良い面だけ見せない。クリニックの課題・しんどい部分も正直に伝え、覚悟を持って入ってもらう。', priority: 5 },
  // マインド
  { category: 'マインド', criterion: '【感情を否定しない】スタッフが「つらい」「モヤモヤする」と感じることを問題視しない。その感情を出発点に対話する。', priority: 5 },
  { category: 'マインド', criterion: '【失敗を隠さない文化をつくる】ミスを報告しやすい雰囲気が患者安全につながる。責める前に「何があったか」を一緒に考える。', priority: 5 },
  { category: 'マインド', criterion: '【「なぜ」を3回問う習慣】表面的な問題への対処より、根本原因を問い続けることを習慣化する。', priority: 4 },
  { category: 'マインド', criterion: '【他者と比べない成長を促す】スタッフの成長は、他のスタッフとの比較ではなく「過去の自分」との比較で測る。', priority: 4 },
  { category: 'マインド', criterion: '【感謝を言葉にする文化】「ありがとう」を言語化することをチーム文化にする。行動の変化は言葉から始まる。', priority: 4 },
  { category: 'マインド', criterion: '【心理的安全性が最優先】スタッフが「これを言ったらどう思われるか」を考えずに発言できる場をつくることが最優先課題。', priority: 5 },
  { category: 'マインド', criterion: '【モチベーションより「在り方」】やる気に頼る組織はもろい。「どんな時でも自分らしくいられるか」という在り方を軸にする。', priority: 4 },
  { category: 'マインド', criterion: '【燃え尽きのサインを早期に察知する】スタッフの変化（口数が減る・遅刻が増えるなど）を見逃さない。1on1を安全弁として機能させる。', priority: 5 },
  // ハンドブック
  { category: 'ハンドブック', criterion: '【ルールより「なぜそうするか」を伝える】マニュアルに「何をするか」だけでなく「なぜするか」を必ず書く。理由が分かれば応用が利く。', priority: 5 },
  { category: 'ハンドブック', criterion: '【ハンドブックは生きたドキュメント】一度作ったら終わりにしない。現場からのフィードバックを元に定期的に更新する。', priority: 4 },
  { category: 'ハンドブック', criterion: '【患者視点で書く】手順書でも、「患者がどう感じるか」を意識した表現にする。スタッフ視点だけで完結させない。', priority: 4 },
  { category: 'ハンドブック', criterion: '【新人が一人で読んで動けるレベルを目指す】ベテランが「当然知っている」と思う部分こそ、丁寧に書く。暗黙知を言語化することが質を上げる。', priority: 5 },
  { category: 'ハンドブック', criterion: '【例外ケースを記録する】よくあるトラブルや例外的な対応は、ハンドブックに蓄積していく。現場の知恵を全員の財産にする。', priority: 4 },
  { category: 'ハンドブック', criterion: '【読みやすさを妥協しない】長い文章より、箇条書き・図・フローで伝える。スタッフが「読む気になる」ハンドブックをつくる。', priority: 3 },
  { category: 'ハンドブック', criterion: '【スタッフが書き手になれる仕組み】院長が一人で書くより、現場スタッフが加筆・修正できる体制の方が精度が高く定着率も上がる。', priority: 4 },
  // 成長哲学
  { category: '成長哲学', criterion: '【成長は「なりたい自分」から逆算する】組織の目標に合わせるだけでなく、スタッフ個人の「ありたい姿」を起点に成長計画を設計する。', priority: 5 },
  { category: '成長哲学', criterion: '【知識・スキル・マインドをセットで育てる】技術だけ・心だけの成長は長続きしない。三つの柱をバランスよく育てることを意識する。', priority: 5 },
  { category: '成長哲学', criterion: '【学びは「体験」から始まる】研修や座学より、実際の患者対応・失敗・振り返りの繰り返しから最も深い学びが生まれる。', priority: 4 },
  { category: '成長哲学', criterion: '【成長の速度は人によって違う】早い・遅いで優劣をつけない。その人のペースを尊重しながら、止まらないことを支援する。', priority: 4 },
  { category: '成長哲学', criterion: '【「教える」より「問う」】答えを与えるより、自分で考えるための問いを投げかける。問いの質が成長の質を決める。', priority: 5 },
  { category: '成長哲学', criterion: '【成長痛を歓迎する】居心地の悪さや葛藤は成長のサイン。そこから逃げないことをチームで肯定する文化をつくる。', priority: 4 },
  { category: '成長哲学', criterion: '【振り返りの習慣が最大の差を生む】1on1・日報・セルフレビューなど、定期的に立ち止まって振り返る習慣のあるスタッフが最も伸びる。', priority: 5 },
  { category: '成長哲学', criterion: '【成長は自分のためであり、患者のためでもある】スタッフの成長が患者体験の質に直結することを、常に意識できるよう文脈を伝え続ける。', priority: 4 },
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  let inserted = 0;

  for (const item of CRITERIA_DATA) {
    const id = uuidv4();
    await sql`
      INSERT INTO clinic_decision_criteria (id, category, criterion, priority)
      VALUES (${id}, ${item.category}, ${item.criterion}, ${item.priority})
    `;
    inserted++;
  }

  return NextResponse.json({ success: true, inserted });
}
