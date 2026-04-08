'use client';
import { useState } from 'react';

type Step = { text: string };
type FAQ = { q: string; a: string };

type Section = {
  id: string;
  title: string;
  emoji: string;
  tagline: string;
  forWho: string;
  content: string;
  scenes: string[];
  benefits: string[];
  steps: Step[];
  inputExample?: string;
  tips: string[];
  cautions: string[];
  connections: string[];
  faqs?: FAQ[];
};

const T = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  heading: 'var(--text-primary)',
  body: 'var(--text-primary)',
  sub: 'var(--text-secondary)',
};

const sections: Section[] = [
  {
    id: 'overview',
    title: 'xLUMINAとは？',
    emoji: '🌟',
    tagline: 'AIがあなたの「頭脳」になる',
    forWho: '初めてxLUMINAを使う方・全員',
    content: `xLUMINAは、AIを使って「情報収集→分析→文章作成」をまとめてやってくれるツールです。\n\nたとえば「競合他社を調べて、自社の戦略をまとめて、提案書を書く」という3時間かかる作業が、xLUMINAなら15分でできます。\n\n情報収集・調査系の6機能、AI分析・戦略系の5機能、コンテンツ作成系の4機能、管理系の4機能を搭載しています。`,
    scenes: [
      '新しいプロジェクトを始める前に業界の最新動向を把握したいとき',
      '会議資料や提案書をすぐに作りたいとき',
      '競合他社の動きを効率的にウォッチしたいとき',
      '経営戦略やMVVを整理・言語化したいとき',
    ],
    benefits: [
      '情報収集→分析→文書作成の作業時間が最大90%短縮',
      '出典付きの信頼性の高いリサーチ結果が得られる',
      'フレームワークに沿った構造的な分析が自動で完成する',
      '考えを言語化する壁を取り除き、アウトプット量が増える',
    ],
    steps: [
      { text: 'まずダッシュボードを開く' },
      { text: '「Web情報収集」で気になるテーマを検索してみる' },
      { text: '結果を「ライブラリに保存」する' },
      { text: '慣れてきたら複数の機能を組み合わせる' },
    ],
    tips: [
      '最初は「Web情報収集」だけ使ってみましょう。慣れたら他の機能に広げていきます',
      '毎朝ダッシュボードを開く習慣をつけると、業界トレンドに自然と詳しくなります',
      'わからない用語は「用語解説」ページで調べられます',
    ],
    cautions: [
      'AIの回答には誤りが含まれる場合があります。重要な数字・固有名詞は出典を確認しましょう',
      '機密情報（患者情報、個人情報など）は入力しないでください',
      '生成された文章はそのまま使わず、必ず自分の目で確認・編集しましょう',
    ],
    connections: [
      'Web情報収集 → AI分析エンジン：収集した情報をそのまま分析にかけられる',
      'AI分析エンジン → 文章作成：分析結果から提案書・報告書を自動生成',
      'すべての機能 → ライブラリ：調査・分析・文章をすべて一元管理',
    ],
    faqs: [
      { q: '無料で全機能使えますか？', a: '基本機能は無料で使えます。より高度な機能はProプラン（月額¥2,980）をご検討ください。' },
      { q: 'AIが間違えることはありますか？', a: 'あります。特に数字・固有名詞・最新情報は必ず出典を確認しましょう。xLUMINAは出典URLも一緒に表示します。' },
      { q: 'スマホでも使えますか？', a: 'はい。レスポンシブ対応なので、スマートフォンやタブレットからもアクセスできます。ただし大画面のほうが見やすいです。' },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence Hub',
    emoji: '🧠',
    tagline: '8つの目でニュース・SNS・市場を同時監視',
    forWho: '競合調査・市場調査をしたい方、トレンドを把握したい方',
    content: `ニュース・SNS・市場・学術・Web・組織人材・マーケ・採用HRの8つのモードで、目的に合った情報を一気に集められます。\n\nGoogleで何十回も検索する代わりに、1回の操作でまとまった情報が手に入ります。`,
    scenes: [
      '月曜の朝、今週の業界ニュースをまとめて把握したいとき',
      '新規事業の企画前に、市場の全体感を掴みたいとき',
      'SNSでの自社・競合の評判をチェックしたいとき',
      '採用市場の最新トレンドを確認したいとき',
    ],
    benefits: [
      '8ジャンルの情報を1回の操作で横断的に収集できる',
      '手動検索と比べて情報収集時間を80%以上短縮',
      'モード別に整理されるので、目的に合った情報だけ効率よく得られる',
      '出典付きなので情報の信頼性を確認しやすい',
    ],
    steps: [
      { text: 'サイドメニューから「Intelligence Hub」を開く' },
      { text: '8つのモードから目的に合ったものを選ぶ（例：競合調査なら「SNSモード」）' },
      { text: '調べたいキーワードを入力する（例：「〇〇株式会社」「AI採用市場」）' },
      { text: '結果をライブラリに保存するか、AI分析エンジンに渡す' },
    ],
    inputExample: '競合他社名：「株式会社〇〇」\n市場調査：「2026年 AI SaaS 市場規模」\nトレンド把握：「Z世代 消費トレンド 最新」',
    tips: [
      '「SNSモード」で自社・競合の社名を検索すると、世間のリアルな評判がわかります',
      '毎週月曜に「市場モード」で業界キーワードを検索する習慣が効果的です',
      '「学術モード」で調べると、論文ベースの信頼性の高い情報が手に入ります',
      '複数モードの結果を組み合わせると、多角的な視点が得られます',
    ],
    cautions: [
      'SNSの情報は主観的なものが多いため、事実確認は別途行いましょう',
      '学術モードの論文は英語が多い場合があります',
      '検索キーワードが曖昧だと広すぎる結果になるので、具体的に入力しましょう',
    ],
    connections: [
      '→ AI分析エンジン：収集結果をSWOT分析や競合分析に直接渡せる',
      '→ 文章作成：収集した情報をもとにブログ記事や報告書を生成',
      '→ ライブラリ：結果を保存して、後から参照・再利用',
      '→ 定期アラート：重要テーマは定期アラートに登録して継続監視',
    ],
    faqs: [
      { q: 'どのモードを使えばいいかわかりません', a: '迷ったら「Webモード」を選べばOKです。幅広く情報を集めてくれます。' },
      { q: '情報が古い場合はありますか？', a: 'リアルタイムでWeb検索するので基本的に最新情報が得られます。ただし速報性の高いニュースは数時間のタイムラグがある場合があります。' },
    ],
  },
  {
    id: 'websearch',
    title: 'Web情報収集',
    emoji: '🌐',
    tagline: 'AIが自動でWebを検索→要約→出典付きでまとめ',
    forWho: '特定のテーマを深く調べたい方・情報収集に時間をかけたくない方',
    content: `キーワードを入力するだけで、AIが複数のWebサイトを調べて、わかりやすくまとめてくれます。\n\n出典URLも一緒に表示されるので、「この情報はどこから？」という確認もすぐできます。`,
    scenes: [
      '会議前に特定のテーマについて素早く概要を掴みたいとき',
      '業界の最新ニュースをまとめてキャッチアップしたいとき',
      '競合他社のサービスや特徴を調べたいとき',
      '提案書のエビデンスとなるデータを探したいとき',
    ],
    benefits: [
      'Google検索の何倍もの情報を一度に収集・要約してくれる',
      '出典URL付きなので根拠を示した資料が作れる',
      '「📌 過去に登場」バッジで信頼性の高い情報源がわかる',
      '期間フィルターで最新情報だけを効率的に取得できる',
    ],
    steps: [
      { text: '「Web情報収集」を開く' },
      { text: '「回答の長さ」を選ぶ（迷ったら「標準」でOK）' },
      { text: '必要なら「期間フィルター」で最近1週間などに絞る' },
      { text: '調べたいテーマを入力して「調査」ボタンを押す' },
      { text: '結果が出たら「📚 ライブラリに保存」で保存する' },
    ],
    inputExample: '「2026年 生成AI 活用事例 企業」\n「〇〇業界 市場規模 最新」\n「競合他社名 サービス 特徴」',
    tips: [
      '「最近1週間」フィルターを使うとバズっている最新情報だけが集まります',
      '「詳細（4000トークン）」は大事な会議の前の深掘り調査に使いましょう',
      '青いリンク（出典URL）は必ずクリックして内容を確認する習慣をつけましょう',
      '「📌 過去に登場」バッジ付きのURLは複数回検索結果に出た信頼性の高い情報源です',
    ],
    cautions: [
      '回答が長すぎる場合は「標準」または「簡潔」に切り替えましょう',
      '出典URLが切れている場合はリンク先が削除されている可能性があります',
      '同じテーマでも時期によって結果が変わるので、日付を意識して保存しましょう',
    ],
    connections: [
      '→ AI分析エンジン：収集結果をコピペしてSWOT分析やトレンド分析に活用',
      '→ 文章作成：「文章作成に使う」ボタンで根拠ある記事を生成',
      '→ ディープリサーチ：概要把握の後に深掘りが必要ならディープリサーチへ',
      '→ ライブラリ：保存して後から検索・再利用',
    ],
    faqs: [
      { q: '情報収集と「Intelligence Hub」の違いは？', a: 'Intelligence Hubは8つのジャンル別収集、Web情報収集は自由なテーマで深く調べる用です。セットで使うと最強です。' },
      { q: '途中で文章が切れてしまいます', a: '「回答の長さ」を「詳細（4000トークン）」に変更してみてください。' },
    ],
  },
  {
    id: 'deepresearch',
    title: 'ディープリサーチ',
    emoji: '🔭',
    tagline: '3段階の深さで「本気の調査」を自動実行',
    forWho: '重要な意思決定の前・投資判断・新規事業立案をする方',
    content: `通常のWeb検索より何倍も深く調査します。深度1〜3を選べて、深度3では複数の情報源を横断的に調べ、矛盾点の確認までやってくれます。\n\n大事な判断をする前に使うと、見落としを大幅に減らせます。`,
    scenes: [
      '新規事業への参入を検討していて、市場の全体像を正確に把握したいとき',
      '投資判断の前に、対象企業や市場を徹底的に調べたいとき',
      '重要な意思決定の前に、賛否両面の情報を網羅的に集めたいとき',
      '学術的・専門的な根拠が必要な調査を行うとき',
    ],
    benefits: [
      '複数情報源を横断して矛盾点まで確認してくれるので、信頼性の高い調査結果が得られる',
      '深度3では見落としがちなリスクや反論も自動で収集してくれる',
      '調査レポートとしてそのまま使えるほどの詳細な出力が得られる',
      '重要な判断に必要な「十分な下調べ」の時間を大幅短縮',
    ],
    steps: [
      { text: '「ディープリサーチ」を開く' },
      { text: '調査テーマを具体的に入力する（後述の例を参考に）' },
      { text: '深度を選ぶ（急ぎなら1、重要な判断なら3）' },
      { text: '調査開始（深度3は数分かかります）' },
      { text: '結果をライブラリに保存→AI分析エンジンに渡す' },
    ],
    inputExample: '悪い例：「AI市場」（漠然としすぎ）\n良い例：「2026年 日本 医療AIスタートアップ 資金調達 動向」\n良い例：「美容皮膚科 自費診療 集客チャネル 比較 2026年」',
    tips: [
      'テーマは具体的に書くほど精度が上がります。業界・年・地域・目的を入れましょう',
      '深度3は時間がかかりますが、投資判断など重要な場面で力を発揮します',
      '結果が出たらAI分析エンジンのSWOT分析に渡すと、すぐ戦略立案に使えます',
      '同じテーマを深度1→3と段階的に調べると、効率よく深掘りできます',
    ],
    cautions: [
      '深度3は数分かかるので、時間に余裕があるときに使いましょう',
      '結果が長くなるため、要点を自分で整理する作業は必要です',
      '非常に専門的なテーマは、AI分析エンジンと組み合わせて構造化しましょう',
    ],
    connections: [
      '← Web情報収集：まずWeb情報収集で概要を掴んでからディープリサーチで深掘り',
      '→ AI分析エンジン：調査結果をSWOT分析に渡して構造的に整理',
      '→ 経営インテリジェンス：調査結果をもとに事業計画・戦略を立案',
      '→ 文章作成：調査結果を報告書・提案書として整形',
    ],
    faqs: [
      { q: 'Web情報収集とどう使い分けますか？', a: 'Web情報収集は「手早く概要を知りたいとき」、ディープリサーチは「大事な判断の前に徹底的に調べたいとき」に使います。' },
      { q: '調査に時間がかかりすぎます', a: '深度を下げてみてください。深度1なら数十秒で完了します。' },
    ],
  },
  {
    id: 'analysis',
    title: 'AI分析エンジン',
    emoji: '🧩',
    tagline: '6つの分析フレームで「考える」作業をAIに任せる',
    forWho: '戦略を考えたい方・アイデアを整理したい方・企画書を作る方',
    content: `SWOT・仮説・トレンド・アクション・コンテンツ・競合の6種類の分析ができます。\n\n「なんとなく感じていること」を入力すると、AIが論理的に整理してくれます。考えを構造化するのが苦手な方に特におすすめです。`,
    scenes: [
      '経営会議の前に、自社の強み・弱み・機会・脅威を整理したいとき',
      '新規事業のアイデアを論理的に検証したいとき',
      '競合他社との差別化ポイントを明確にしたいとき',
      '次の四半期のアクションプランを具体化したいとき',
    ],
    benefits: [
      '漠然とした考えがフレームワークに沿って構造化される',
      'コンサルタントに依頼するような分析が数分で完成する',
      '見落としがちな視点（外部環境の脅威など）も自動で洗い出してくれる',
      '分析結果をそのまま企画書・提案書のベースにできる',
    ],
    steps: [
      { text: '「AI分析エンジン」を開く' },
      { text: '6つの分析タイプから目的に合ったものを選ぶ' },
      { text: 'Web情報収集やディープリサーチの結果を貼り付けるか、直接テーマを入力' },
      { text: '分析結果をライブラリに保存→文章作成ページに引き継ぐ' },
    ],
    inputExample: 'SWOT分析：「当社は中小企業向けのSaaSを提供しています。競合はA社とB社です。強みはカスタマーサポートの手厚さです」\n競合分析：「競合他社名：〇〇社、当社の強み：〜、当社の弱み：〜」',
    tips: [
      'Web情報収集の結果をそのままコピーして貼り付けると、深い分析が得られます',
      'SWOT分析は「機会（O）」と「脅威（T）」に特に注目しましょう。外部環境の変化が見えます',
      '分析結果を「文章作成」に渡して提案書を自動生成するのが最強の流れです',
      '同じテーマを複数のフレームワークで分析すると、多面的な理解が得られます',
    ],
    cautions: [
      '入力する情報が少ないと一般論になりがちです。自社固有の情報をなるべく含めましょう',
      'AIの分析はあくまで「たたき台」です。自社の実情と照らし合わせて調整しましょう',
      '機密性の高い経営数値は入力せず、定性的な情報で分析するのが安全です',
    ],
    connections: [
      '← Web情報収集/ディープリサーチ：収集した情報をインプットとして分析精度を向上',
      '→ 文章作成：分析結果を提案書・報告書・プレゼン資料に自動変換',
      '→ 経営インテリジェンス：分析結果を踏まえてMVVや戦略を策定',
      '→ ライブラリ：分析結果を保存して、定期的に振り返り・更新',
    ],
    faqs: [
      { q: 'どの分析タイプを選べばいいですか？', a: '新規事業や戦略検討ならSWOT、競合を調べるなら競合分析、次の行動を決めたいならアクション分析がおすすめです。' },
      { q: '過去の分析結果と比較できますか？', a: 'ライブラリに保存しておけば、時期を変えて同じテーマを再分析し、変化を比較できます。' },
    ],
  },
  {
    id: 'write',
    title: '文章作成',
    emoji: '✍️',
    tagline: 'ブログ・SNS・提案書・小説まで14モードで一発生成',
    forWho: '文章を書くのが苦手な方・コンテンツを量産したい方・時間を節約したい方',
    content: `ブログ・note・SNS・画像プロンプト・小説・解説本など14種類の文章をAIが書いてくれます。\n\n「何を書けばいいかわからない」という状態でも、テーマだけ入れれば構成から本文まで全部作ってくれます。`,
    scenes: [
      'ブログやnoteの記事を定期的に更新したいが時間がないとき',
      'SNSの投稿ネタに困っているとき',
      '提案書や報告書のドラフトを素早く作りたいとき',
      '患者向け・顧客向けの説明文やFAQを作りたいとき',
    ],
    benefits: [
      '「書き始められない」問題が解消される。テーマだけで構成〜本文まで完成',
      '14の専用モードで目的に最適化された文体・構成で生成される',
      'Web情報収集の結果を渡せば、根拠のある記事が書ける',
      '複数パターンを生成して比較・選択できるので、最適な表現が見つかる',
    ],
    steps: [
      { text: '「文章作成」を開く' },
      { text: '14のモードから目的に合ったものを選ぶ（例：ブログ・SNS・提案書）' },
      { text: 'テーマや参考情報を入力する（Web情報収集の結果を貼るとさらに良い）' },
      { text: '生成された文章を編集・コピー・ライブラリに保存する' },
    ],
    inputExample: 'ブログ：「AIを使った業務効率化について、中小企業向けに具体例を交えて書いて。2000字程度」\nSNS：「当社の新サービス〇〇のリリースを知らせるツイートを3パターン作って。ビジネス向けで簡潔に」',
    tips: [
      'Web情報収集の結果を「文章作成に使う」ボタンで引き継ぐと、根拠のある記事になります',
      'SNSは複数パターンを作って、一番刺さるものを選ぶ使い方が効果的です',
      '一度生成した後「もっとカジュアルに」「競合との差別化を強調して」など追加指示できます',
      '文字数を指定する場合は「2000字程度」のように入力欄に書くだけでOKです',
    ],
    cautions: [
      'AIが書いた文章はそのまま公開せず、必ず自分の目でチェックしましょう',
      '医療や法律に関する文章は、専門家のレビューを経てから公開してください',
      '自分の体験や個性を追記すると、より読者に響く文章になります',
    ],
    connections: [
      '← Web情報収集：最新情報を渡して根拠ある記事を生成',
      '← AI分析エンジン：分析結果を提案書・報告書に変換',
      '→ Gensparkへ出力：生成した文章をスライド・ビジュアル資料に変換',
      '→ ライブラリ：テンプレートとして保存し、次回以降の文章作成に再利用',
    ],
    faqs: [
      { q: 'AIが書いた文章をそのまま使っていいですか？', a: '必ず自分でチェックして修正しましょう。AIは骨格を作るのが得意ですが、あなた自身の体験や個性を加えると、より良い文章になります。' },
      { q: '文章の長さを指定できますか？', a: 'テーマの入力欄に「2000字で」「箇条書き5つで」など指定すればOKです。' },
    ],
  },
  {
    id: 'strategy',
    title: '経営インテリジェンス',
    emoji: '💼',
    tagline: '経営の7つの課題をAIが一気に解決',
    forWho: '経営者・管理職・人事担当者・起業を考えている方',
    content: `MVV策定・マーケ戦略・ブランド・採用・人材育成・組織設計の7種類の経営課題をAIが支援します。\n\nコンサルタントに頼むような作業を、xLUMINAなら数分でできます。`,
    scenes: [
      '新年度の経営方針やMVVを策定・見直したいとき',
      '採用面接の質問リストや評価基準を整備したいとき',
      '新メンバーのオンボーディング資料や育成計画を作りたいとき',
      'ブランド戦略やマーケティング施策を体系的に考えたいとき',
    ],
    benefits: [
      'コンサル依頼なしで、構造的な経営戦略の「たたき台」が得られる',
      '採用面接の質問リストを自動生成し、聞き忘れを防げる',
      '人材育成計画をフレームワークに沿って作成できる',
      'MVVを言語化することで、スタッフへの理念共有がスムーズに',
    ],
    steps: [
      { text: '「経営インテリジェンス」を開く' },
      { text: '7つの機能から課題に合ったものを選ぶ' },
      { text: '会社の情報（業種・規模・現状の課題など）を入力する' },
      { text: '生成された戦略・資料をライブラリに保存する' },
    ],
    inputExample: 'MVV策定：「業種：IT SaaS、従業員数：20名、創業2年目、競合との差別化：手厚いサポート」\n採用面接：「ポジション：エンジニア、必要スキル：React/TypeScript、重視する人物像：自走できる人」',
    tips: [
      '採用面接前に「採用モード」で質問リストを生成すると、聞き忘れがなくなります',
      '新メンバー入社時に「MVV」を整理した資料を作ると、オンボーディングがスムーズです',
      '人材育成計画は年初に作成して、四半期ごとに更新する使い方がおすすめです',
      '同じテーマで繰り返し生成し、少しずつ入力を増やすと精度が上がります',
    ],
    cautions: [
      'AIが作った戦略はあくまで「たたき台」です。自社の文化・実情に合わせて必ず調整しましょう',
      '採用基準に法的に問題のある項目（差別的表現など）が含まれていないか確認しましょう',
      '機密性の高い経営数値は入力を避け、定性的な情報で相談するのが安全です',
    ],
    connections: [
      '← ディープリサーチ：業界調査をもとに戦略をより具体的に策定',
      '← AI分析エンジン：SWOT分析の結果を踏まえた戦略立案',
      '→ 文章作成：戦略を求人票・社内文書・プレスリリースに変換',
      '→ ライブラリ：戦略文書を保存して定期的に見直し・更新',
    ],
    faqs: [
      { q: 'AIが作った採用基準や戦略は信頼できますか？', a: 'あくまで「たたき台」として使いましょう。AIの提案を土台に、あなたの経験や会社の状況に合わせて修正することで、より精度の高いものになります。' },
      { q: '小規模な組織でも使えますか？', a: 'もちろんです。むしろ人事・経営企画の専任がいない小規模組織ほど、AIの支援が効果的です。' },
    ],
  },
  {
    id: 'library',
    title: 'ライブラリ',
    emoji: '📚',
    tagline: '調査・分析・文章をすべて一元管理',
    forWho: '情報を整理したい方・過去の調査を再利用したい方',
    content: `Web情報収集・分析・文章の結果を全部ここに保存できます。\n\nタグ・グループ・お気に入りで整理でき、後から検索して見直せます。「あの調査どこだっけ」という状況がなくなります。`,
    scenes: [
      '過去に調べた情報を再利用したいとき',
      'プロジェクトごとに調査結果を整理したいとき',
      'チーム内で調査結果を共有・蓄積したいとき',
      '定期的に同じテーマの情報を追跡・比較したいとき',
    ],
    benefits: [
      '「あの調査結果どこだっけ」がゼロになる。全データを一元管理',
      'タグ・グループ機能で案件別・テーマ別に整理できる',
      'お気に入り機能で重要なデータに即アクセス',
      '蓄積された情報が「社内ナレッジベース」として組織の資産になる',
    ],
    steps: [
      { text: '各機能ページの「📚 ライブラリに保存」ボタンを押す' },
      { text: 'ライブラリページでタグ・グループを設定して整理する' },
      { text: '重要なものは★お気に入りに登録する' },
      { text: '必要なときに検索して取り出す' },
    ],
    tips: [
      'プロジェクト名をグループ名にすると、案件ごとに情報を整理できます',
      '重要な調査結果は★お気に入りに。次回すぐアクセスできます',
      '定期的に古いデータを整理すると、使いやすさが維持できます',
      '保存時にタグを付ける習慣をつけると、後から探すときに劇的に楽になります',
    ],
    cautions: [
      '保存したデータは時間が経つと古くなります。特に市場データは定期的に更新しましょう',
      'ライブラリが増えすぎると検索性が下がるので、不要なデータは定期的に整理しましょう',
      '機密情報を含むデータの取り扱いには注意してください',
    ],
    connections: [
      '← すべての機能：各機能の出力をここに集約',
      '→ AI分析エンジン：過去の調査結果を再度分析にかけて新たな知見を得る',
      '→ 文章作成：保存済みの情報をベースに新しい文章を生成',
      '→ ダッシュボード：保存数やアクティビティを概観',
    ],
    faqs: [
      { q: '保存できるデータ量に制限はありますか？', a: '現時点では制限を設けていません。ただし大量のデータが蓄積されると表示が遅くなる場合があります。' },
      { q: '保存したデータを削除できますか？', a: 'はい、個別に削除できます。一括削除も可能です。' },
    ],
  },
  {
    id: 'workflow',
    title: '最強ワークフロー',
    emoji: '🚀',
    tagline: '機能を組み合わせると効果が10倍になる',
    forWho: 'xLUMINAを使いこなしたい方・業務を大幅に効率化したい方',
    content: `各機能を単独で使うより、組み合わせて使うほうが圧倒的に効果が出ます。\n\nよく使われる4つのワークフローを紹介します。これらを参考に、自分だけの活用パターンを見つけてください。`,
    scenes: [
      '調査→分析→資料作成を一気通貫で進めたいとき',
      '新規事業の企画をゼロから形にしたいとき',
      'コンテンツマーケティングを効率化したいとき',
      '採用活動全体を戦略的に設計したいとき',
    ],
    benefits: [
      '各機能の出力が次の機能のインプットになるので、作業の無駄がなくなる',
      '手動でのコピー&ペーストだけで高度なワークフローが組める',
      '一連の流れでアウトプットの質が飛躍的に向上する',
      '作業の再現性が高く、繰り返し使えるテンプレートになる',
    ],
    steps: [
      { text: '【新規事業検討】Web情報収集（市場調査）→ ディープリサーチ（深掘り）→ AI分析・SWOT分析 → 経営インテリジェンス（事業計画）→ 文章作成（提案書）' },
      { text: '【コンテンツ制作】Intelligence Hub（トレンド把握）→ Web情報収集（最新情報）→ 文章作成（記事）→ Gensparkへ出力（スライド化）' },
      { text: '【競合分析】Web情報収集（競合情報収集）→ AI分析エンジン（競合分析）→ 経営インテリジェンス（差別化戦略）→ ライブラリ（保存）' },
      { text: '【採用強化】経営インテリジェンス（採用戦略策定）→ 文章作成（求人票作成）→ AI分析（候補者評価基準）' },
    ],
    tips: [
      '最初は1つのワークフローを完全にマスターしてから、次に進みましょう',
      '各ステップの結果を必ずライブラリに保存すると、後から振り返れます',
      'ワークフローに慣れたら自分なりにカスタマイズして、オリジナルの使い方を作りましょう',
      '定期的な業務（月次報告など）はワークフローをテンプレ化すると毎回の工数が減ります',
    ],
    cautions: [
      '最初からすべてのワークフローを試そうとせず、一番使う場面から始めましょう',
      '各ステップの出力を確認してから次に進む習慣が大切です',
      '途中の結果を保存しないと、やり直しが発生する場合があります',
    ],
    connections: [
      'このページ自体がすべての機能の連携方法を解説しています',
      '各機能の「→」表記を辿ると、自然な流れで次の機能に移れます',
      '定期アラートと組み合わせると、情報収集の起点を自動化できます',
    ],
    faqs: [
      { q: 'どのワークフローから始めればいいですか？', a: '「コンテンツ制作」のワークフローが一番シンプルで始めやすいです。Intelligence Hub → Web情報収集 → 文章作成の3ステップだけで完結します。' },
      { q: '自分用のワークフローを作れますか？', a: 'もちろんです。上記の4パターンを参考に、自社の業務フローに合わせてアレンジしてください。ワークフローページで可視化もできます。' },
    ],
  },
];

export default function GuidePage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const current = sections.find(s => s.id === activeSection)!;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>

      {/* ヘッダー */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: T.heading, marginBottom: 4 }}>
          📖 xLUMINA 活用ガイド
        </h1>
        <p style={{ color: T.secondary, fontSize: 13 }}>
          中学生でもわかるやさしい解説。具体例・手順・よくある質問付き。
        </p>
      </div>

      {/* タブナビゲーション */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28,
        borderBottom: '1px solid var(--border)', paddingBottom: 16,
      }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveSection(s.id); setOpenFaq(null); }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: activeSection === s.id
                ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                : 'rgba(255,255,255,0.05)',
              color: activeSection === s.id ? '#fff' : T.secondary,
            }}
          >
            {s.emoji} {s.title}
          </button>
        ))}
      </div>

      {/* セクション本文 */}
      <div>
        {/* タイトル */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.heading, marginBottom: 4 }}>
            {current.emoji} {current.title}
          </h2>
          <p style={{ fontSize: 15, color: '#6c63ff', fontWeight: 600, marginBottom: 8 }}>
            {current.tagline}
          </p>
          <span style={{
            fontSize: 11, color: '#00d4b8',
            background: 'rgba(0,212,184,0.1)',
            padding: '3px 10px', borderRadius: 99,
            border: '1px solid rgba(0,212,184,0.25)',
          }}>
            👤 {current.forWho}
          </span>
        </div>

        {/* 説明文 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 24,
        }}>
          {current.content.split('\n\n').map((para, i) => (
            <p key={i} style={{
              color: T.primary, lineHeight: 1.85, fontSize: 14,
              margin: i > 0 ? '12px 0 0' : 0,
            }}>
              {para}
            </p>
          ))}
        </div>

        {/* こんな時に使う */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            🎯 こんな時に使おう
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.scenes.map((scene, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '10px 14px',
                background: 'rgba(108,99,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#6c63ff', fontSize: 14, flexShrink: 0 }}>▸</span>
                <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.6, margin: 0 }}>
                  {scene}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 使うと何が得られるか */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            ✅ 得られる成果
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.benefits.map((benefit, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '10px 14px',
                background: 'rgba(0,212,184,0.04)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#00d4b8', fontSize: 14, flexShrink: 0 }}>●</span>
                <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.6, margin: 0 }}>
                  {benefit}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ステップ */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            📋 使い方ステップ
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'var(--accent-soft)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <span style={{
                  minWidth: 26, height: 26,
                  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
                  flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <p style={{ color: T.primary, lineHeight: 1.7, margin: 0, fontSize: 13 }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 入力例 */}
        {current.inputExample && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
              💬 入力例（コピーして使えます）
            </h3>
            <div style={{
              background: 'rgba(0,212,184,0.05)',
              border: '1px solid rgba(0,212,184,0.2)',
              borderRadius: 10, padding: '14px 18px',
            }}>
              {current.inputExample.split('\n').map((line, i) => (
                <p key={i} style={{
                  fontSize: 13, color: T.primary, lineHeight: 1.8,
                  margin: i > 0 ? '4px 0 0' : 0,
                  fontFamily: 'monospace',
                }}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            💡 プロのコツ
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.tips.map((tip, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 14px',
                borderLeft: '3px solid rgba(108,99,255,0.4)',
                background: 'rgba(108,99,255,0.04)',
                borderRadius: '0 8px 8px 0',
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✨</span>
                <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.7, margin: 0 }}>
                  {tip}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 注意点 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            ⚠️ 注意点
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.cautions.map((caution, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 14px',
                background: 'rgba(245,166,35,0.04)',
                border: '1px solid rgba(245,166,35,0.15)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#f5a623', fontSize: 13, flexShrink: 0 }}>!</span>
                <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.6, margin: 0 }}>
                  {caution}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 他機能との連携 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
            🔗 他の機能との連携
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.connections.map((conn, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '10px 14px',
                background: 'rgba(108,99,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#6c63ff', fontSize: 13, flexShrink: 0 }}>⇄</span>
                <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.6, margin: 0 }}>
                  {conn}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* よくある質問 */}
        {current.faqs && current.faqs.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.heading, marginBottom: 12 }}>
              ❓ よくある質問
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {current.faqs.map((faq, i) => {
                const key = `${activeSection}-${i}`;
                return (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 10, overflow: 'hidden',
                  }}>
                    <div
                      onClick={() => setOpenFaq(openFaq === key ? null : key)}
                      style={{
                        padding: '12px 16px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <p style={{ fontSize: 13, color: T.primary, fontWeight: 600, margin: 0 }}>
                        Q. {faq.q}
                      </p>
                      <span style={{ color: T.secondary, fontSize: 12, marginLeft: 12 }}>
                        {openFaq === key ? '▲' : '▼'}
                      </span>
                    </div>
                    {openFaq === key && (
                      <div style={{
                        padding: '0 16px 14px',
                        borderTop: '1px solid var(--border)',
                      }}>
                        <p style={{ fontSize: 13, color: T.primary, lineHeight: 1.7, margin: '12px 0 0' }}>
                          A. {faq.a}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
