import { neon } from '@neondatabase/serverless';

// 各機能のAPIから呼び出してメモリをコンテキストとして注入する共通関数
export async function fetchUserMemories(userId: string, limit = 10): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const memories = await sql`SELECT summary, source_title, created_at FROM memory_items WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;

  if (memories.length === 0) return '';

  const memoryText = memories
    .map((m: any) => `・${m.summary}（${new Date(m.created_at).toLocaleDateString('ja-JP')}）`)
    .join('\n');

  return `\n\n## ユーザーの過去の調査・分析メモリ（参考情報）\n${memoryText}\n\nこれらの過去情報を踏まえて、より文脈に合った回答をしてください。`;
}
