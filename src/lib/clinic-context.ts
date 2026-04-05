import { neon } from '@neondatabase/serverless';

const CATEGORY_LABELS: Record<string, string> = {
  philosophy: '理念・価値観', grade: '等級・人材育成', evaluation: '評価基準',
  strategy: '経営戦略', hiring: '採用・人材', mindset: 'マインド・文化',
  marketing: 'マーケティング', handbook: 'ハンドブック・文化', growth: '成長哲学', all: '全般',
};

export async function getClinicContext(category?: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const parts: string[] = [];

  // 手入力テキスト理念
  const philRows = await sql`SELECT title, content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  if (philRows[0]) parts.push(`【クリニックの理念】\n${philRows[0].title}：${philRows[0].content}`);

  // アップロードファイル群
  const fileRows = await sql`SELECT name, content FROM philosophy_files ORDER BY created_at DESC`;
  if ((fileRows as any[]).length > 0) {
    const fileContents = (fileRows as any[])
      .map(f => `▼ ${f.name}\n${f.content.slice(0, 2000)}`)
      .join('\n\n');
    parts.push(`【参照ドキュメント】\n${fileContents}`);
  }

  // 判断基準
  const criteriaRows = category
    ? await sql`SELECT category, criterion FROM clinic_decision_criteria WHERE category = ${category} OR category = 'all' ORDER BY priority DESC LIMIT 20`
    : await sql`SELECT category, criterion FROM clinic_decision_criteria ORDER BY priority DESC LIMIT 30`;

  if (criteriaRows.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const r of criteriaRows as any[]) { if (!grouped[r.category]) grouped[r.category] = []; grouped[r.category].push(r.criterion); }
    const text = Object.entries(grouped).map(([cat, items]) => `▼ ${CATEGORY_LABELS[cat] || cat}\n${items.map(c => `  • ${c}`).join('\n')}`).join('\n\n');
    parts.push(`【院長の価値観・判断基準】\n${text}`);
  }

  // 成長哲学・究極ビジョン（最重要 → 先頭に配置）
  const growthRows = await sql`SELECT win_win_vision, power_partner_definition FROM growth_philosophy LIMIT 1`;
  if (growthRows[0]?.win_win_vision) {
    parts.unshift(`【院長の究極ビジョン・組織の目指す姿】\n${growthRows[0].win_win_vision}\n\nこのビジョンを常に念頭に置き、全ての提案・評価・生成において「この内容はスタッフが自己実現しながら社会に貢献できる組織づくりにつながるか」を最優先の判断軸としてください。`);
    if (growthRows[0]?.power_partner_definition) {
      parts.push(`【パワーパートナーの定義】\n${growthRows[0].power_partner_definition}`);
    }
  }

  // 就業規則（長い場合は関連条項を自動抽出）
  try {
    const rulesRows = await sql`SELECT content FROM employment_rules LIMIT 1`;
    if (rulesRows[0]?.content) {
      const rulesContent = rulesRows[0].content as string;
      const relevantSection = rulesContent.length > 5000
        ? extractRelevantRules(rulesContent)
        : rulesContent;
      parts.push(`【就業規則（関連条項）】\n${relevantSection}`);
    }
  } catch { /* テーブル未作成時はスキップ */ }

  return parts.length > 0 ? parts.join('\n\n') : '';
}

// 就業規則から懲戒・解雇・服務規律など関連条項を抽出
function extractRelevantRules(content: string): string {
  const keywords = ['懲戒', '解雇', '服務', '禁止', '遵守', '義務',
                    'ハラスメント', '秘密', '個人情報', '欠勤', '退職'];
  const lines = content.split('\n');
  const relevant: string[] = [];
  let inRelevantSection = false;
  let sectionBuffer: string[] = [];

  for (const line of lines) {
    const hasKeyword = keywords.some(k => line.includes(k));
    if (hasKeyword || (inRelevantSection && line.trim())) {
      inRelevantSection = true;
      sectionBuffer.push(line);
    } else if (inRelevantSection && !line.trim()) {
      if (sectionBuffer.length > 0) {
        relevant.push(sectionBuffer.join('\n'));
        sectionBuffer = [];
      }
      inRelevantSection = false;
    }
    if (relevant.join('\n').length > 5000) break;
  }
  if (sectionBuffer.length > 0) relevant.push(sectionBuffer.join('\n'));
  return relevant.join('\n\n') || content.slice(0, 3000);
}

export async function buildSystemContext(role: string, category?: string): Promise<string> {
  const context = await getClinicContext(category);
  if (!context) return role;
  return `${role}\n\n${'━'.repeat(40)}\n以下の理念・ドキュメント・院長の価値観を最優先の判断軸として行動してください。\n${'━'.repeat(40)}\n${context}\n${'━'.repeat(40)}`;
}
