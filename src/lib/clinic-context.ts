import { neon } from '@neondatabase/serverless';

// ① 自律型組織ビジョン（ハードコード）
const visionBlock = `【院長の究極ビジョン】
ティール組織・全員主役・自律型生命体。
管理不要で全員がリーダー。同心円成長（自己愛→身近な人→社会貢献）。
スタッフを主役として扱い、内発的動機を引き出す言葉を選ぶこと。`;

// ② 先払い哲学（ハードコード）
const powerPartnerBlock = `【先払いの原則・パワーパートナー定義】
時間・お金・エネルギーを先払いすることで豊かな人生を手に入れる。
真のパワーパートナーとは、相手の成功のために最大最善の貢献をする存在。
見返りを求めず先に与えることが、信頼と豊かさを生む。`;

// ③ リードマネジメント哲学（ハードコード）
const leadManagementBlock = `【リードマネジメント哲学 - AIの関わり方指針】

AIはリードマネジメントの原則に従って関わること：

禁止（ボスマネジメント）：
  × 「〜しなければいけません」（強制）
  × 「なぜできないのですか」（責める）
  × 「〜しないと評価が下がります」（脅し）

推奨（リードマネジメント）：
  ✅ 「〜することで、あなたの〇〇欲求が満たされます」
  ✅ 「あなたが〜を選ぶとき、チームにとってどんな意味があるでしょう？」
  ✅ 「まず現状を教えてください。一緒に考えましょう」
  ✅ 「あなたにはその力があると思っています」

5大欲求（選択理論）：
  ①生存（安心・安定・報酬） ②愛所属（チーム・認められる）
  ③力（成長・達成感・影響力） ④自由（自分で決める・創意工夫）
  ⑤楽しみ（学ぶ・面白い・やりがい）

インサイドアウトの原則：
  外から変えようとするのではなく、内側からの気づきを促す。
  「あなたはどう思いますか？」「何があれば動けますか？」を常に問いかけ、自己評価を促すこと。`;

// ④ 実評価哲学（ハードコード）
const realEvaluationBlock = `【「実」を見て評価する哲学】
心の中やマインドは言動に全て現れる。だから内面ではなく「実」で評価する。
実行（やると言ったことをやる）・実績（数字で語れる成果）・
実力（本物の力が身についている）・誠実（自分にも他者にも正直）
この4つの「実」で評価する。評価はマインド50%・スキル25%・知識25%。`;

export async function buildSystemContext(
  role: string,
  category?: string
): Promise<string> {
  // 静的ブロック（常に含む）
  const blocks: string[] = [
    visionBlock,
    powerPartnerBlock,
    leadManagementBlock,
    realEvaluationBlock,
  ];

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // ⑤⑥⑦⑧を並行取得
    const [philosophyRows, fileRows, criteriaRows, rulesRows] = await Promise.all([
      sql`SELECT title, content FROM clinic_philosophy LIMIT 1`,
      sql`SELECT name, content FROM philosophy_files ORDER BY created_at DESC LIMIT 3`,
      category
        ? sql`SELECT criterion FROM clinic_decision_criteria
               WHERE category = ${category} OR category = 'all'
               ORDER BY priority DESC LIMIT 15`
        : sql`SELECT criterion FROM clinic_decision_criteria
               ORDER BY priority DESC LIMIT 20`,
      sql`SELECT content FROM employment_rules LIMIT 1`.catch(() => []),
    ]);

    // ⑤ クリニック理念
    const philosophy = philosophyRows[0];
    if (philosophy?.content) {
      blocks.push(`【クリニックの理念】\n${philosophy.title ?? ''}\n${philosophy.content}`);
    }

    // ⑥ 参照ドキュメント
    if ((fileRows as any[]).length > 0) {
      const filesText = (fileRows as any[])
        .map(f => `【参照：${f.name}】\n${(f.content as string).slice(0, 500)}`)
        .join('\n\n');
      blocks.push(`【参照ドキュメント】\n${filesText}`);
    }

    // ⑦ 就業規則
    if (rulesRows[0]?.content) {
      const rulesContent = rulesRows[0].content as string;
      const snippet = rulesContent.length > 1000
        ? extractRelevantRules(rulesContent)
        : rulesContent;
      blocks.push(`【就業規則（抜粋）】\n${snippet}`);
    }

    // ⑧ AIの判断基準
    if ((criteriaRows as any[]).length > 0) {
      const criteriaText = (criteriaRows as any[]).map(r => `・${r.criterion}`).join('\n');
      blocks.push(`【AIの判断基準】\n${criteriaText}`);
    }
  } catch (e) {
    console.error('clinic-context error:', e);
  }

  return `${role}

${blocks.join('\n\n════════════════════════\n\n')}

════════════════════════
上記の理念・ビジョン・哲学を最優先の判断軸として、
管理・コントロールではなく「自律・自主・自走」を促す視点で
全ての提案・評価・生成を行ってください。`;
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
  return relevant.join('\n\n') || content.slice(0, 1000);
}
