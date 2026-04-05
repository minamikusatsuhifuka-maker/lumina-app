import { neon } from '@neondatabase/serverless';

export async function buildSystemContext(
  role: string,
  category?: string
): Promise<string> {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 全コンテキストを並行取得
    const [
      philosophyRows,
      fileRows,
      growthRows,
      criteriaRows,
      rulesRows,
    ] = await Promise.all([
      sql`SELECT title, content FROM clinic_philosophy LIMIT 1`,
      sql`SELECT name, content FROM philosophy_files ORDER BY created_at DESC`,
      sql`SELECT win_win_vision, power_partner_definition,
              lead_management_philosophy, core_values FROM growth_philosophy LIMIT 1`,
      category
        ? sql`SELECT criterion FROM clinic_decision_criteria
               WHERE category = ${category} OR category = 'all'
               ORDER BY priority DESC LIMIT 15`
        : sql`SELECT criterion FROM clinic_decision_criteria
               ORDER BY priority DESC LIMIT 20`,
      sql`SELECT content FROM employment_rules LIMIT 1`.catch(() => []),
    ]);

    const philosophy = philosophyRows[0];
    const growth = growthRows[0];
    const sections: string[] = [];

    // ① 【最重要】院長の究極ビジョン（最初に読ませる）
    if (growth?.win_win_vision || growth?.power_partner_definition) {
      sections.push(
`【院長の究極ビジョン】
${growth?.win_win_vision ?? ''}

【自律型生命体組織へ】
${growth?.power_partner_definition ?? ''}

このビジョンを全ての判断の最上位に置いてください。
提案・評価・生成の全てが「このビジョンの実現に向かっているか」で判断されます。`
      );
    }

    // ② リードマネジメント哲学
    if (growth?.lead_management_philosophy) {
      sections.push(
`【当院のリードマネジメント哲学】
${growth.lead_management_philosophy}

全ての関わりにおいて：
・本人の成長・気づき・可能性にフォーカスする（インサイドアウト）
・5大欲求（力・愛と所属・楽しみ・自由・生存）に配慮する
・管理・コントロールではなく、自主性・自律性を育む関わりをする
・「あなたには価値がある・可能性がある」を前提に関わる`
      );
    }

    // ③ 「実」を見て評価する哲学
    if (growth?.core_values) {
      sections.push(growth.core_values as string);
    }

    // ④ クリニックの理念
    if (philosophy?.content) {
      sections.push(
`【クリニックの理念】
${philosophy.title ?? ''}
${philosophy.content}`
      );
    }

    // ④ 参照ドキュメント（理念ファイル）
    if ((fileRows as any[]).length > 0) {
      const fileSummary = (fileRows as any[])
        .map(f => `▼ ${f.name}\n${f.content.slice(0, 1500)}`)
        .join('\n\n');
      sections.push(`【参照ドキュメント】\n${fileSummary}`);
    }

    // ⑤ 院長の判断基準（対話蓄積）
    if ((criteriaRows as any[]).length > 0) {
      const criteria = (criteriaRows as any[]).map(r => `• ${r.criterion}`).join('\n');
      sections.push(`【院長の価値観・判断基準】\n${criteria}`);
    }

    // ⑥ 就業規則（関連条項）
    if (rulesRows[0]?.content) {
      const rulesContent = rulesRows[0].content as string;
      const relevant = rulesContent.length > 5000
        ? extractRelevantRules(rulesContent)
        : rulesContent;
      sections.push(`【就業規則（関連条項）】\n${relevant}`);
    }

    if (sections.length === 0) return role;

    return `${role}

${'━'.repeat(50)}
【このクリニックについて — 全ての判断の前提】
${'━'.repeat(50)}
${sections.join('\n\n')}
${'━'.repeat(50)}

上記の理念・ビジョン・哲学を最優先の判断軸として、
管理・コントロールではなく「自律・自主・自走」を促す視点で
全ての提案・評価・生成を行ってください。`;

  } catch (e) {
    console.error('clinic-context error:', e);
    return role;
  }
}

function extractRelevantRules(content: string): string {
  const keywords = ['懲戒', '解雇', '服務', '禁止', '遵守', '義務',
                    'ハラスメント', '秘密', '個人情報', '欠勤', '退職'];
  const lines = content.split('\n');
  const relevant: string[] = [];
  let buffer: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const hasKeyword = keywords.some(k => line.includes(k));
    if (hasKeyword) {
      capturing = true;
      buffer.push(line);
    } else if (capturing && line.trim()) {
      buffer.push(line);
    } else if (capturing && !line.trim()) {
      relevant.push(buffer.join('\n'));
      buffer = [];
      capturing = false;
    }
    if (relevant.join('\n').length > 4000) break;
  }
  if (buffer.length > 0) relevant.push(buffer.join('\n'));
  return relevant.join('\n\n') || content.slice(0, 3000);
}
