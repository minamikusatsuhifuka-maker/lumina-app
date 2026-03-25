'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';

type Term = {
  word: string;
  reading: string;
  category: string;
  simple: string;
  detail: string;
  example: string;
  analogy: string;
  fullName?: string;
};

const TERMS: Term[] = [
  {
    word: 'AI（人工知能）',
    reading: 'エーアイ',
    category: 'AI基礎',
    fullName: 'Artificial Intelligence',
    simple: 'コンピューターが人間のように考えたり、学んだりする技術のこと。',
    detail: '大量のデータを学習することで、文章を書いたり、画像を認識したり、質問に答えたりできるようになります。LUMINAもAIを使って情報収集や文章作成を行っています。',
    example: 'ChatGPT、Claude、Geminiなどが有名なAIサービスです。',
    analogy: '🎓 勉強をたくさんした賢い生徒のようなもの。たくさんの本（データ）を読んで、質問に答えられるようになりました。',
  },
  {
    word: 'プロンプト',
    reading: 'ぷろんぷと',
    category: 'AI基礎',
    simple: 'AIへの「指示文」のこと。AIに何をしてほしいか伝える文章。',
    detail: 'プロンプトの書き方によって、AIの回答の質が大きく変わります。具体的で明確な指示を出すほど、良い結果が得られます。LUMINAでは各機能が最適なプロンプトを自動で設定しています。',
    example: '「ブログ記事を3000字で書いて」「競合分析をSWOT形式でまとめて」などがプロンプトです。',
    analogy: '🍽️ レストランでの注文のようなもの。「何でもいいです」より「塩少なめの鶏の唐揚げ定食」と具体的に注文するほうが、思い通りの料理が来ます。',
  },
  {
    word: 'LLM',
    reading: 'えるえるえむ',
    category: 'AI基礎',
    fullName: 'Large Language Model（大規模言語モデル）',
    simple: '大量の文章を学習した、会話や文章作成が得意なAIモデルのこと。',
    detail: 'Large Language Model（大規模言語モデル）の略。GPT-4やClaudeなどがLLMです。インターネット上の膨大なテキストを学習しており、自然な文章の生成や理解が得意です。',
    example: 'LUMINAはClaude（Anthropic社のLLM）を使って文章生成や分析を行っています。',
    analogy: '📚 何億冊もの本を読んだ図書館員のようなもの。どんな質問にも答えられる知識量を持っています。',
  },
  {
    word: 'API',
    reading: 'えーぴーあい',
    category: '技術用語',
    fullName: 'Application Programming Interface',
    simple: 'アプリ同士がデータをやり取りするための「窓口」のこと。',
    detail: 'Application Programming Interface の略。LUMINAはAnthropicのAPIを通じてClaudeと通信し、PerplexityのAPIで最新情報を検索しています。APIキーは「入館証」のようなもので、権限のある人だけがサービスを使えます。',
    example: 'LUMINAが「AIで文章を生成する」とき、裏側でAnthropicのAPIを呼び出しています。',
    analogy: '🔌 コンセントのようなもの。電気製品（アプリ）をコンセント（API）につなぐと、電気（データ）が流れて動くようになります。',
  },
  {
    word: 'トークン',
    reading: 'とーくん',
    category: '技術用語',
    simple: 'AIが文章を処理する際の「文字の単位」。料金計算にも使われる。',
    detail: '日本語では1文字≒1〜2トークン程度。AIへの入力と出力の合計トークン数で料金が決まります。LUMINAのWeb情報収集で「回答の長さ」を選べるのは、このトークン数を調整しているためです。',
    example: '「標準（2000トークン）」は約1000〜1500文字分の回答に相当します。',
    analogy: '🎫 テーマパークのチケットのようなもの。使った枚数（トークン数）に応じて料金が決まります。',
  },
  {
    word: 'RAG',
    reading: 'らぐ',
    category: 'AI応用',
    fullName: 'Retrieval-Augmented Generation（検索拡張生成）',
    simple: 'AIが外部の情報を検索してから回答する技術のこと。',
    detail: 'Retrieval-Augmented Generation（検索拡張生成）の略。AIの知識は学習時点で止まっているため、最新情報をリアルタイムで検索して回答に組み込む仕組みです。LUMINAのWeb情報収集機能がRAGの一種です。',
    example: 'LUMINAが「2026年のAIトレンド」を検索して回答するとき、RAGの仕組みを使っています。',
    analogy: '📰 試験前に教科書（学習済み知識）だけでなく、最新の新聞（Web検索）も参照してから答える学生のようなもの。',
  },
  {
    word: 'SWOT分析',
    reading: 'すわっとぶんせき',
    category: 'ビジネス',
    fullName: 'Strengths・Weaknesses・Opportunities・Threats',
    simple: '会社や事業の「強み・弱み・機会・脅威」を整理する分析フレームワーク。',
    detail: 'Strengths（強み）・Weaknesses（弱み）・Opportunities（機会）・Threats（脅威）の頭文字。新規事業の検討や競合分析に広く使われます。LUMINAのAI分析エンジンで自動生成できます。',
    example: '新しいサービスを始める前に「競合より優れている点は？」「市場の追い風は？」を整理するのに使います。',
    analogy: '⚽ サッカーの試合前分析のようなもの。自チームの得意プレー（強み）、苦手な守備（弱み）、相手の弱点（機会）、相手エースFW（脅威）を整理して戦略を立てます。',
  },
  {
    word: 'MVV',
    reading: 'えむぶいぶい',
    category: 'ビジネス',
    fullName: 'Mission（使命）・Vision（将来像）・Values（価値観）',
    simple: '会社の「ミッション・ビジョン・バリュー」のこと。会社の存在意義と目指す姿。',
    detail: 'Mission（使命）・Vision（将来像）・Values（価値観）の略。会社の方向性を全員で共有するための羅針盤です。LUMINAの経営インテリジェンス機能でAIがMVVの策定を支援します。',
    example: 'ミッション：「世界中の情報を整理する」、ビジョン：「誰もが情報にアクセスできる世界」（Google的な例）',
    analogy: '🧭 山登りの地図と目標地点のようなもの。どの山（ビジョン）を目指すか、どのルート（ミッション）で行くか、どんな装備（バリュー）で臨むかを決めます。',
  },
  {
    word: 'Semantic Scholar',
    reading: 'せまんてぃっくすからー',
    category: 'ツール',
    simple: '1.38億件以上の学術論文を無料で検索できる学術データベース。',
    detail: 'AIを使って論文の重要度ランキングや関連論文の推薦を行う次世代の学術検索エンジン。LUMINAの文献検索機能はこのAPIを使用しています。医学・工学・経営など全分野に対応。',
    example: 'AI倫理に関する最新の研究論文を探したいとき、LUMINAの文献検索から検索できます。',
    analogy: '🔬 世界最大の図書館の司書のようなもの。1億冊以上の専門書の中から、あなたが求める論文を瞬時に見つけてくれます。',
  },
  {
    word: 'Vercel',
    reading: 'ばーせる',
    category: 'ツール',
    simple: 'Webアプリを簡単にインターネット上に公開できるサービス。',
    detail: 'LUMINAはVercelを使ってインターネットに公開されています。GitHubにコードをプッシュするだけで自動的にデプロイ（公開）される仕組みになっています。',
    example: 'lumina-app-olive.vercel.app や xlumina.jp がVercelで動いています。',
    analogy: '🏪 お店の「テナント（場所）」のようなもの。自分でビルを建てなくても（サーバーを用意しなくても）、テナントを借りるだけでお店（Webアプリ）を開けます。',
  },
  {
    word: 'Neon PostgreSQL',
    reading: 'におんぽすとぐれすきゅーえる',
    category: 'ツール',
    simple: 'LUMINAのユーザーデータを保存しているクラウドデータベース。',
    detail: 'ユーザーのアカウント情報・ライブラリの保存データ・下書きなどがNeon上に保存されています。シンガポールのサーバーを使用。PostgreSQLはデータを整理して保存するための仕組みの名前です。',
    example: 'ライブラリに保存した調査結果は、Neonデータベースに記録されているため、次回ログイン時も表示されます。',
    analogy: '🗄️ 会社の書類棚のようなもの。大切な書類（データ）を整理して保管し、必要なときにすぐ取り出せます。',
  },
  {
    word: 'Stripe',
    reading: 'すとらいぷ',
    category: 'ツール',
    simple: 'オンライン決済を簡単に実装できるサービス。LUMINAの有料プラン決済に使用。',
    detail: 'クレジットカード決済の処理をStripeが代行します。現在はテストモードで動作中。本番モードに切り替えると実際の決済が可能になります。月額¥2,980のProプランの決済に使用予定。',
    example: 'LUMINAの「Proにアップグレード」ボタンを押すとStripeの決済画面に移動します。',
    analogy: '💳 お店のレジのようなもの。自分でレジを作らなくても（決済システムを自作しなくても）、Stripeというレジを使えば安全にお金のやり取りができます。',
  },
  {
    word: 'Next.js',
    reading: 'ねくすとじぇいえす',
    category: '技術用語',
    simple: 'LUMINAを作るのに使っているWebアプリ開発のフレームワーク（道具箱）。',
    detail: 'Reactというプログラミングライブラリをベースに、高速なWebアプリを作れるフレームワーク。サーバーサイドとクライアントサイドの両方の処理を効率よく書けます。',
    example: 'LUMINAの全ページがNext.jsで作られています。',
    analogy: '🔧 家を建てるための「プレハブキット」のようなもの。一から材料を調達しなくても、必要な部品がセットになっているので、効率よく家（Webアプリ）を建てられます。',
  },
  {
    word: 'DNS',
    reading: 'でぃーえぬえす',
    category: '技術用語',
    fullName: 'Domain Name System（ドメインネームシステム）',
    simple: 'ドメイン名（xlumina.jp）をIPアドレス（数字）に変換する仕組み。',
    detail: 'Domain Name System の略。人間が覚えやすいドメイン名と、コンピューターが使うIPアドレスを対応付けます。xlumina.jpをVercelのサーバーに繋げるためにDNS設定を行いました。',
    example: 'xlumina.jpにアクセスすると、DNSが「76.76.21.21」というサーバーに案内してくれます。',
    analogy: '📒 電話帳のようなもの。「山田さん（ドメイン名）」の電話番号（IPアドレス）を調べて、電話（通信）を繋いでくれます。',
  },
  {
    word: 'Perplexity',
    reading: 'ぱーぷれきしてぃ',
    category: 'ツール',
    simple: 'リアルタイムでWeb検索ができるAI検索エンジン。LUMINAの情報収集に使用。',
    detail: 'ただの検索エンジンではなく、検索結果をAIがまとめて回答してくれるサービス。LUMINAはPerplexityのAPIを使って最新のWeb情報を収集しています。',
    example: 'LUMINAのWeb情報収集でリアルタイムの市場情報を取得するときに使われています。',
    analogy: '🔍 優秀なリサーチアシスタントのようなもの。「AI市場について調べて」と頼むと、最新のWeb情報を集めてわかりやすくまとめてくれます。',
  },
  // ===== 技術スタック =====
  {
    word: 'Next.js（ネクストジェイエス）',
    reading: 'ねくすとじぇいえす',
    category: '技術スタック',
    fullName: 'Next.js - Reactベースのフルスタックフレームワーク',
    simple: 'LUMINAの全ページを作るのに使っているWeb開発の「道具箱」。',
    detail: 'Reactというライブラリをベースに、ページ表示の高速化・SEO対策・APIの作成まで一つのツールで対応できます。LUMINAでは画面（フロントエンド）とAPIサーバー（バックエンド）の両方をNext.jsで構築しています。',
    example: 'ダッシュボード・Web情報収集・文章作成など、LUMINAの全ページがNext.jsで作られています。またAIへのリクエストを処理するAPI（/api/websearch など）もNext.jsのAPI Routesで実装しています。',
    analogy: '🏗️ 家を建てるための「プレハブキット」のようなもの。基礎・壁・屋根がセットになっているので、ゼロから設計しなくても効率よくWebアプリを作れます。',
  },
  {
    word: 'TypeScript（タイプスクリプト）',
    reading: 'たいぷすくりぷと',
    category: '技術スタック',
    fullName: 'TypeScript - 型付きJavaScript',
    simple: 'JavaScriptに「型チェック」を加えた、バグが起きにくいプログラミング言語。',
    detail: '変数や関数に「これは数字」「これは文字列」と型を指定することで、コードの間違いを事前に検出できます。LUMINAの全コードがTypeScriptで書かれており、開発中のバグを大幅に減らしています。',
    example: 'ユーザーのプロフィール情報を扱うとき、名前は文字列・年齢は数字と型を指定しておくと、間違って数字に文字を入れようとしたときにエラーで教えてくれます。',
    analogy: '📐 設計図に寸法を書き込むようなもの。「この部品は10cmの木材」と指定しておくと、間違って金属を使おうとしたときに「違う！」と気づけます。',
  },
  {
    word: 'Tailwind CSS',
    reading: 'てーるうぃんどしーえすえす',
    category: '技術スタック',
    fullName: 'Tailwind CSS - ユーティリティファーストCSSフレームワーク',
    simple: 'Webページのデザイン（色・サイズ・配置）を素早く作るための道具。',
    detail: '「青いボタン」「余白16px」のようなデザインをクラス名を書くだけで実現できます。LUMINAのUI（ボタン・カード・レイアウトなど）のスタイリングに使用しています。',
    example: 'LUMINAの「無料で始める」ボタンの色・角丸・サイズ・ホバー時の変化などが全てTailwind CSSで設定されています。',
    analogy: '🎨 絵の具セットのようなもの。「赤」「青」「大きく」「右寄せ」など用意されたツールを組み合わせるだけで、自由にデザインを作れます。',
  },
  {
    word: 'Anthropic Claude API',
    reading: 'あんすろぴっくくろーどえーぴーあい',
    category: '技術スタック',
    fullName: 'Anthropic Claude API - AI言語モデルAPI',
    simple: 'LUMINAのAI機能（文章生成・分析・Web検索）の中核となるAIエンジン。',
    detail: 'Anthropic社が開発したClaude AIをAPIで利用しています。文章作成・SWOT分析・Web情報収集・Tips自動生成など、LUMINAの主要機能のほぼすべてがこのAPIを通じてClaudeと通信しています。使った量（トークン数）に応じて料金が発生します。',
    example: '文章作成ページで「ブログ記事を書いて」と依頼したとき、裏側でClaude APIにリクエストが送られ、Claudeが生成した文章が返ってきます。Web情報収集ではweb_search_20250305ツールを有効にして最新情報も取得しています。',
    analogy: '🧠 天才アシスタントへの電話のようなもの。「この分析をして」と電話（APIリクエスト）をかけると、すぐに答え（レスポンス）が返ってきます。電話した時間分だけ料金がかかります。',
  },
  {
    word: 'Neon PostgreSQL',
    reading: 'におんぽすとぐれすきゅーえる',
    category: '技術スタック',
    fullName: 'Neon - サーバーレスPostgreSQLデータベース',
    simple: 'ユーザーのデータ（アカウント・ライブラリ・下書き）を保存するクラウドデータベース。',
    detail: 'PostgreSQLという信頼性の高いデータベースをクラウドで使えるサービスです。LUMINAではユーザー認証情報・ライブラリの保存データ・文章の下書きなどを全てNeonに保存しています。シンガポールのサーバーを使用しており、日本からのアクセスも高速です。',
    example: 'ライブラリに調査結果を保存すると、そのデータがNeonのデータベースに書き込まれます。次回ログインしても表示されるのは、Neonにデータが永続保存されているためです。',
    analogy: '🗄️ クラウド上の書類棚のようなもの。大切な書類（データ）を整理して保管し、どこからでも（どのデバイスからでも）取り出せます。',
  },
  {
    word: 'NextAuth.js',
    reading: 'ねくすとおーすじぇいえす',
    category: '技術スタック',
    fullName: 'NextAuth.js - Next.js用認証ライブラリ',
    simple: 'LUMINAのログイン・ログアウト・セッション管理を担当するライブラリ。',
    detail: 'ユーザーがログインした状態を安全に管理します。「誰がログインしているか」を確認して、本人しか自分のデータにアクセスできないようにしています。パスワードの暗号化やセッション管理を自動で処理してくれます。',
    example: 'LUMINAにログインするとセッションが作成され、ページを移動してもログイン状態が維持されます。ログアウトするとセッションが削除されます。',
    analogy: '🔑 ホテルのカードキーシステムのようなもの。チェックイン（ログイン）するとカード（セッション）が発行され、そのカードを持っている間は自分の部屋（データ）に入れます。',
  },
  {
    word: 'Vercel（バーセル）',
    reading: 'ばーせる',
    category: '技術スタック',
    fullName: 'Vercel - フロントエンド特化クラウドホスティング',
    simple: 'LUMINAをインターネットに公開・運用するためのクラウドサービス。',
    detail: 'GitHubにコードをプッシュするだけで自動的にデプロイ（公開）される仕組みです。世界中にサーバーが分散しているため、どこからアクセスしても高速に表示されます。xlumina.jpドメインもVercelに接続されています。',
    example: 'Claude Codeで修正→GitHubにプッシュ→Vercelが自動検知→18秒でlumina-app-olive.vercel.appとxlumina.jpに反映。この流れが全自動で行われています。',
    analogy: '🏪 ショッピングモールのテナントのようなもの。自分でビル（サーバー）を建てなくても、テナント（Vercel）を借りるだけでお店（Webアプリ）を世界中に公開できます。',
  },
  {
    word: 'Stripe（ストライプ）',
    reading: 'すとらいぷ',
    category: '技術スタック',
    fullName: 'Stripe - オンライン決済プラットフォーム',
    simple: 'LUMINAのProプラン（月額¥2,980）の決済処理を担当するサービス。',
    detail: 'クレジットカード決済・定期課金（サブスクリプション）の処理をStripeが代行します。現在はテストモードで動作中。本番モードに切り替えると実際の決済が可能になります。PCI DSS準拠の高いセキュリティが特徴です。',
    example: 'LUMINAの「Proにアップグレード」ボタンを押すとStripeの決済画面に移動します。月額¥2,980の定期課金もStripeが自動処理します。',
    analogy: '💳 お店のレジ係のようなもの。自分でお金の計算・受け渡し（決済システム）をしなくても、Stripeというレジ係に任せれば安全にお金のやり取りができます。',
  },
  {
    word: 'Perplexity API',
    reading: 'ぱーぷれきしてぃえーぴーあい',
    category: '技術スタック',
    fullName: 'Perplexity API - AI検索エンジンAPI',
    simple: 'リアルタイムのWeb情報をAIが整理して返してくれる検索APIサービス。',
    detail: 'LUMINAのIntelligence Hubなどでリアルタイムの最新情報を取得するために使用しています。通常の検索エンジンと違い、検索結果をAIが自動でまとめて返してくれるため、情報収集の効率が大幅に上がります。',
    example: 'Intelligence Hubで「今日のAI関連ニュース」を収集するとき、PerplexityのAPIが最新ニュースをリアルタイムで検索してまとめてくれます。',
    analogy: '📰 優秀な新聞記者のようなもの。「AI市場の今日のニュースをまとめて」と頼むと、最新のWeb情報を自分で調べてわかりやすくまとめてくれます。',
  },
  {
    word: 'Semantic Scholar API',
    reading: 'せまんてぃっくすからーえーぴーあい',
    category: '技術スタック',
    fullName: 'Semantic Scholar API - 学術論文検索API',
    simple: '1.38億件以上の学術論文をLUMINAから検索するためのAPI。',
    detail: 'Allen Institute for AIが提供する学術論文データベースのAPIです。LUMINAの文献検索機能はこのAPIを使用しており、医学・工学・経営・AI研究など全分野の最新論文を無料で検索できます。論文の引用数・重要度ランキング・関連論文の推薦機能も提供しています。',
    example: '文献検索ページで「深層学習 自然言語処理」と検索すると、Semantic Scholar APIが関連する学術論文を重要度順に返します。論文のタイトル・著者・要約・引用数が表示されます。',
    analogy: '🔬 世界最大の学術図書館の司書のようなもの。「この分野の最新の重要な研究を教えて」と聞くと、1億冊以上の論文の中から最も重要なものを選んで紹介してくれます。',
  },
  // ===== フロントエンド =====
  {
    word: 'React',
    reading: 'りあくと',
    category: '技術スタック',
    fullName: 'React - UIコンポーネントライブラリ（Meta製）',
    simple: 'Webページの画面部品（ボタン・フォームなど）を作るための最も人気のライブラリ。',
    detail: 'Meta（Facebook）が開発したUIライブラリ。画面を「コンポーネント」という部品に分けて管理するため、大規模なアプリでも整理しやすいのが特徴。Next.jsの土台になっています。',
    example: 'LUMINAのダッシュボードの各カード・ボタン・入力フォームが全てReactコンポーネントとして作られています。',
    analogy: '🧩 レゴブロックのようなもの。小さな部品（コンポーネント）を組み合わせて、複雑な画面を作ります。',
  },
  {
    word: 'Shadcn/ui',
    reading: 'しゃどーしーえぬゆーあい',
    category: '技術スタック',
    fullName: 'shadcn/ui - コピー&ペースト型UIコンポーネント集',
    simple: '美しいUIパーツ（ダイアログ・ドロップダウンなど）をコピーして使えるライブラリ。',
    detail: '2023〜2026年で爆発的に普及したUIライブラリ。npmでインストールするのではなく、コードを直接プロジェクトにコピーして使う方式が特徴。Tailwind CSSとRadix UIをベースにしており、カスタマイズが容易です。',
    example: 'LUMINAのモーダル・セレクトボックス・トースト通知などのUIパーツにshadcn/uiのコンポーネントを活用しています。',
    analogy: '📋 コピー可能なデザインテンプレートのようなもの。プロデザイナーが作った部品を自由にカスタマイズして使えます。',
  },
  {
    word: 'Framer Motion',
    reading: 'ふれーまーもーしょん',
    category: '技術スタック',
    fullName: 'Framer Motion - Reactアニメーションライブラリ',
    simple: 'ページ遷移や要素の動きをなめらかにアニメーションさせるライブラリ。',
    detail: 'ボタンのホバー・モーダルの開閉・ページ遷移などのアニメーションを簡単に実装できます。Apple/Airbnbレベルの滑らかなUIを作るために世界中で使われています。',
    example: 'Tipsカードをクリックしたときのアコーディオン開閉アニメーションや、ページ読み込み時のフェードインなどに活用できます。',
    analogy: '🎬 映画の特殊効果スタッフのようなもの。画面の動きに「命」を吹き込んでくれます。',
  },
  {
    word: 'Zustand',
    reading: 'ずすたんど',
    category: '技術スタック',
    fullName: 'Zustand - 軽量Reactステート管理ライブラリ',
    simple: 'アプリ全体で共有するデータ（状態）を管理するための軽量ライブラリ。',
    detail: 'Reduxより軽くシンプルで、2024〜2026年のReact開発で最も人気の状態管理ライブラリ。「ログイン中のユーザー情報」「選択中のテーマ」など複数のページで共有するデータを一元管理できます。',
    example: 'LUMINAのテーマ設定（ダーク/ライト）や選択中の言語設定などをZustandで管理すると、全ページで即座に反映できます。',
    analogy: '📦 会社の共有ロッカーのようなもの。全員がアクセスできる場所に大事な情報を入れておくと、誰でも取り出して使えます。',
  },
  {
    word: 'TanStack Query',
    reading: 'たんすたっくくえりー',
    category: '技術スタック',
    fullName: 'TanStack Query（旧React Query）- 非同期データ取得ライブラリ',
    simple: 'APIからデータを取得・キャッシュ・更新する処理をシンプルにするライブラリ。',
    detail: 'サーバーからデータを取ってくる処理（フェッチ）を自動化し、ローディング状態・エラー処理・キャッシュを自動管理します。「データが古くなったら自動再取得」なども設定できます。',
    example: 'LUMINAのライブラリページでデータを取得・表示する処理をTanStack Queryで実装すると、ローディング表示・エラー処理が自動化されます。',
    analogy: '🔄 自動補充される冷蔵庫のようなもの。食材（データ）が古くなったら自動で新しいものに入れ替えてくれます。',
  },
  // ===== バックエンド =====
  {
    word: 'tRPC',
    reading: 'てぃーあーるぴーしー',
    category: '技術スタック',
    fullName: 'tRPC - TypeScript用型安全APIフレームワーク',
    simple: 'フロントエンドとバックエンドの間のAPIを型安全に作れるフレームワーク。',
    detail: 'REST APIやGraphQLの代わりに使われる新しいアプローチ。TypeScriptの型をフロント・バック両方で共有できるため、APIの変更が即座に両側に反映されバグが減ります。T3 Stackの構成要素として有名。',
    example: 'APIのレスポンス型を変更したとき、フロントエンド側でも自動的に型エラーが出るため、バグを事前に防げます。',
    analogy: '🤝 阿吽の呼吸で動く連携プレーのようなもの。フロントとバックが同じ「型」という共通言語で話すため、ミスコミュニケーションが起きません。',
  },
  {
    word: 'Prisma',
    reading: 'ぷりずま',
    category: '技術スタック',
    fullName: 'Prisma - TypeScript用ORM（データベース操作ライブラリ）',
    simple: 'データベースをTypeScriptで直感的に操作できるようにするライブラリ。',
    detail: 'SQLを直接書かなくても、TypeScriptのコードでデータベースの操作ができます。型安全で自動補完も効くため、開発効率が大幅に上がります。NeonなどのPostgreSQLと組み合わせて使うのが定番です。',
    example: 'LUMINAのライブラリデータを取得するとき、`prisma.library.findMany({ where: { userId } })` のように直感的に書けます。',
    analogy: '🗣️ データベースへの「通訳」のようなもの。日本語（TypeScript）で話しかけると、データベースが理解できる言葉（SQL）に翻訳してくれます。',
  },
  {
    word: 'Drizzle ORM',
    reading: 'どりずるおーあーるえむ',
    category: '技術スタック',
    fullName: 'Drizzle ORM - 軽量TypeScript ORMライブラリ',
    simple: 'Prismaより軽量で高速なデータベース操作ライブラリ。2025〜2026年急成長中。',
    detail: 'PrismaよりもSQLに近い書き方ができ、パフォーマンスが高いのが特徴。サーバーレス環境（VercelやCloudflare Workers）との相性が特に良く、Next.js + Neon + Drizzleの組み合わせが2026年のトレンドスタックになっています。',
    example: 'LUMINAのような Next.js + Neon 構成では、Prismaの代わりにDrizzleを使うとデータベース操作が高速化できます。',
    analogy: '⚡ 軽自動車のようなもの。大型車（Prisma）より燃費がよく小回りが効き、日常使いに最適です。',
  },
  // ===== 認証 =====
  {
    word: 'Clerk',
    reading: 'くらーく',
    category: '技術スタック',
    fullName: 'Clerk - 認証・ユーザー管理SaaS',
    simple: 'ログイン・会員登録・ユーザー管理をまるごと代行してくれるサービス。',
    detail: 'NextAuth.jsより高機能で、ソーシャルログイン（Google/GitHub）・多要素認証・ユーザー管理画面が最初から用意されています。コード量が大幅に減るため、2025〜2026年の新規開発で急増中。',
    example: 'Clerkを使うと「Googleでログイン」「GitHubでログイン」などのソーシャルログインを数行のコードで実装できます。',
    analogy: '🏨 フルサービスのホテルフロントのようなもの。チェックイン（ログイン）・鍵の管理（セッション）・顧客台帳（ユーザー管理）を全部やってくれます。',
  },
  // ===== AI・ML =====
  {
    word: 'Vercel AI SDK',
    reading: 'ばーせるえーあいえすでぃーけー',
    category: '技術スタック',
    fullName: 'Vercel AI SDK - AI機能統合開発キット',
    simple: 'AIのストリーミング応答・チャット機能をNext.jsに簡単に組み込めるライブラリ。',
    detail: 'OpenAI・Anthropic・Googleなど複数のAIプロバイダーに対応した統一インターフェース。ストリーミング応答（文字が徐々に表示される）の実装が数行で書けます。LUMINAのような AIアプリ開発の標準ライブラリになっています。',
    example: 'チャット画面でAIの返答が少しずつ表示されるストリーミング表示は、Vercel AI SDKで簡単に実装できます。',
    analogy: '🔌 家電の電源プラグのようなもの。どのメーカーのAI（コンセント）にも対応した万能プラグで、差し替えるだけで使えます。',
  },
  {
    word: 'LangChain',
    reading: 'らんぐちぇーん',
    category: '技術スタック',
    fullName: 'LangChain - LLMアプリ開発フレームワーク',
    simple: 'AIエージェント・RAG・複雑なAIワークフローを構築するフレームワーク。',
    detail: '複数のAIモデルやツールを「チェーン」のように繋げて、複雑な処理を自動化できます。「Web検索→要約→レポート生成」のような多段階処理の実装に使われます。LUMINAのディープリサーチのような機能を構築するのに適しています。',
    example: 'ディープリサーチ機能を「検索→読み込み→要約→分析→レポート」という複数ステップで自動実行するとき、LangChainで処理を連結できます。',
    analogy: '🏭 工場の生産ラインのようなもの。原材料（ユーザーの質問）が複数の工程（AIツール）を経て、完成品（最終回答）になります。',
  },
  {
    word: 'Pinecone',
    reading: 'ぱいんこーん',
    category: '技術スタック',
    fullName: 'Pinecone - ベクターデータベース',
    simple: '文章や画像を「意味」で検索できる特殊なデータベース。AIと組み合わせて使う。',
    detail: 'テキストを数値ベクトルに変換して保存し、「意味が似ている文章」を高速検索できます。社内文書の意味検索・カスタムRAG・レコメンデーションシステムの構築に必須のツールです。',
    example: '「先月の売上レポートに書いてあった内容」のようなあいまいな検索でも、Pineconeを使えば関連文書を瞬時に見つけられます。',
    analogy: '🧲 磁石のようなもの。キーワードが完全一致しなくても、意味が似ている文書を引き寄せて見つけてくれます。',
  },
  // ===== インフラ・デプロイ =====
  {
    word: 'Docker',
    reading: 'どっかー',
    category: '技術スタック',
    fullName: 'Docker - コンテナ型仮想化プラットフォーム',
    simple: 'アプリを「箱（コンテナ）」に入れて、どんな環境でも同じように動かす技術。',
    detail: '「自分のパソコンでは動くのに本番サーバーでは動かない」という問題を解決します。アプリの動作環境ごとコンテナに詰めて配布するため、環境差異によるバグが発生しません。',
    example: 'LUMINAをDockerコンテナ化すると、開発環境・テスト環境・本番環境で全く同じ動作を保証できます。',
    analogy: '📦 引越し用の梱包箱のようなもの。家具（アプリ）を箱ごと運べば、引越し先（新しいサーバー）でも同じように使えます。',
  },
  {
    word: 'GitHub Actions',
    reading: 'ぎっとはぶあくしょんず',
    category: '技術スタック',
    fullName: 'GitHub Actions - CI/CD自動化ツール',
    simple: 'コードをGitHubにプッシュしたとき、テスト・ビルド・デプロイを自動実行するツール。',
    detail: 'Continuous Integration（継続的統合）とContinuous Deployment（継続的デプロイ）を自動化します。LUMINAはVercelが自動デプロイを担当していますが、テストの自動実行などにGitHub Actionsを追加できます。',
    example: 'コードをプッシュ→GitHub Actionsが自動でテスト実行→全テスト通過→Vercelに自動デプロイ という流れを自動化できます。',
    analogy: '🤖 工場のロボットラインのようなもの。製品（コード）が届いたら、検品（テスト）→梱包（ビルド）→出荷（デプロイ）を全自動でやってくれます。',
  },
  {
    word: 'Cloudflare',
    reading: 'くらうどふれあ',
    category: '技術スタック',
    fullName: 'Cloudflare - CDN・セキュリティ・エッジコンピューティング',
    simple: 'Webサイトを高速化・DDoS攻撃から守るグローバルネットワークサービス。',
    detail: '世界300拠点以上のサーバーを持ち、ユーザーに最も近いサーバーからコンテンツを配信します。DDoS攻撃防御・WAF（Webアプリファイアウォール）・DNSも提供。Cloudflare Workersではサーバーレス関数も実行できます。',
    example: 'xlumina.jpのDNSをCloudflareに移管すると、自動的にDDoS防御・SSL証明書・高速CDNが有効になります。',
    analogy: '🛡️ 城の防衛システムのようなもの。攻撃（DDoS）を城門で防ぎながら、正規の来訪者（ユーザー）には最短ルートで案内します。',
  },
  // ===== テスト =====
  {
    word: 'Vitest',
    reading: 'ばいてすと',
    category: '技術スタック',
    fullName: 'Vitest - Viteベースの高速テストフレームワーク',
    simple: 'コードが正しく動くか自動でチェックするテストツール。Jestの後継として急成長中。',
    detail: 'ユニットテスト（関数単位のテスト）を高速に実行できます。Next.js + TypeScript環境との相性が良く、2025〜2026年のフロントエンドテストの標準になりつつあります。',
    example: '「ライブラリへの保存が成功したか」「APIが正しいデータを返すか」などをVitestで自動テストすると、リリース前のバグを検出できます。',
    analogy: '🔍 品質検査係のようなもの。製品（コード）が出荷（デプロイ）される前に、自動で不良品（バグ）がないかチェックします。',
  },
  {
    word: 'Playwright',
    reading: 'ぷれいらいと',
    category: '技術スタック',
    fullName: 'Playwright - ブラウザ自動テストツール（Microsoft製）',
    simple: '実際にブラウザを操作して、ユーザーの動作をシミュレーションするテストツール。',
    detail: 'ログイン→記事投稿→保存確認のような一連のユーザー操作を自動化してテストできます。Chrome・Firefox・Safariなど複数ブラウザで同時テストが可能。E2E（エンドツーエンド）テストの標準ツールです。',
    example: 'LUMINAの「Web情報収集→ライブラリ保存→確認」という一連の操作をPlaywrightで自動テストすると、リリース前に問題を検出できます。',
    analogy: '🎭 実際にお客さんになりきって店内を歩くミステリーショッパーのようなもの。本物のお客さん（ユーザー）と同じ動きをして、問題がないか確認します。',
  },
  // ===== 監視・分析 =====
  {
    word: 'Sentry',
    reading: 'せんとりー',
    category: '技術スタック',
    fullName: 'Sentry - エラー監視・パフォーマンス追跡サービス',
    simple: '本番環境で起きたエラーを自動検知・通知してくれる監視サービス。',
    detail: 'ユーザーがアプリを使っているときに発生したエラーを自動でキャッチし、エラーの内容・発生場所・ユーザーの操作履歴をSlackやメールで通知します。問題の早期発見・修正に必須のツールです。',
    example: 'LUMINAにSentryを導入すると、ユーザーがエラーを報告しなくても、エラー発生時に自動でSlackに通知が届きます。',
    analogy: '🚨 建物の警備システムのようなもの。不審なこと（エラー）が起きたら即座にアラートを発して、管理者（開発者）に知らせます。',
  },
  {
    word: 'PostHog',
    reading: 'ぽすとほぐ',
    category: '技術スタック',
    fullName: 'PostHog - オープンソース製品分析プラットフォーム',
    simple: 'ユーザーがアプリのどこをクリックしたか・どう使っているかを分析するツール。',
    detail: 'ページビュー・クリック・ユーザーフロー（どの順番でページを移動したか）を記録・分析します。Mixpanelの代替として、自社サーバーにデータを保持できるオープンソース版が特に人気です。',
    example: 'LUMINAで「ユーザーがどの機能を一番使っているか」「どこで離脱しているか」をPostHogで分析して、UX改善に活かせます。',
    analogy: '📊 お店の防犯カメラ＋データ分析のようなもの。お客さんの動き（ユーザー行動）を記録して、どの棚（機能）が人気かを教えてくれます。',
  },
  // ===== UI/UX =====
  {
    word: 'Storybook',
    reading: 'すとーりーぶっく',
    category: '技術スタック',
    fullName: 'Storybook - UIコンポーネント開発・カタログツール',
    simple: 'UIパーツを一覧で確認・テストできるデザインカタログツール。',
    detail: 'ボタン・カード・フォームなどのUIコンポーネントを単独で確認・テストできる開発環境。デザイナーとエンジニアが共通の「UIカタログ」を持てるため、デザインの一貫性が保ちやすくなります。',
    example: 'LUMINAのTipsカード・用語カードなどのコンポーネントをStorybookに登録すると、デザイン変更の影響範囲を一目で確認できます。',
    analogy: '🎨 洋服のカタログのようなもの。実際に着てみなくても（アプリ全体を動かさなくても）、各パーツ（コンポーネント）のデザインを確認できます。',
  },
  {
    word: 'Figma',
    reading: 'ふぃぐま',
    category: '技術スタック',
    fullName: 'Figma - クラウドベースUIデザインツール',
    simple: 'WebアプリのデザインをブラウザやAIと連携して作成できるデザインツール。',
    detail: 'プロのUI/UXデザイナーが使う標準ツール。リアルタイムでチームが共同編集でき、デザインからコードの自動生成（Dev Mode）まで対応。2024年からAI機能も強化されています。',
    example: 'LUMINAの新しいページをFigmaでデザインしてからコーディングすることで、手戻りを防ぎ開発効率が上がります。',
    analogy: '📐 建築の設計図ツールのようなもの。家（アプリ）を建てる前に設計図（デザイン）を作ることで、完成イメージを全員で共有できます。',
  },
  // ===== パッケージ管理 =====
  {
    word: 'pnpm',
    reading: 'ぴーえぬぴーえむ',
    category: '技術スタック',
    fullName: 'pnpm - 高速・省容量パッケージマネージャー',
    simple: 'npmやyarnより高速で容量も少ないパッケージ管理ツール。2025〜2026年で主流化。',
    detail: 'Node.jsのパッケージ（ライブラリ）をインストール・管理するツール。npmと比べてインストール速度が2〜3倍速く、ディスク容量も大幅に節約できます。モノレポ（複数プロジェクト統合管理）との相性も抜群です。',
    example: '`npm install` の代わりに `pnpm install` を使うと、依存関係のインストールが大幅に高速化されます。',
    analogy: '🚀 高速配送サービスのようなもの。通常配送（npm）より速く、荷物（パッケージ）もコンパクトに届けてくれます。',
  },
  // ===== セキュリティ =====
  {
    word: 'Zod',
    reading: 'ぞっど',
    category: '技術スタック',
    fullName: 'Zod - TypeScript用スキーマバリデーションライブラリ',
    simple: 'ユーザーの入力データが正しい形式かチェックするライブラリ。セキュリティに重要。',
    detail: 'フォームの入力値・APIのリクエストデータが正しい形式かを検証します。不正なデータの混入を防ぎ、TypeScriptの型と連携することでフロント・バックで一貫したバリデーションを実現できます。',
    example: 'LUMINAのWeb情報収集フォームで「空のクエリ」「異常に長い文字列」などの不正入力をZodで検証してブロックできます。',
    analogy: '🔍 空港の手荷物検査のようなもの。乗客（データ）が搭乗（処理）する前に、危険物（不正なデータ）が含まれていないかチェックします。',
  },
  {
    word: 'Resend',
    reading: 'りーせんど',
    category: '技術スタック',
    fullName: 'Resend - 開発者向けメール送信API',
    simple: 'トランザクションメール（会員登録・パスワードリセットなど）を簡単に送信できるサービス。',
    detail: '2023年登場の新世代メール送信API。Next.jsとの統合が簡単で、React Emailというライブラリと組み合わせるとHTMLメールをReactコンポーネントで作れます。SendGridの代替として急速に普及中。',
    example: 'LUMINAにResendを導入すると、新規ユーザー登録時のウェルカムメール・定期アラートのメール通知を簡単に実装できます。',
    analogy: '📬 高機能な郵便サービスのようなもの。美しいデザインの手紙（HTMLメール）を、確実に相手（ユーザー）に届けてくれます。',
  },
];

const CATEGORIES = ['すべて', 'AI基礎', 'AI応用', 'ビジネス', '技術用語', 'ツール', '技術スタック'];

export default function GlossaryPage() {
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('すべて');
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const [customTerms, setCustomTerms] = useState<Term[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lumina_glossary') || '[]');
    } catch { return []; }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedTerm, setGeneratedTerm] = useState<Term | null>(null);
  const [generateError, setGenerateError] = useState('');

  const generateTerm = async () => {
    if (!newWord.trim()) return;
    setGenerating(true);
    startProgress();
    setGeneratedTerm(null);
    setGenerateError('');
    try {
      const res = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord }),
      });
      const data = await res.json();
      if (data.term) {
        setGeneratedTerm(data.term);
      } else {
        setGenerateError('解説の生成に失敗しました。もう一度お試しください。');
      }
    } catch {
      setGenerateError('通信エラーが発生しました。');
      resetProgress();
    } finally {
      setGenerating(false);
      completeProgress();
    }
  };

  const saveTerm = (term: Term) => {
    const updated = [...customTerms, term];
    setCustomTerms(updated);
    localStorage.setItem('lumina_glossary', JSON.stringify(updated));
    setGeneratedTerm(null);
    setNewWord('');
    setShowAddForm(false);
  };

  const allTerms = [...TERMS, ...customTerms];
  const filtered = allTerms.filter(t => {
    const matchCat = category === 'すべて' || t.category === category;
    const matchSearch = search === '' ||
      t.word.includes(search) ||
      t.reading.includes(search) ||
      t.simple.includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <ProgressBar loading={progressLoading} progress={progress} label="📘 AI解説生成中..." />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            📘 専門用語解説
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            AI・ビジネス・技術用語をやさしく解説。たとえ話付きで誰でもわかります。
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '8px 16px', background: 'rgba(0,212,184,0.1)',
            border: '1px solid rgba(0,212,184,0.3)', borderRadius: 20,
            color: 'var(--accent-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ＋ 用語を追加
        </button>
      </div>

      {/* AI生成フォーム */}
      {showAddForm && (
        <div style={{
          background: 'rgba(0,212,184,0.05)',
          border: '1px solid rgba(0,212,184,0.2)',
          borderRadius: 12, padding: 20, marginBottom: 20,
        }}>
          <p style={{ fontSize: 14, color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: 12 }}>
            🤖 AIが用語を自動解説
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="調べたい用語を入力（例：ファインチューニング）"
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generateTerm()}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
              }}
            />
            <button
              onClick={generateTerm}
              disabled={generating || !newWord.trim()}
              style={{
                padding: '10px 20px',
                background: generating ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                border: 'none', borderRadius: 8, color: generating ? 'var(--text-muted)' : '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: generating || !newWord.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {generating ? '生成中...' : '🔍 解説を生成'}
            </button>
          </div>

          {generateError && (
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{generateError}</p>
          )}

          {generatedTerm && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-accent)',
              borderRadius: 10, padding: 16, marginTop: 12,
            }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{generatedTerm.word}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>({generatedTerm.reading})</span>
                <span style={{
                  fontSize: 11, color: 'var(--accent)', marginLeft: 8,
                  background: 'var(--accent-soft)', padding: '2px 8px',
                  borderRadius: 99, border: '1px solid var(--border-accent)',
                }}>{generatedTerm.category}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                {generatedTerm.simple}
              </p>
              <div style={{
                background: 'rgba(245,166,35,0.05)', border: '1px solid rgba(245,166,35,0.2)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                  {generatedTerm.analogy}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => saveTerm(generatedTerm)}
                  style={{
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                    border: 'none', borderRadius: 8, color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ✅ 用語集に追加
                </button>
                <button
                  onClick={() => { setGeneratedTerm(null); setNewWord(''); }}
                  style={{
                    padding: '8px 18px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 検索 */}
      <input
        type="text"
        placeholder="🔍 用語を検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '12px 16px', marginBottom: 16,
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: 10, color: 'var(--text-primary)', fontSize: 14,
          boxSizing: 'border-box',
        }}
      />

      {/* カテゴリフィルター */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: category === cat
                ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                : 'rgba(255,255,255,0.05)',
              color: category === cat ? '#fff' : 'var(--text-muted)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 件数 */}
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {filtered.length}件の用語
      </p>

      {/* 用語カード一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(term => (
          <div
            key={term.word}
            style={{
              background: openTerm === term.word
                ? 'rgba(108,99,255,0.08)'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${openTerm === term.word
                ? 'var(--border-accent)'
                : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 12, overflow: 'hidden',
            }}
          >
            {/* カードヘッダー */}
            <div
              onClick={() => setOpenTerm(openTerm === term.word ? null : term.word)}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {term.word}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                    ({term.reading})
                  </span>
                  {term.fullName && (
                    <div style={{
                      fontSize: 11, color: 'var(--accent-secondary)', marginTop: 3,
                      fontStyle: 'italic',
                    }}>
                      📝 {term.fullName}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 11, color: 'var(--accent)',
                  background: 'var(--accent-soft)',
                  padding: '2px 8px', borderRadius: 99,
                  border: '1px solid var(--border-accent)',
                  whiteSpace: 'nowrap',
                }}>
                  {term.category}
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {openTerm === term.word ? '▲' : '▼'}
              </span>
            </div>

            {/* 一言説明（常時表示） */}
            <div style={{ padding: '0 18px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '10px 0 0' }}>
                {term.simple}
              </p>
            </div>

            {/* 詳細（展開時のみ） */}
            {openTerm === term.word && (
              <div style={{
                padding: '16px 18px',
                borderTop: '1px solid var(--accent-soft)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
                    📝 詳しい説明
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0 }}>
                    {term.detail}
                  </p>
                </div>
                <div style={{
                  background: 'rgba(0,212,184,0.05)',
                  border: '1px solid rgba(0,212,184,0.2)',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: 4 }}>
                    💡 具体例
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    {term.example}
                  </p>
                </div>
                <div style={{
                  background: 'rgba(245,166,35,0.05)',
                  border: '1px solid rgba(245,166,35,0.2)',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 11, color: '#f5a623', fontWeight: 700, marginBottom: 4 }}>
                    🎯 たとえ話
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    {term.analogy}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
