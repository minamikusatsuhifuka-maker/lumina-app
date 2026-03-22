'use client';
import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#7878a0', cursor: 'pointer', fontSize: 13, textAlign: 'left', borderRadius: 8 }}
    >
      🚪 ログアウト
    </button>
  );
}
