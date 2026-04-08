'use client';
import { useState } from 'react';

type Step = { text: string; };
type FAQ = { q: string; a: string; };

type Section = {
  id: string;
  title: string;
  emoji: string;
  tagline: string;
  forWho: string;
  content: string;
  steps: Step[];
  inputExample?: string;
  tips: string[];
  faqs?: FAQ[];
};

const sections: Section[] = [
  {
    id: 'overview',
    title: 'xLUMINAとは？',
    emoji: '🌟',
    tagline: 'AIがあなたの「頭脳」になる',
    forWho: '初めてxLUMINAを使う方・全員',
    content: `xLUMINAは、AIを使って「情報収集→分析→文章作成」をまとめてやってくれるツールです。\n\nたとえば「競合他社を調べて、自社の戦略をまとめて、提案書を書く」という3時間かかる作業が、xLUMINAなら15分でできます。`,
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
    faqs: [
      { q: '無料で全機能使えますか？', a: '基本機能は無料で使えます。より高度な機能はProプラン（月額¥2,980）をご検討ください。' },
      { q: 'AIが間違えることはありますか？', a: 'あります。特に数字・固有名詞・最新情報は必ず出典を確認しましょう。xLUMINAは出典URLも一緒に表示します。' },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence Hub',
    emoji: '🧠',
    tagline: '8つの目でニュース・SNS・市場を同時監視',
    forWho: '競合調査・市場調査をしたい方、トレンドを把握したい方',
    content: `ニュース・SNS・市場・学術・Web・組織人材・マーケ・採用HRの8つのモードで、目的に合った情報を一気に集められます。\n\nGoogleで何十回も検索する代わりに、1回の操作でまとまった情報が手に入ります。`,
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
    steps: [
      { text: '「ディープリサーチ」を開く' },
      { text: '調査テーマを具体的に入力する（後述の例を参考に）' },
      { text: '深度を選ぶ（急ぎなら1、重要な判断なら3）' },
      { text: '調査開始（深度3は数分かかります）' },
      { text: '結果をライブラリに保存→AI分析エンジンに渡す' },
    ],
    inputExample: '❌ 悪い例：「AI市場」（漠然としすぎ）\n✅ 良い例：「2026年 日本 医療AIスタートアップ 資金調達 動向」\n✅ 良い例：「Next.js 15 vs Remix パフォーマンス比較 実務」',
    tips: [
      'テーマは具体的に書くほど精度が上がります。業界・年・地域・目的を入れましょう',
      '深度3は時間がかかりますが、投資判断など重要な場面でしか使わないようにしましょう',
      '結果が出たらAI分析エンジンのSWOT分析に渡すと、すぐ戦略立案に使えます',
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
    content: `SWOT・仮説・トレンド・アクション・コンテンツ・競合の6種類の分析ができます。\n\n「なんとなく感じていること」を入力すると、AIが論理的に整理してくれます。`,
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
    ],
    faqs: [
      { q: 'どの分析タイプを選べばいいですか？', a: '新規事業や戦略検討ならSWOT、競合を調べるなら競合分析、次の行動を決めたいならアクション分析がおすすめです。' },
    ],
  },
  {
    id: 'write',
    title: '文章作成',
    emoji: '✍️',
    tagline: 'ブログ・SNS・提案書・小説まで14モードで一発生成',
    forWho: '文章を書くのが苦手な方・コンテンツを量産したい方・時間を節約したい方',
    content: `ブログ・note・SNS・画像プロンプト・小説・解説本など14種類の文章をAIが書いてくれます。\n\n「何を書けばいいかわからない」という状態でも、テーマだけ入れれば構成から本文まで全部作ってくれます。`,
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
    ],
    faqs: [
      { q: 'AIが作った採用基準や戦略は信頼できますか？', a: 'あくまで「たたき台」として使いましょう。AIの提案を土台に、あなたの経験や会社の状況に合わせて修正することで、より精度の高いものになります。' },
    ],
  },
  {
    id: 'library',
    title: 'ライブラリ',
    emoji: '📚',
    tagline: '調査・分析・文章をすべて一元管理',
    forWho: '情報を整理したい方・過去の調査を再利用したい方',
    content: `Web情報収集・分析・文章の結果を全部ここに保存できます。\n\nタグ・グループ・お気に入りで整理でき、後から検索して見直せます。「あの調査どこだっけ」という状況がなくなります。`,
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
    ],
    faqs: [
      { q: '保存できるデータ量に制限はありますか？', a: '現時点では制限を設けていません。ただし大量のデータが蓄積されると表示が遅くなる場合があります。' },
    ],
  },
  {
    id: 'workflow',
    title: '最強ワークフロー',
    emoji: '🚀',
    tagline: '機能を組み合わせると効果が10倍になる',
    forWho: 'xLUMINAを使いこなしたい方・業務を大幅に効率化したい方',
    content: `各機能を単独で使うより、組み合わせて使うほうが圧倒的に効果が出ます。\n\nよく使われる4つのワークフローを紹介します。`,
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
    ],
    faqs: [
      { q: 'どのワークフローから始めればいいですか？', a: '「コンテンツ制作」のワークフローが一番シンプルで始めやすいです。Intelligence Hub → Web情報収集 → 文章作成の3ステップだけで完結します。' },
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
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
          📖 xLUMINA 活用ガイド
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
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
              color: activeSection === s.id ? '#fff' : 'var(--text-muted)',
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
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
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
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 24,
        }}>
          {current.content.split('\n\n').map((para, i) => (
            <p key={i} style={{
              color: '#c0c0d8', lineHeight: 1.85, fontSize: 14,
              margin: i > 0 ? '12px 0 0' : 0,
            }}>
              {para}
            </p>
          ))}
        </div>

        {/* ステップ */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
            📋 使い方ステップ
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-soft)',
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
                <p style={{ color: '#c0c0d8', lineHeight: 1.7, margin: 0, fontSize: 13 }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 入力例 */}
        {current.inputExample && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
              💬 入力例（コピーして使えます）
            </h3>
            <div style={{
              background: 'rgba(0,212,184,0.05)',
              border: '1px solid rgba(0,212,184,0.2)',
              borderRadius: 10, padding: '14px 18px',
            }}>
              {current.inputExample.split('\n').map((line, i) => (
                <p key={i} style={{
                  fontSize: 13, color: '#a0e0d8', lineHeight: 1.8,
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
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
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
                <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, margin: 0 }}>
                  {tip}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* よくある質問 */}
        {current.faqs && current.faqs.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
              ❓ よくある質問
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {current.faqs.map((faq, i) => {
                const key = `${activeSection}-${i}`;
                return (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, overflow: 'hidden',
                  }}>
                    <div
                      onClick={() => setOpenFaq(openFaq === key ? null : key)}
                      style={{
                        padding: '12px 16px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <p style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600, margin: 0 }}>
                        Q. {faq.q}
                      </p>
                      <span style={{ color: '#5a5a7a', fontSize: 12, marginLeft: 12 }}>
                        {openFaq === key ? '▲' : '▼'}
                      </span>
                    </div>
                    {openFaq === key && (
                      <div style={{
                        padding: '0 16px 14px',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <p style={{ fontSize: 13, color: '#9090b8', lineHeight: 1.7, margin: '12px 0 0' }}>
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
