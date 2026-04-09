import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

// 共有URL作成
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { libraryItemId, expiresDays } = await req.json();

  const expiresAt = expiresDays
    ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const result = await sql`
    INSERT INTO shared_items (library_item_id, user_id, expires_at)
    VALUES (${libraryItemId}, ${userId}, ${expiresAt})
    RETURNING id
  `;

  const shareId = result[0].id;
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const shareUrl = `${baseUrl}/share/${shareId}`;

  return NextResponse.json({ shareUrl, shareId });
}
