// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 336: 「✍️ 人間らしく整える」のサーバ側（AI 呼び出し・マイ文体の読み出し・タイムアウト）
//
// - モデルは既定（GEMINI_TEXT_MODEL・335）・思考は medium。生成側のモデル選択（Claude）には連動させない
// - system = 院長の原文 → 補則（後勝ち）→ 口調のサンプル（マイ文体・保存済みのときだけ）。本文は user
// - 個別のタイムアウト（R-73）: 1回 100 秒・試行は最大2回。ルートの締切（deadlineAt）が近ければ残り時間に切り詰め、
//   足りなければ呼ばずに「時間切れ」で返す（記事は失わない・R-39・R-118 の終端は呼び出し側が送る）
// - 判定の流れ（整える→数字の検査→1回だけ整え直し→駄目なら整える前）は humanize.ts の純関数 humanizeWithChecks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { callGeminiRaw } from '@/lib/ai-fallback';
import { GEMINI_TEXT_MODEL, GEMINI_TEXT_THINKING_MEDIUM } from '@/lib/ai-models';
import { getMyStylePrompt } from '@/lib/my-style-server';
import { stripInlineLatex } from '@/lib/note-format';
import {
  buildHumanizeSystem,
  humanizeAttemptBudget,
  humanizeMaxTokens,
  humanizeSkipped,
  humanizeWithChecks,
  HumanizeTimeoutError,
  type HumanizeInfo,
  type HumanizeKind,
} from '@/lib/humanize';

export interface HumanizeTextOptions {
  text: string;
  kind: HumanizeKind;
  userId: string;
  /** 画面の ☑（API は opt-in・既定 false＝従来どおり） */
  enabled: boolean;
  /** ルートの締切（epoch ms・humanizeDeadline で算出）。無ければ 1回 100 秒の固定 */
  deadlineAt?: number;
}

export interface HumanizeTextResult {
  text: string;
  info: HumanizeInfo;
}

/**
 * 本文を整えて、採用した本文と結果の記録を返す。失敗・時間切れ・数字の検査に当たったときは
 * 整える前の本文をそのまま返す（throw しない）。
 */
export async function humanizeText(opts: HumanizeTextOptions): Promise<HumanizeTextResult> {
  const startedAt = Date.now();
  const model = GEMINI_TEXT_MODEL;
  if (!opts.enabled) return { text: opts.text, info: humanizeSkipped(opts.text, model, 'off') };
  if (!process.env.GEMINI_API_KEY) {
    return { text: opts.text, info: { ...humanizeSkipped(opts.text, model, 'error'), detail: 'GEMINI_API_KEY が未設定です' } };
  }

  // 口調のサンプル＝マイ文体（院長自身の文章のみ・未設定は空文字＝渡さない）
  const styleBlock = await getMyStylePrompt(opts.userId).catch(() => '');
  const usage = { input: 0, output: 0 };

  const outcome = await humanizeWithChecks(opts.text, async (chunk, { strengthenNumbers }) => {
    const budget = humanizeAttemptBudget(opts.deadlineAt, Date.now());
    if (budget <= 0) throw new HumanizeTimeoutError();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), budget);
    try {
      const r = await callGeminiRaw({
        system: buildHumanizeSystem(styleBlock, strengthenNumbers),
        messages: [{ role: 'user', content: chunk }],
        maxTokens: humanizeMaxTokens(chunk.length),
        thinking: GEMINI_TEXT_THINKING_MEDIUM,
        signal: ac.signal,
      });
      usage.input += r.inputTokens;
      usage.output += r.outputTokens;
      return stripWrapping(r.text);
    } catch (e: unknown) {
      if (ac.signal.aborted) throw new HumanizeTimeoutError();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });

  const info: HumanizeInfo = {
    applied: outcome.applied,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    tellsBefore: outcome.tellsBefore,
    tellsAfter: outcome.tellsAfter,
    warnings: outcome.warnings,
    before: opts.text,
    model,
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    attempts: outcome.attempts,
    chunks: outcome.chunks,
    usage,
    ...(outcome.detail ? { detail: outcome.detail } : {}),
  };
  // 324: LaTeX 記法の露出を止める（決定的・冪等）。note 経路は続く formatOneSentencePerLine でも同じ関数が通る＝二重でも不変。
  // Kindle 経路はここが唯一の適用点（1文1行・見出し規約は当てない・310 の固定は不変）
  return { text: stripInlineLatex(outcome.text), info };
}

/** 「修正後の最終テキストのみ」の指示をすり抜けたコードフェンス・前置きの1行を外す（本文は触らない） */
export function stripWrapping(text: string): string {
  let t = String(text ?? '').trim();
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(t);
  if (fence) t = fence[1].trim();
  t = t.replace(/^(?:修正後の最終テキスト|修正後のテキスト|最終版|以下が修正後の(?:最終)?テキストです)[:：]?\s*\n+/u, '');
  return t;
}
