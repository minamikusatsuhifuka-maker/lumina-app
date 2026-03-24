'use client';
import { useState } from 'react';

const sections = [
  {
    id: 'overview',
    title: '🌟 LUMINAとは',
    content: `LUMINAは、AIを活用したビジネスインテリジェンスプラットフォームです。
Web情報収集・市場分析・文章作成・経営戦略立案まで、あらゆる知的作業をAIが支援します。`,
    tips: [
      '毎朝ダッシュボードを確認して、定期アラートの最新情報をチェックする習慣をつけましょう',
      '各機能は連携して使うと効果倍増。Web情報収集→AI分析エンジン→文章作成の流れが最強です',
    ],
  },
  {
    id: 'intelligence',
    title: '🧠 Intelligence Hub 活用法',
    content: `8つのモード（ニュース/SNS/市場/学術/Web/組織・人材/マーケ/採用HR）で情報を収集します。`,
    tips: [
      '「SNSモード」で競合他社名を検索すると、リアルタイムの評判・話題を把握できます',
      '「学術モード」で業界キーワードを検索し、最新研究を経営判断の根拠に活用しましょう',
      '毎週月曜に「市場モード」で業界トレンドを確認するルーティンが効果的です',
    ],
  },
  {
    id: 'analysis',
    title: '🧩 AI分析エンジン 活用法',
    content: `SWOT・仮説・トレンド・アクション・コンテンツ・競合の6種類の分析が可能です。`,
    tips: [
      'Intelligence Hubで収集した情報をそのまま分析エンジンに貼り付けると、深い洞察が得られます',
      'SWOT分析は新規事業検討時に必ず実施。「機会」と「脅威」に特に注目しましょう',
      '競合分析は相手企業名＋業界名をセットで入力すると精度が上がります',
    ],
  },
  {
    id: 'websearch',
    title: '🌐 Web情報収集 活用法',
    content: `ClaudeがリアルタイムでWebを検索し、出典付きで情報をまとめます。`,
    tips: [
      '「最近1週間」フィルターを使うと、バズっている最新トピックだけを収集できます',
      '検索後に「📚 ライブラリに保存」で重要な調査結果をストックしましょう',
      '「詳細（4000トークン）」モードは重要な意思決定前の深掘り調査に使いましょう',
      '過去に登場した「📌 過去に登場」バッジ付きURLは信頼性が高い情報源の目印です',
    ],
  },
  {
    id: 'deepresearch',
    title: '🔭 ディープリサーチ 活用法',
    content: `3段階の深度で徹底的な調査を行います。重要な意思決定前に活用しましょう。`,
    tips: [
      '深度3（最大）は時間がかかりますが、投資判断・新規事業立案など重要な場面で使いましょう',
      'テーマは具体的に。「AI活用」より「製造業でのAI活用による生産効率化事例2026年」のほうが精度が高まります',
    ],
  },
  {
    id: 'write',
    title: '✍️ 文章作成 活用法',
    content: `ブログ・note・SNS・画像プロンプトなど14モードで文章を生成します。`,
    tips: [
      'Web情報収集やディープリサーチの結果を「文章作成に使う」ボタンで引き継ぐと、根拠ある記事が書けます',
      'SNSモードは複数パターンを生成させて、一番刺さるものを選ぶ使い方が効果的です',
      '「画像プロンプト」モードはMidjourney・DALL-Eと組み合わせると、コンテンツ制作が高速化します',
    ],
  },
  {
    id: 'strategy',
    title: '💼 経営インテリジェンス 活用法',
    content: `MVV・マーケ戦略・ブランド・採用・人材育成・組織設計の7種類の経営支援機能です。`,
    tips: [
      '新しいメンバーのオンボーディングに「MVV」機能で会社理念を整理した資料を作成しましょう',
      '採用面接前に「採用」モードで質問リストを生成すると、漏れのない面接ができます',
    ],
  },
  {
    id: 'library',
    title: '📚 ライブラリ 活用法',
    content: `調査・分析・文章をすべて一元管理。タグ・グループ・お気に入りで整理できます。`,
    tips: [
      'グループ機能でプロジェクト別に整理すると、チームでの情報共有がスムーズになります',
      '重要な調査結果は必ず★お気に入りに登録。次回アクセスが素早くなります',
      '.md形式で保存すると、NotionやObsidianへの転用が簡単です',
    ],
  },
  {
    id: 'workflow',
    title: '🚀 最強ワークフロー',
    content: `各機能を組み合わせた、最も効果的な使い方のパターンです。`,
    tips: [
      '【新規事業検討】Web情報収集（市場調査）→ディープリサーチ（深掘り）→AI分析（SWOT）→経営インテリジェンス（事業計画）→文章作成（提案書）',
      '【コンテンツ制作】Intelligence Hub（トレンド把握）→Web情報収集（最新情報）→文章作成（記事）→Gensparkへ出力（スライド化）',
      '【競合分析】Web情報収集（競合情報）→AI分析エンジン（競合分析）→経営インテリジェンス（差別化戦略）→ライブラリ（保存）',
      '【採用強化】経営インテリジェンス（採用戦略）→文章作成（求人票）→AI分析（候補者評価基準）',
    ],
  },
];

export default function GuidePage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 60px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
          📖 LUMINA 活用ガイド
        </h1>
        <p style={{ color: '#7878a0' }}>
          LUMINAを最大限に活用するための完全ガイドです
        </p>
      </div>

      {/* タブナビゲーション */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32,
        borderBottom: '1px solid rgba(130,140,255,0.15)', paddingBottom: 16,
      }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: activeSection === s.id
                ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)'
                : 'rgba(255,255,255,0.05)',
              color: activeSection === s.id ? '#fff' : '#7878a0',
            }}
          >
            {s.title.split(' ')[0]} {s.title.split(' ').slice(1).join(' ')}
          </button>
        ))}
      </div>

      {/* セクション本文 */}
      {sections.filter(s => s.id === activeSection).map(s => (
        <div key={s.id}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f0f0ff', marginBottom: 12 }}>
            {s.title}
          </h2>
          <p style={{ color: '#c0c0d8', lineHeight: 1.8, marginBottom: 28, fontSize: 15 }}>
            {s.content}
          </p>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#a89fff', marginBottom: 16 }}>
            💡 活用Tips
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {s.tips.map((tip, i) => (
              <div key={i} style={{
                background: 'rgba(108,99,255,0.06)',
                border: '1px solid rgba(108,99,255,0.2)',
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{
                  minWidth: 24, height: 24, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
                }}>
                  {i + 1}
                </span>
                <p style={{ color: '#c0c0d8', lineHeight: 1.7, margin: 0, fontSize: 14 }}>
                  {tip}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
