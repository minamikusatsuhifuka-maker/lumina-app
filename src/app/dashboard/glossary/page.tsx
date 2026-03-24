'use client';
import { useState } from 'react';

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
];

const CATEGORIES = ['すべて', 'AI基礎', 'AI応用', 'ビジネス', '技術用語', 'ツール', '技術スタック'];

export default function GlossaryPage() {
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
    } finally {
      setGenerating(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
            📘 専門用語解説
          </h1>
          <p style={{ color: '#7878a0' }}>
            AI・ビジネス・技術用語をやさしく解説。たとえ話付きで誰でもわかります。
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '8px 16px', background: 'rgba(0,212,184,0.1)',
            border: '1px solid rgba(0,212,184,0.3)', borderRadius: 20,
            color: '#00d4b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
          <p style={{ fontSize: 14, color: '#00d4b8', fontWeight: 700, marginBottom: 12 }}>
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
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, color: '#e0e0f0', fontSize: 13,
              }}
            />
            <button
              onClick={generateTerm}
              disabled={generating || !newWord.trim()}
              style={{
                padding: '10px 20px',
                background: generating ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                border: 'none', borderRadius: 8, color: generating ? '#5a5a7a' : '#fff',
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
              border: '1px solid rgba(108,99,255,0.3)',
              borderRadius: 10, padding: 16, marginTop: 12,
            }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#f0f0ff' }}>{generatedTerm.word}</span>
                <span style={{ fontSize: 12, color: '#7878a0', marginLeft: 8 }}>({generatedTerm.reading})</span>
                <span style={{
                  fontSize: 11, color: '#6c63ff', marginLeft: 8,
                  background: 'rgba(108,99,255,0.15)', padding: '2px 8px',
                  borderRadius: 99, border: '1px solid rgba(108,99,255,0.3)',
                }}>{generatedTerm.category}</span>
              </div>
              <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, marginBottom: 10 }}>
                {generatedTerm.simple}
              </p>
              <div style={{
                background: 'rgba(245,166,35,0.05)', border: '1px solid rgba(245,166,35,0.2)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              }}>
                <p style={{ fontSize: 12, color: '#c0c0d8', lineHeight: 1.7, margin: 0 }}>
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
                    color: '#7878a0', fontSize: 13, cursor: 'pointer',
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
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, color: '#e0e0f0', fontSize: 14,
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
              color: category === cat ? '#fff' : '#7878a0',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 件数 */}
      <p style={{ fontSize: 13, color: '#5a5a7a', marginBottom: 16 }}>
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
                ? 'rgba(108,99,255,0.3)'
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
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f0ff' }}>
                    {term.word}
                  </span>
                  <span style={{ fontSize: 12, color: '#7878a0', marginLeft: 8 }}>
                    ({term.reading})
                  </span>
                  {term.fullName && (
                    <div style={{
                      fontSize: 11, color: '#00d4b8', marginTop: 3,
                      fontStyle: 'italic',
                    }}>
                      📝 {term.fullName}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 11, color: '#6c63ff',
                  background: 'rgba(108,99,255,0.15)',
                  padding: '2px 8px', borderRadius: 99,
                  border: '1px solid rgba(108,99,255,0.3)',
                  whiteSpace: 'nowrap',
                }}>
                  {term.category}
                </span>
              </div>
              <span style={{ color: '#5a5a7a', fontSize: 12 }}>
                {openTerm === term.word ? '▲' : '▼'}
              </span>
            </div>

            {/* 一言説明（常時表示） */}
            <div style={{ padding: '0 18px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, margin: '10px 0 0' }}>
                {term.simple}
              </p>
            </div>

            {/* 詳細（展開時のみ） */}
            {openTerm === term.word && (
              <div style={{
                padding: '16px 18px',
                borderTop: '1px solid rgba(108,99,255,0.15)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6c63ff', fontWeight: 700, marginBottom: 6 }}>
                    📝 詳しい説明
                  </div>
                  <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.8, margin: 0 }}>
                    {term.detail}
                  </p>
                </div>
                <div style={{
                  background: 'rgba(0,212,184,0.05)',
                  border: '1px solid rgba(0,212,184,0.2)',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 11, color: '#00d4b8', fontWeight: 700, marginBottom: 4 }}>
                    💡 具体例
                  </div>
                  <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, margin: 0 }}>
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
                  <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, margin: 0 }}>
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
