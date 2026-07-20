import { auth } from '@/lib/auth';
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';
import TipsSection from '@/components/TipsSection';
import { BriefingSection } from '@/components/BriefingSection';
import { DashboardStats } from '@/components/DashboardStats';
import { WeeklyReportButton } from '@/components/WeeklyReportButton';
import { DashboardCustomize } from '@/components/DashboardCustomize';
import ShortcutBar from '@/components/ShortcutBar';
import StudioProgressCards from '@/components/StudioProgressCards';

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  let draftCount = 0;
  let libCount = 0;
  let recentDrafts: any[] = [];
  let monthlyUsage: { total_cost_jpy: number; total_calls: number } | null = null;
  let last7Days: Array<{ date: string; cost_jpy: number }> = [];

  if (userId) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const dc = await sql`SELECT COUNT(*) as c FROM drafts WHERE user_id = ${userId}`;
      draftCount = dc[0]?.c || 0;
      const lc = await sql`SELECT COUNT(*) as c FROM library WHERE user_id = ${userId}`;
      libCount = lc[0]?.c || 0;
      recentDrafts = await sql`SELECT * FROM drafts WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 3`;
      // 今月のAPI使用量
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const usageRows = await sql`
        SELECT
          COALESCE(SUM(cost_jpy), 0) AS total_cost_jpy,
          COUNT(*) AS total_calls
        FROM api_usage_logs
        WHERE user_id = ${userId}
          AND recorded_at >= ${start}
          AND recorded_at < ${end}
      `;
      const row = usageRows[0];
      const totalCostJpy = parseInt(String(row?.total_cost_jpy ?? 0), 10) || 0;
      const totalCalls = parseInt(String(row?.total_calls ?? 0), 10) || 0;
      if (totalCostJpy > 0 || totalCalls > 0) {
        monthlyUsage = { total_cost_jpy: totalCostJpy, total_calls: totalCalls };
      }
      // 直近7日分（ミニグラフ用、日付ゼロ埋め）
      const last7Rows = await sql`
        SELECT
          TO_CHAR(DATE(recorded_at AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM-DD') AS date,
          SUM(cost_jpy) AS cost_jpy
        FROM api_usage_logs
        WHERE user_id = ${userId}
          AND recorded_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(recorded_at AT TIME ZONE 'Asia/Tokyo')
        ORDER BY date ASC
      `;
      const map = new Map<string, number>();
      for (const r of last7Rows) {
        const d = String((r as any).date ?? '');
        const c = parseInt(String((r as any).cost_jpy ?? 0), 10) || 0;
        if (d) map.set(d, c);
      }
      // 過去6日〜今日（合計7日）をゼロ埋めで生成
      const today = new Date();
      last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { date: key, cost_jpy: map.get(key) ?? 0 };
      });
    } catch {}
  }

  const cards = [
    { icon: '🧠', title: 'Intelligence Hub', desc: 'ニュース・SNS・市場・学術を統合収集', href: '/dashboard/intelligence', borderColor: 'var(--accent-soft)' },
    { icon: '🧩', title: 'AI分析エンジン', desc: 'SWOT・仮説・トレンド・競合分析', href: '/dashboard/analysis', borderColor: '#f5a62325' },
    { icon: '💼', title: '経営インテリジェンス', desc: 'MVV・採用・人材育成・ブランド戦略', href: '/dashboard/strategy', borderColor: '#4ade8025' },
    { icon: '✍️', title: '文章作成', desc: 'ブログ・note・小説・出版用文章を生成', href: '/dashboard/write', borderColor: '#00d4b825' },
    { icon: '🔬', title: '文献検索', desc: 'Semantic Scholarで1.38億件の論文を検索', href: '/dashboard/research', borderColor: '#a89fff25' },
    { icon: '📚', title: 'リサーチ保存', desc: '保存した調査・分析・文章を管理', href: '/dashboard/library', borderColor: '#f8717125' },
    { icon: '📊', title: 'LP自動生成', desc: 'PASONA/AIDA法則でLP全文を生成', href: '/dashboard/lp-generator', borderColor: '#6c63ff25' },
    { icon: '🏠', title: 'HP内容生成', desc: '企業情報→HP全セクションを一括生成', href: '/dashboard/hp-generator', borderColor: '#00d4b825' },
    { icon: '🎨', title: '画像プロンプト', desc: 'Midjourney/SD向け最適プロンプト', href: '/dashboard/image-prompt', borderColor: '#f5a62325' },
    { icon: '📋', title: '資料プロンプト', desc: 'スライド別AIプロンプトを自動生成', href: '/dashboard/doc-prompt', borderColor: '#8b5cf625' },
    { icon: '📝', title: 'テキスト分析', desc: '複数観点で同時分析・カテゴリ保存', href: '/dashboard/text-analysis', borderColor: '#3b82f625' },
  ];

  const modeLabel: Record<string, string> = {
    blog: '📝 ブログ', note: '✏️ note', novel: '📖 小説',
    guide: '📚 解説本', publish: '🗞️ 出版用', social: '📱 SNS', report: '📊 レポート'
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>ダッシュボード</h1>
        <p style={{ color: 'var(--text-muted)' }}>おかえりなさい、{session?.user?.name}さん 👋</p>
      </div>

      {/* ショートカットバー（カスタマイズ可能） */}
      <ShortcutBar />

      {/* 今月のAPI使用料サマリー（記録がある月のみ表示） */}
      {monthlyUsage && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            📊 今月のAPI使用料
          </div>
          {/* 直近7日のミニスパークライン */}
          {last7Days.some((d) => d.cost_jpy > 0) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 3,
                height: 28,
              }}
              title={last7Days
                .map((d) => `${d.date}: ¥${d.cost_jpy.toLocaleString()}`)
                .join('\n')}
            >
              {(() => {
                const maxJpy = Math.max(
                  ...last7Days.map((d) => d.cost_jpy),
                  1,
                );
                return last7Days.map((day) => {
                  const h =
                    day.cost_jpy > 0
                      ? Math.max((day.cost_jpy / maxJpy) * 24, 3)
                      : 2;
                  return (
                    <div
                      key={day.date}
                      style={{
                        width: 6,
                        height: h,
                        background: day.cost_jpy > 0 ? '#4f46e5' : '#e5e7eb',
                        borderRadius: 2,
                        opacity: day.cost_jpy > 0 ? 0.85 : 0.4,
                      }}
                    />
                  );
                });
              })()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>合計 </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#4f46e5' }}>
                ¥{monthlyUsage.total_cost_jpy.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {monthlyUsage.total_calls.toLocaleString()}回の呼び出し
            </div>
            <Link
              href="/dashboard/api-usage"
              style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'none' }}
            >
              詳細を見る →
            </Link>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BriefingSection />
      </div>
      <div style={{ marginBottom: 16 }}><WeeklyReportButton /></div>

      {/* 今日のサマリー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: '⚡ クイックアクション', accent: '#378ADD', items: [
            { icon: '🏆', text: '競合分析を実行', href: '/dashboard/workflow' },
            { icon: '📓', text: 'note記事を検索', href: '/dashboard/note' },
            { icon: '📝', text: '議事録を整理', href: '/dashboard/minutes' },
          ]},
          { label: '🕐 最近使った機能', accent: '#1D9E75', items: [
            { icon: '🌐', text: 'Web情報収集', href: '/dashboard/websearch' },
            { icon: '🔭', text: 'ディープリサーチ', href: '/dashboard/deepresearch' },
            { icon: '🧩', text: 'AI分析エンジン', href: '/dashboard/analysis' },
          ]},
          { label: '💡 今日のおすすめ', accent: '#EF9F27', items: [
            { icon: '📊', text: '業界レポートを作成', href: '/dashboard/industry' },
            { icon: '💡', text: 'ブレストを実施', href: '/dashboard/brainstorm' },
            { icon: '⚡', text: 'ワークフローを試す', href: '/dashboard/workflow' },
          ]},
        ].map(card => (
          <div key={card.label} style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `3px solid ${card.accent}`, transition: 'background 0.15s' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>{card.label}</div>
            {card.items.map(item => (
              <Link key={item.text} href={item.href} className="dash-action-link" style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', padding: '6px 8px', margin: '0 -8px', borderRadius: 6, textDecoration: 'none' }}>
                {item.icon} {item.text}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* 統計カード（6枚・クリッカブル） */}
      <DashboardStats />

      {/* 3スタジオ＋リサーチ進捗 */}
      <StudioProgressCards />

      {/* クイックスタート */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>クイックスタート</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {cards.map(card => (
            <Link key={card.href} href={card.href} style={{ background: 'var(--bg-card)', border: `1px solid ${card.borderColor}`, borderRadius: 14, padding: 22, textDecoration: 'none', display: 'block', transition: 'border-color 0.2s' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{card.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* 最近の下書き */}
      {recentDrafts.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>最近の下書き</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentDrafts.map((d: any) => (
              <Link key={d.id} href="/dashboard/write" style={{ background: 'var(--bg-card)', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>{modeLabel[d.mode]?.split(' ')[0] || '✍️'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e0e0f0' }}>{d.title || '無題'}</div>
                    <div style={{ fontSize: 11, color: '#5a5a7a', fontFamily: 'monospace' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString('ja-JP') : ''}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>{modeLabel[d.mode] || '文章'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* ワークフローガイド */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>推奨ワークフロー</div>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          {[
            { step: '1', title: '情報収集', desc: 'Web情報収集・ディープリサーチ', color: 'var(--accent)', bgColor: 'var(--accent-soft)', borderColor: 'var(--border-accent)', icon: '🌐' },
            { step: '2', title: '文献確認', desc: '学術論文で裏付けを取る', color: '#00d4b8', bgColor: '#00d4b810', borderColor: '#00d4b825', icon: '🔬' },
            { step: '3', title: '文章生成', desc: 'Claude AIで高品質な文章を作成', color: '#f5a623', bgColor: '#f5a62310', borderColor: '#f5a62325', icon: '✍️' },
          ].map((w, i) => (
            <div key={w.step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '14px 16px', borderRadius: 10, background: w.bgColor, border: `1px solid ${w.borderColor}` }}>
                <div style={{ fontSize: 11, color: w.color, fontFamily: 'monospace', marginBottom: 4 }}>STEP {w.step}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{w.icon} {w.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.desc}</div>
              </div>
              {i < 2 && <div style={{ padding: '0 8px', color: '#3a3a5a', fontSize: 18 }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      <TipsSection />
    </div>
  );
}
