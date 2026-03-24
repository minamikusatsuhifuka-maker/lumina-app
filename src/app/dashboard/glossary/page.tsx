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
};

const TERMS: Term[] = [
  {
    word: 'AI（人工知能）',
    reading: 'エーアイ',
    category: 'AI基礎',
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
    simple: '大量の文章を学習した、会話や文章作成が得意なAIモデルのこと。',
    detail: 'Large Language Model（大規模言語モデル）の略。GPT-4やClaudeなどがLLMです。インターネット上の膨大なテキストを学習しており、自然な文章の生成や理解が得意です。',
    example: 'LUMINAはClaude（Anthropic社のLLM）を使って文章生成や分析を行っています。',
    analogy: '📚 何億冊もの本を読んだ図書館員のようなもの。どんな質問にも答えられる知識量を持っています。',
  },
  {
    word: 'API',
    reading: 'えーぴーあい',
    category: '技術用語',
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
    simple: 'AIが外部の情報を検索してから回答する技術のこと。',
    detail: 'Retrieval-Augmented Generation（検索拡張生成）の略。AIの知識は学習時点で止まっているため、最新情報をリアルタイムで検索して回答に組み込む仕組みです。LUMINAのWeb情報収集機能がRAGの一種です。',
    example: 'LUMINAが「2026年のAIトレンド」を検索して回答するとき、RAGの仕組みを使っています。',
    analogy: '📰 試験前に教科書（学習済み知識）だけでなく、最新の新聞（Web検索）も参照してから答える学生のようなもの。',
  },
  {
    word: 'SWOT分析',
    reading: 'すわっとぶんせき',
    category: 'ビジネス',
    simple: '会社や事業の「強み・弱み・機会・脅威」を整理する分析フレームワーク。',
    detail: 'Strengths（強み）・Weaknesses（弱み）・Opportunities（機会）・Threats（脅威）の頭文字。新規事業の検討や競合分析に広く使われます。LUMINAのAI分析エンジンで自動生成できます。',
    example: '新しいサービスを始める前に「競合より優れている点は？」「市場の追い風は？」を整理するのに使います。',
    analogy: '⚽ サッカーの試合前分析のようなもの。自チームの得意プレー（強み）、苦手な守備（弱み）、相手の弱点（機会）、相手エースFW（脅威）を整理して戦略を立てます。',
  },
  {
    word: 'MVV',
    reading: 'えむぶいぶい',
    category: 'ビジネス',
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
];

const CATEGORIES = ['すべて', 'AI基礎', 'AI応用', 'ビジネス', '技術用語', 'ツール'];

export default function GlossaryPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('すべて');
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const filtered = TERMS.filter(t => {
    const matchCat = category === 'すべて' || t.category === category;
    const matchSearch = search === '' ||
      t.word.includes(search) ||
      t.reading.includes(search) ||
      t.simple.includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
          📖 専門用語解説
        </h1>
        <p style={{ color: '#7878a0' }}>
          AI・ビジネス・技術用語をやさしく解説。たとえ話付きで誰でもわかります。
        </p>
      </div>

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
                </div>
                <span style={{
                  fontSize: 11, color: '#6c63ff',
                  background: 'rgba(108,99,255,0.15)',
                  padding: '2px 8px', borderRadius: 99,
                  border: '1px solid rgba(108,99,255,0.3)',
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
