import { neon } from '@neondatabase/serverless';

// 機能キーに対応するプロファイルのsystem promptを取得
// userIdごとに分離されたプロファイル・機能別設定を参照する
export async function getClinicSystemPrompt(featureKey: string, userId: string): Promise<string> {
  if (!userId) return '';
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 機能別設定を確認
    const settingRows = await sql`
      SELECT cp.content, cp.sections, cp.name
      FROM feature_profile_settings fps
      LEFT JOIN clinic_profiles cp ON fps.profile_id = cp.id
      WHERE fps.user_id = ${userId}
        AND fps.feature_key = ${featureKey}
        AND fps.is_enabled = TRUE
        AND cp.content IS NOT NULL
        AND cp.content != ''
      LIMIT 1
    `;
    const setting = settingRows[0];
    if (setting?.content) {
      return buildSystemPrompt(setting.name as string, setting.content as string, setting.sections as any);
    }

    // フォールバック: ユーザーのデフォルトプロファイル
    const defaultRows = await sql`
      SELECT * FROM clinic_profiles
      WHERE user_id = ${userId} AND is_default = TRUE AND content != ''
      LIMIT 1
    `;
    const defaultProfile = defaultRows[0];
    if (defaultProfile?.content) {
      return buildSystemPrompt(defaultProfile.name as string, defaultProfile.content as string, defaultProfile.sections as any);
    }

    return '';
  } catch (e) {
    console.error('[clinicProfile] 取得エラー:', e);
    return '';
  }
}

function buildSystemPrompt(name: string, content: string, sections: any): string {
  if (!content) return '';
  const sectionsText = Array.isArray(sections) && sections.length > 0
    ? sections.map((s: any) => `### ${s.title ?? ''}（${s.category ?? ''}）\n${s.content ?? ''}`).join('\n\n')
    : content;

  return `
## クリニック背景情報・理念（必ず参照して回答に反映してください）
プロファイル名: ${name}

${sectionsText}

---
上記の理念・方針・マーケティング要素を深く理解し、全ての回答・生成物に自然に反映してください。
`.trim();
}
