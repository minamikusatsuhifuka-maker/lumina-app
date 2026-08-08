import { test, expect } from '@playwright/test';
import { describeAnthropicError } from '../../src/lib/anthropic-error';
import { findUngroundedTerms, findBannedExpressions } from '../../src/lib/content-verify';

// ============================================================================
// 純関数の単体テスト（234【1】要件4）— ネットワーク・AI課金・認証を一切使わない
//
// 追加の経緯: 234で「目次生成が全目的で失敗」した際、真因は Anthropic の課金上限
// （HTTP 400）だったが、呼び出し側が response.ok を見ておらず、画面には
// 「JSONパース失敗」と表示された。既定スイート27件は画面が開くかしか見ておらず、
// AI経路の成否も、エラー文言の妥当性も検証していなかった（＝検出できなかった理由）。
// ここでは無料・決定的に守れる部分を単体テストで固定する。
// ============================================================================

test('U1: 課金上限のエラーが「アプリの不具合ではない」と分かる文言になる', () => {
  // 234で実際に返ってきたペイロード
  const body = {
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'You have reached your specified API usage limits. You will regain access on 2026-09-01 at 00:00 UTC.',
    },
  };
  const msg = describeAnthropicError(400, body);
  expect(msg).toContain('利用上限');
  expect(msg).toContain('アプリの不具合ではありません');
  // 原文を落とさない（復旧予定日時が院長に伝わること）
  expect(msg).toContain('2026-09-01');
  // 誤った症状名に化けていないこと（これが234の本質的な失敗）
  expect(msg).not.toContain('パース');
});

test('U2: レート制限・認証・過負荷がそれぞれ区別できる', () => {
  expect(describeAnthropicError(429, { error: { type: 'rate_limit_error', message: 'rate limited' } })).toContain('混み合っています');
  expect(describeAnthropicError(401, { error: { type: 'authentication_error', message: 'bad key' } })).toContain('認証に失敗');
  expect(describeAnthropicError(529, { error: { type: 'overloaded_error', message: 'overloaded' } })).toContain('高負荷');
  // 未知のエラーでもステータスは必ず残す
  expect(describeAnthropicError(500, null)).toContain('500');
});

test('U3: 内容検証器（233②）— 禁止表現を検出し、正当な注意喚起は検出しない', () => {
  const banned = findBannedExpressions('当院なら必ず治ります。今だけ初回無料、先着10名です。');
  const categories = banned.map((b) => b.category);
  expect(categories).toContain('効果保証・断定');
  expect(categories).toContain('限定性・希少性');
  expect(categories).toContain('費用誤認');

  // 誤検出しないこと（正当な受診案内）
  expect(findBannedExpressions('気になる症状があれば早めの受診をおすすめします。')).toHaveLength(0);
});

test('U4: 内容検証器（233②）— 素材にない固有名詞だけを警告する', () => {
  const source = '保湿剤の外用が推奨されている。2023年の調査では約60%が継続していた。';
  const generated = '保湿剤の外用が推奨されます。2023年の調査では約60%が継続。ハーバード大学の研究では92%でした。';
  const terms = findUngroundedTerms(generated, [source]).map((t) => t.term);
  expect(terms).toContain('ハーバード大学');
  expect(terms).toContain('92%');
  // 素材にある記述は警告しない
  expect(terms).not.toContain('2023年');
  expect(terms).not.toContain('60%');
});
