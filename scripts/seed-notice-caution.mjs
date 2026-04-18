import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.split('\n').find(l => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

await sql`
  INSERT INTO clinic_settings (key, value)
  VALUES ('notice_caution', 'あなたの気づきがチームを明るくします。
どんな小さなことでも、シェアしてくれると嬉しいです。')
  ON CONFLICT (key) DO NOTHING
`;

const row = await sql`SELECT key, value FROM clinic_settings WHERE key = 'notice_caution'`;
console.log('投入結果:', row);
