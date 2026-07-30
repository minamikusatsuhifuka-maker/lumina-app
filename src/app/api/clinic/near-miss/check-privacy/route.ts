import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { checkPrivacyText } from '@/lib/privacy-check';

// 気づき/ヒヤリハット報告の個人情報チェック。
// 判定ロジック（プロンプト・モデル・パーサ・fail-closed）は lib/privacy-check.ts に集約
// （207: 過去レコードのバッチ再チェックスクリプトと共通化。基準を二重管理しない）。
// 206: fail-closed＝チェックが実行できないときは has_personal_info:true を返し、
// 既存UI（staff/near-miss・admin/near-miss）が送信をブロックして文言を表示する。

export async function POST(req: Request) {
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { text } = await req.json();

  const result = await checkPrivacyText(String(text ?? ''));
  return NextResponse.json(result);
}
