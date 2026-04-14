import { neon } from '@neondatabase/serverless';

// カテゴリ名の日英マッピング
const CATEGORY_MAP: Record<string, string[]> = {
  philosophy: ['理念', 'philosophy'],
  grade: ['等級', 'grade'],
  evaluation: ['評価', 'evaluation'],
  strategy: ['戦略', 'strategy'],
  hiring: ['採用', 'hiring'],
  mindset: ['マインド', 'mindset'],
  handbook: ['ハンドブック', 'handbook'],
  growth: ['成長哲学', 'growth'],
  'red-zone': ['行動基準', 'red-zone'],
  all: ['all'],
};

// ① 自律型組織ビジョン（ハードコード）
const visionBlock = `【院長の究極ビジョン】
ティール組織・全員主役・自律型生命体。
管理不要で全員がリーダー。同心円成長（自己愛→身近な人→社会貢献）。
スタッフを主役として扱い、内発的動機を引き出す言葉を選ぶこと。`;

// ② 先払い哲学（ハードコード）
const powerPartnerBlock = `【先払い哲学・パワーパートナー定義】

院長の行動原則：「先払い」
  ・見返りを求める前に、まず与える
  ・時間・お金・エネルギーを惜しまず先払いする
  ・先払いできる人が最終的に最も豊かになる

真のパワーパートナーの定義：
  「相手の成功のために最大最善の貢献をする存在」
  見返りを求めない → 信頼が生まれる → 豊かさが循環する

パワーパートナーの連鎖：
  院長 ↔ スタッフ ↔ 患者さん ↔ 地域社会

AIへの指示：
  スタッフへの回答・提案において、「与えること・貢献すること」を価値として扱うこと。
  「得ること・評価されること」より「先払いすること」を称賛する。
  G5アンバサダーとは「先払いを体現した存在」として語ること。`;

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
const realEvaluationBlock = `【実評価哲学 - AIの評価・フィードバック指針】

「心の中やマインドは言動に全て現れる。だから実で評価する」
7つの実：
  ・実行（じっこう）：やると言ったことをやる（コミット力）
  ・実績（じっせき）：事実・数字で語れる成果（再現性）
  ・実力（じつりょく）：本物の力が身についている（習熟度）
  ・誠実（せいじつ）：自分にも他者にも正直（品格・言行一致）
  ・実現（じつげん）：描いたビジョンを現実にする力（創造力）
  ・充実（じゅうじつ）：内側から満ちあふれる豊かさで働いている（内発的動機）
  ・結実（けつじつ）：継続した努力が形になっている（継続力・忍耐）

評価配分：マインド50%・スキル25%・知識25%

スタッフを評価・フィードバックする際：
  × 「心がけが足りない」（内面を責める）
  × 「やる気が感じられない」（主観的感情評価）
  ✅ 「先週の約束は実行されましたか？」（実行を確認）
  ✅ 「今月の患者満足度スコアはどうでしたか？」（実績を確認）
  ✅ 「その技術は一人でできるようになりましたか？」（実力を確認）
  ✅ 「報告が遅れた理由を正直に教えてください」（誠実を引き出す）
  ✅ 「あなたが描いていたビジョンに近づいていますか？」（実現を確認）
  ✅ 「今の仕事に充実感はありますか？何があれば満たされますか？」（充実を確認）
  ✅ 「継続してきた努力が、どんな形で現れてきましたか？」（結実を確認）

マインド評価はLv3（行う）以上を基準とする：
  行動として現れていないマインドは評価しない。
  「知っている・わかっている」はLv1-2、評価対象は「行っている」以上。`;

export async function buildSystemContext(
  role: string,
  category?: string
): Promise<string> {
  const blocks: string[] = [
    visionBlock,
    powerPartnerBlock,
    leadManagementBlock,
    realEvaluationBlock,
  ];

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // カテゴリの日英両方のキーを取得
    const categoryKeys = category
      ? (CATEGORY_MAP[category] || [category])
      : [];

    const [philosophyRows, fileRows, criteriaRows, rulesRows, gradeRows, redZoneRows] = await Promise.all([
      sql`SELECT title, content FROM clinic_philosophy LIMIT 1`,
      sql`SELECT name, content FROM philosophy_files ORDER BY created_at DESC LIMIT 3`,
      // カテゴリフィルタ：日英両方のカテゴリ名でOR検索
      categoryKeys.length > 0
        ? sql`SELECT criterion, priority FROM clinic_decision_criteria
               WHERE category = ANY(${categoryKeys})
               ORDER BY priority DESC LIMIT 15`
        : sql`SELECT criterion, priority FROM clinic_decision_criteria
               ORDER BY priority DESC LIMIT 20`,
      sql`SELECT content FROM employment_rules LIMIT 1`.catch(() => []),
      // 等級制度（上位5件）
      sql`SELECT name, level_number, description, requirements_promotion
           FROM grade_levels
           ORDER BY level_number ASC LIMIT 5`.catch(() => []),
      // 行動基準（レッドゾーン上位10件）
      sql`SELECT zone, title, description
           FROM red_zone_rules
           ORDER BY zone ASC, id ASC LIMIT 10`.catch(() => []),
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
    if ((rulesRows as any[])[0]?.content) {
      const rulesContent = (rulesRows as any[])[0].content as string;
      const snippet = rulesContent.length > 1000
        ? extractRelevantRules(rulesContent)
        : rulesContent;
      blocks.push(`【就業規則（抜粋）】\n${snippet}`);
    }

    // ⑧ AIの判断基準（カテゴリ別フィルタ対応）
    if ((criteriaRows as any[]).length > 0) {
      const criteriaText = (criteriaRows as any[]).map(r => `・${r.criterion}`).join('\n');
      blocks.push(`【AIの判断基準】\n${criteriaText}`);
    }

    // ⑨ 等級制度（新規追加）
    if ((gradeRows as any[]).length > 0) {
      const gradeText = (gradeRows as any[])
        .map(g => `G${g.level_number}（${g.name || ''}）：${(g.description || '').slice(0, 100)}`)
        .join('\n');
      blocks.push(`【等級制度（概要）】\n${gradeText}`);
    }

    // ⑩ 行動基準（新規追加）
    if ((redZoneRows as any[]).length > 0) {
      const zoneText = (redZoneRows as any[])
        .map(r => `[${r.zone}] ${r.title}：${(r.description || '').slice(0, 60)}`)
        .join('\n');
      blocks.push(`【行動基準】\n${zoneText}`);
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
