// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの自動校正 一元管理（224）
// 型・観点10原則・ローカル置換ヘルパをここに集約する（クライアント/サーバ共用のため
// server-only依存を置かない）。検出方式は proofread/detect と同じ
// 「行番号付与→完全一致original→ローカル置換」。保存は book_meta.proofread
// （サーバ側jsonb_setマージ・/api/kindle/wizard/proofread が唯一の書き込み口）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KindleIssueType = '誤字脱字' | '表現改善' | '効果的表現';
export type KindleIssueScope = 'line' | 'all';
export type KindleIssueDecision = 'applied' | 'rejected';

export interface KindleProofreadIssue {
  line: number;
  type: KindleIssueType;
  original: string;
  suggestion: string;
  reason: string;
  // 効果的表現のときのみ: 根拠となる原則名（観点10原則から）
  principle?: string;
  scope: KindleIssueScope;
  // 未設定=未処理。適用/却下は issues 配列内に持つ（章の再校正で丸ごと上書き=判断もリセット）
  status?: KindleIssueDecision;
}

export interface KindleChapterProofread {
  issues: KindleProofreadIssue[];
  ranAt: string;
}

export interface KindleGlobalNote {
  type: string; // 用語ゆれ | 章間重複 | 流れ
  note: string;
  chapters?: number[];
}

export interface KindleBookProofread {
  // key = 章ID（文字列）
  chapters?: Record<string, KindleChapterProofread>;
  global?: { notes: KindleGlobalNote[]; ranAt: string };
}

export const KINDLE_ISSUE_TYPES: KindleIssueType[] = ['誤字脱字', '表現改善', '効果的表現'];

export const KINDLE_ISSUE_BADGE: Record<KindleIssueType, { emoji: string; color: string }> = {
  誤字脱字: { emoji: '✏️', color: '#ef4444' },
  表現改善: { emoji: '💬', color: '#f59e0b' },
  効果的表現: { emoji: '✨', color: '#8b5cf6' },
};

// 効果的表現の観点10原則（マーケティング・心理学・行動経済学）。
// カッコ内は品質ガード。プロンプト本文にそのまま注入する（緩和・省略しない＝224承認条件）。
export const KINDLE_PROOFREAD_PRINCIPLES = `# 効果的表現の観点リスト（10原則。提案には根拠の原則名を添える）
1. 損失回避: 行動しないことで失うものにも触れて動機づける（不安を煽る誇張は禁止。素材にある事実の範囲のみ）
2. 社会的証明: 「多くの読者に共通する傾向」として一般化して安心感を作る（素材にない数値・実績・事例を作らない）
3. 具体性: 抽象語を場面・行動の描写に置き換える（素材の範囲のみ。新たな事実の追加はしない）
4. ベネフィットの言語化: 機能や手順ではなく「読者が得る変化」を主語にする（効果の保証表現にしない）
5. 自分ごと化: 読者への問いかけ・「あなた」視点への転換で当事者性を高める（押し付け・断定にしない）
6. 認知負荷の軽減: 一文一義・文の分割・専門用語の言い換えで読みやすくする
7. フレーミング: 得られるもの→失うものの順に伝える等、同じ事実の提示順序を整える（事実の歪曲はしない）
8. 一貫性・小さな一歩: 読者が今日できる小さな行動を示して次の行動につなげる（受診・購入を急かさない）
9. 物語性: 状況→気づき→変化の流れに整えて記憶に残す（実在の個人が特定される描写にしない）
10. 権威性の適切な提示: 経験・根拠の裏づけを添えて信頼を作る（素材にある根拠のみ。誇大にしない）`;

// 1件の修正提案を本文に適用する（AI不要のローカル置換）。
// scope 'all': 全文の全出現箇所を置換。
// scope 'line': 該当行内の全出現箇所を置換。先行する適用で行番号がずれた場合に備え、
// 該当行に見つからなければ全文の最初の1箇所にフォールバックする。
// どこにも見つからなければ原文をそのまま返す（誤置換・クラッシュ防止＝fail-closed）。
export function applyProofreadFix(
  text: string,
  fix: Pick<KindleProofreadIssue, 'line' | 'original' | 'suggestion' | 'scope'>,
): string {
  if (!fix.original) return text;
  if (fix.scope === 'all') {
    return text.split(fix.original).join(fix.suggestion);
  }
  const lines = text.split('\n');
  const i = fix.line - 1;
  if (i >= 0 && i < lines.length && lines[i].includes(fix.original)) {
    lines[i] = lines[i].split(fix.original).join(fix.suggestion);
    return lines.join('\n');
  }
  const idx = text.indexOf(fix.original);
  if (idx === -1) return text;
  return text.slice(0, idx) + fix.suggestion + text.slice(idx + fix.original.length);
}

// 未処理の提案のみを数える（バッジ表示用）
export function countPendingIssues(entry: KindleChapterProofread | undefined): number {
  if (!entry) return 0;
  return entry.issues.filter((it) => !it.status).length;
}
