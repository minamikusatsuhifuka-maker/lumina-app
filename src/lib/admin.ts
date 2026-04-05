import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { redirect } from 'next/navigation';

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) redirect('/auth');
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql`SELECT * FROM users WHERE email = ${session.user.email}`;
  const user = result[0];
  if (!user?.is_admin) redirect('/dashboard');
  return user;
}
