import { neon } from '@neondatabase/serverless';
import Link from 'next/link';

const LEAD_QUOTES = [
  '「スタッフに指示する前に、まず問いかけを。『あなたはどう思う？』が自律を育てます。」',
  '「承認と感謝は先払いで。見返りを求めない関わりが、チームの信頼を深めます。」',
  '「失敗を責めるより、『次はどうする？』を一緒に考える。それがリードマネジメントです。」',
  '「スタッフの成長は、院長の関わり方の鏡。今日、誰かの可能性を信じましたか？」',
  '「ルールで縛るより、理念を語る。なぜこのクリニックで働くのか、共に問い続けましょう。」',
  '「強みを見つけて言葉にする。それだけで人は変わります。今日、誰かの強みを伝えてください。」',
  '「小さな変化に気づき、声をかける。その一言がスタッフの一日を変えることがあります。」',
];

export default async function AdminDashboardPage() {
  const sql = neon(process.env.DATABASE_URL!);

  const [
    staffRows, evalRows, pendingApprovalRows,
    thisMonthMeetingRows, applicantRows,
    pendingOneOnOneRows, gradeDistRows,
    stageUpRows, nearMissUnreadRows,
  ] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM staff WHERE status = 'active'`.catch(() => [{ count: 0 }]),
    sql`SELECT COUNT(*) as count FROM staff_evaluations`.catch(() => [{ count: 0 }]),
    sql`SELECT se.staff_name, se.recommended_grade
        FROM staff_evaluations se
        WHERE se.promotion_approved = false
        AND se.recommended_grade IS NOT NULL
        ORDER BY se.updated_at DESC LIMIT 3`.catch(() => []),
    sql`SELECT COUNT(*) as count FROM one_on_one_meetings
        WHERE created_at >= date_trunc('month', NOW())`.catch(() => [{ count: 0 }]),
    sql`SELECT COUNT(*) as count FROM applicants`.catch(() => [{ count: 0 }]),
    sql`SELECT s.name FROM staff s
        WHERE s.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM one_on_one_meetings m
          WHERE m.staff_name = s.name
          AND m.meeting_date >= NOW() - INTERVAL '30 days'
        ) LIMIT 3`.catch(() => []),
    // 等級別・職種別集計
    sql`SELECT
          gl.level_number,
          gl.position,
          COUNT(s.id) as count
        FROM grade_levels gl
        LEFT JOIN staff s ON s.current_grade_id = gl.id AND s.status = 'active'
        GROUP BY gl.level_number, gl.position
        ORDER BY gl.level_number ASC, gl.position ASC`.catch(() => []),
    // 今月の成長ステージアップを検知
    sql`
      WITH ranked AS (
        SELECT staff_name, growth_stage, meeting_date,
          ROW_NUMBER() OVER (PARTITION BY staff_name ORDER BY meeting_date ASC) as rn_asc,
          ROW_NUMBER() OVER (PARTITION BY staff_name ORDER BY meeting_date DESC) as rn_desc
        FROM one_on_one_meetings
        WHERE meeting_date >= date_trunc('month', NOW())
        AND growth_stage IS NOT NULL
      )
      SELECT a.staff_name, a.growth_stage as from_stage, b.growth_stage as to_stage
      FROM ranked a
      JOIN ranked b ON a.staff_name = b.staff_name
      WHERE a.rn_asc = 1 AND b.rn_desc = 1
      AND a.growth_stage != b.growth_stage
      LIMIT 3
    `.catch(() => []),
    // ヒヤリハット未読件数
    sql`SELECT COUNT(*) as count FROM near_miss_reports WHERE is_read = false`.catch(() => [{ count: 0 }]),
  ]);

  const staffCount = Number(staffRows[0]?.count || 0);
  const thisMonthMeetings = Number(thisMonthMeetingRows[0]?.count || 0);
  const pendingApprovals = (pendingApprovalRows as any[]);
  const applicantCount = Number(applicantRows[0]?.count || 0);
  const pendingOneOnOne = (pendingOneOnOneRows as any[]);
  const gradeDistribution = (gradeDistRows as any[]);
  const stageUpStaffs = (stageUpRows as any[]);
  const nearMissUnreadCount = Number(nearMissUnreadRows[0]?.count || 0);

  const jstHour = (new Date().getUTCHours() + 9) % 24;
  const greeting = jstHour < 11 ? 'おはようございます' :
                   jstHour < 17 ? 'こんにちは' :
                   jstHour < 21 ? 'お疲れ様です' : 'ゆっくり休んでください';
  const greetingSub = jstHour < 11 ? '今日もスタッフの成長を一緒に支えましょう' :
                      jstHour < 17 ? '午後もスタッフとの関わりを大切に' :
                      jstHour < 21 ? '今日のスタッフとの関わりを振り返りましょう' : '今日も一日お疲れ様でした';

  const todayQuote = LEAD_QUOTES[new Date().getDay() % LEAD_QUOTES.length];

  const stats = [
    { label: 'スタッフ', value: staffCount, unit: '名', dot: '#1D9E75', sub: '全員活動中', href: '/admin/staff' },
    { label: '今月の1on1', value: thisMonthMeetings, unit: '件', dot: '#6c63ff', sub: `${Math.max(0, staffCount - thisMonthMeetings)}名 未実施`, href: '/admin/one-on-one' },
    { label: '昇格申請', value: pendingApprovals.length, unit: '件', dot: '#f59e0b', sub: pendingApprovals.length > 0 ? '承認待ち' : '対応なし', href: '/admin/staff-evaluation' },
    { label: '採用候補者', value: applicantCount, unit: '名', dot: '#06b6d4', sub: '登録中', href: '/admin/applicants' },
  ];

  const quickLinks = [
    { href: '/admin/staff-evaluation', icon: '📈', label: 'スタッフ評価', desc: 'データ集計・AI分析・期間比較' },
    { href: '/admin/one-on-one', icon: '🤝', label: '1on1を記録', desc: '面談記録・AI分析・サジェスト' },
    { href: '/admin/grade/mindset', icon: '🔵', label: '同心円モデル', desc: '成長の地図を確認・編集' },
    { href: '/admin/applicants', icon: '🔍', label: '採用AI分析', desc: '候補者スコアリング・比較' },
    { href: '/admin/staff/summary', icon: '📊', label: '成長サマリー', desc: '全スタッフの成長を俯瞰' },
    { href: '/admin/handbook', icon: '📖', label: 'ハンドブック', desc: 'AIでブラッシュアップ' },
  ];

  // 等級分布を整理（G1〜G5）
  const gradeMap: Record<number, { total: number; positions: Record<string, number> }> = {};
  for (const row of gradeDistribution) {
    const lv = Number(row.level_number);
    if (!gradeMap[lv]) gradeMap[lv] = { total: 0, positions: {} };
    const cnt = Number(row.count || 0);
    gradeMap[lv].total += cnt;
    if (row.position && cnt > 0) gradeMap[lv].positions[row.position] = cnt;
  }

  const GRADE_COLORS: Record<number, string> = { 5: '#8b5cf6', 4: '#06b6d4', 3: '#4ade80', 2: '#60a5fa', 1: '#94a3b8' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* 挨拶 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{greeting}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{greetingSub}</p>
      </div>

      {/* 統計カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {stats.map(s => (
          <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
            <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {s.value}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{s.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                {s.sub}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 気づきシェア未読アラート */}
      {nearMissUnreadCount > 0 && (
        <Link href="/admin/near-miss" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 16px', background: '#fffbeb',
            border: '2px solid #fcd34d', borderRadius: '12px',
            marginBottom: '16px', cursor: 'pointer',
          }}>
            <span style={{ fontSize: '20px' }}>💛</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 'bold', color: '#d97706', fontSize: '14px' }}>
                💛 新しい気づきシェア {nearMissUnreadCount}件
              </p>
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>みんなの気づきを確認する</p>
            </div>
            <span style={{ color: '#d97706' }}>→</span>
          </div>
        </Link>
      )}

      {/* 今日のアクション */}
      {(pendingApprovals.length > 0 || pendingOneOnOne.length > 0 || stageUpStaffs.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>今日のアクション</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(pendingApprovals as any[]).map((e: any) => (
              <Link key={e.staff_name} href="/admin/staff-evaluation" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                    <strong style={{ fontWeight: 600 }}>{e.staff_name}</strong>さんの{e.recommended_grade}昇格承認が待っています
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#d97706', fontWeight: 600 }}>承認待ち</span>
                </div>
              </Link>
            ))}
            {(pendingOneOnOne as any[]).length > 0 && (
              <Link href="/admin/one-on-one" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6c63ff', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                    <strong style={{ fontWeight: 600 }}>{(pendingOneOnOne as any[]).map((s: any) => s.name).join('・')}</strong>さんとの1on1が30日以上未実施です
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontWeight: 600 }}>要対応</span>
                </div>
              </Link>
            )}
            {stageUpStaffs.length > 0 && (
              <Link href="/admin/staff/growth-report" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                    🌱 <strong style={{ fontWeight: 600 }}>{stageUpStaffs.map((s: any) => s.staff_name).join('・')}</strong>さんが今月成長ステージアップしました！
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#d97706', fontWeight: 600 }}>確認する</span>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 等級別・職種別スナップショット */}
      {Object.keys(gradeMap).length > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🏅 等級別スタッフ分布</div>
            <Link href="/admin/staff/summary" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>詳細 →</Link>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[5, 4, 3, 2, 1].map(lv => {
              const info = gradeMap[lv];
              if (!info) return null;
              const color = GRADE_COLORS[lv];
              return (
                <div key={lv} style={{ flex: 1, minWidth: 80, padding: '10px 12px', borderRadius: 10, background: color + '12', border: `1px solid ${color}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 4 }}>G{lv}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{info.total}<span style={{ fontSize: 12, fontWeight: 400 }}>名</span></div>
                  {Object.entries(info.positions).map(([pos, cnt]) => (
                    <div key={pos} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{pos} {cnt}名</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* クイックアクセス */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>クイックアクセス</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {quickLinks.map(link => (
            <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{link.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{link.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{link.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 今日のリードマネジメント */}
      <div style={{ padding: '14px 18px', background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🩵</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', marginBottom: 4 }}>今日のリードマネジメント</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{todayQuote}</div>
        </div>
      </div>
    </div>
  );
}
