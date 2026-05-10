import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

const safeCount = async (
  query: () => Promise<Array<Record<string, unknown>>>,
  defaultValue: Record<string, number> = { count: 0 },
): Promise<Record<string, number>> => {
  try {
    const rows = await query();
    if (!rows[0]) return defaultValue;
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(rows[0])) {
      const n = Number(v);
      result[k] = Number.isNaN(n) ? 0 : n;
    }
    return result;
  } catch {
    return defaultValue;
  }
};

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  // 各スタジオの進捗を並列取得（テーブル不在エラーは0として扱う）
  const [
    businessProjects,
    hrMembers,
    medicalDocs,
    kindleBooks,
    textAnalysisSaves,
    knowledgeNodes,
    glossaryTerms,
  ] = await Promise.all([
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count, COUNT(CASE WHEN status='active' THEN 1 END)::int as active FROM business_projects WHERE user_id = ${userId}`,
      { count: 0, active: 0 },
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count FROM hr_members WHERE user_id = ${userId}`,
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count, COUNT(CASE WHEN status='draft' THEN 1 END)::int as drafts FROM medical_documents WHERE user_id = ${userId}`,
      { count: 0, drafts: 0 },
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count FROM kindle_books WHERE user_id = ${userId}`,
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count FROM text_analysis_saves WHERE user_id = ${userId}`,
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count FROM knowledge_nodes WHERE user_id = ${userId}`,
    ),
    safeCount(
      () =>
        sql`SELECT COUNT(*)::int as count FROM glossary_terms WHERE user_id = ${userId}`,
    ),
  ]);

  return NextResponse.json({
    business: {
      totalProjects: businessProjects.count ?? 0,
      activeProjects: businessProjects.active ?? 0,
    },
    hr: {
      totalMembers: hrMembers.count ?? 0,
    },
    medical: {
      totalDocs: medicalDocs.count ?? 0,
      drafts: medicalDocs.drafts ?? 0,
    },
    kindle: {
      totalBooks: kindleBooks.count ?? 0,
    },
    research: {
      savedItems: textAnalysisSaves.count ?? 0,
      knowledgeNodes: knowledgeNodes.count ?? 0,
      glossaryTerms: glossaryTerms.count ?? 0,
    },
  });
}
