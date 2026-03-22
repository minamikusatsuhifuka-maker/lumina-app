import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const sql = neon(process.env.DATABASE_URL!);
          const result = await sql`SELECT * FROM users WHERE email = ${credentials.email as string}`;
          const user = result[0];
          if (!user) return null;
          const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
          if (!valid) return null;
          return { id: user.id, email: user.email, name: user.name, plan: user.plan };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth' },
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.id = user.id; token.plan = (user as any).plan; }
      return token;
    },
    session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id;
        (session.user as any).plan = token.plan;
      }
      return session;
    },
  },
});
