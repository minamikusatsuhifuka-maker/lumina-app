import { neon } from '@neondatabase/serverless';

const CATEGORY_LABELS: Record<string, string> = {
  philosophy: '理念・価値観', grade: '等級・人材育成', evaluation: '評価基準',
  strategy: '経営戦略', hiring: '採用・人材', mindset: 'マインド・文化',
  marketing: 'マーケティング', handbook: 'ハンドブック・文化', growth: '成長哲学', all: '全般',
};

export async function getClinicContext(category?: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const parts: string[] = [];

  // 理念
  const philRows = await sql`SELECT title, content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  if (philRows[0]) parts.push(`【クリニックの理念】\n${philRows[0].title}：${philRows[0].content}`);

  // 判断基準
  const criteriaRows = category
    ? await sql`SELECT category, criterion FROM clinic_decision_criteria WHERE category = ${category} OR category = 'all' ORDER BY priority DESC LIMIT 20`
    : await sql`SELECT category, criterion FROM clinic_decision_criteria ORDER BY priority DESC LIMIT 30`;

  if (criteriaRows.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const r of criteriaRows as any[]) { if (!grouped[r.category]) grouped[r.category] = []; grouped[r.category].push(r.criterion); }
    const text = Object.entries(grouped).map(([cat, items]) => `▼ ${CATEGORY_LABELS[cat] || cat}\n${items.map(c => `  • ${c}`).join('\n')}`).join('\n\n');
    parts.push(`【院長の価値観・判断基準】\n${text}`);
  }

  // 成長哲学
  const growthRows = await sql`SELECT win_win_vision FROM growth_philosophy LIMIT 1`;
  if (growthRows[0]?.win_win_vision) parts.push(`【Win-Winビジョン】\n${growthRows[0].win_win_vision}`);

  return parts.length > 0 ? parts.join('\n\n') : '';
}

export async function buildSystemContext(role: string, category?: string): Promise<string> {
  const context = await getClinicContext(category);
  if (!context) return role;
  return `${role}\n\n以下はこのクリニックの理念・価値観・院長の判断基準です。提案・生成・評価の全てにおいて、この内容を最優先の判断軸としてください。\n\n${context}`;
}
