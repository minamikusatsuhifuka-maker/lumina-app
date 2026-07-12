import { auth } from '@/lib/auth';

// APIルート共通の認証ガード。
// AIを呼び出すルートなど保護対象は必ずこれ（または同等の401ガード）を通すこと。
// 「デフォルト保護・公開は明示」— 公開が意図されたルート（/api/scheduling/public/ 等）以外で
// 認証なしにAI・DBを触るルートを作らない。
//
// 使い方:
//   const guard = await requireAuth();
//   if (!guard.ok) return guard.response;
//   const { userId, session } = guard;
export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return {
      ok: false as const,
      response: new Response('Unauthorized', { status: 401 }),
    };
  }
  const userId = ((session.user as { id?: string })?.id ?? '').trim();
  return { ok: true as const, session, userId };
}
