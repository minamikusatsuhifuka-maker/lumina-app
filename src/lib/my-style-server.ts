// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// マイ文体の横断注入ヘルパ（228c・サーバ専用）
// getClinicSystemPrompt（clinicProfile.ts）と同じ形: 生成ルートが1行で呼べて、
// 未設定・無効・取得失敗はすべて空文字（＝注入なし・生成は従来どおり）のfail-closed。
// 現在の適用先はnote 2経路（note-bundle/article・note-article）。他ルートへは
// この関数の呼び出し1行で拡張できる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { sql } from '@/lib/db';
import { buildMyStyleBlock, normalizeMyStyleProfile } from '@/lib/my-style';

export async function getMyStylePrompt(userId: string): Promise<string> {
  if (!userId) return '';
  try {
    const [row] = await sql`
      SELECT profile, enabled FROM my_style_profiles WHERE owner = ${userId}
    `;
    if (!row || !row.enabled) return '';
    const profile = normalizeMyStyleProfile(row.profile);
    if (!profile) return '';
    return buildMyStyleBlock(profile);
  } catch {
    // テーブル未作成・DB障害は「文体注入なし」で続行（生成そのものを止めない）
    return '';
  }
}
