// 校正の「前後比較つき保存」（proofread_saves）のクライアントヘルパー。
// 自動退避（feature_result_drafts・feature_key='proofread'・最新1件）とは役割が別で、
// こちらは明示保存＝複数件を残す正式保存。保存一覧から比較ビューを再現するために使う。

import type { AppliedFix } from '@/components/proofread/ProofreadDiffPane';

// 一覧行（本文は含まない。ペイロード対策で開いたときに単体取得する）
export interface ProofreadSaveSummary {
  id: number;
  title: string;
  created_at: string;
  source_char_count: number;
  work_char_count: number;
  fix_count: number;
}

// 単体取得（比較ビュー再現に必要な一式）
export interface ProofreadSaveDetail {
  id: number;
  title: string;
  source_text: string;
  work_text: string;
  corrections: AppliedFix[];
  created_at: string;
}

export async function listProofreadSaves(): Promise<ProofreadSaveSummary[]> {
  const res = await fetch('/api/proofread/saves');
  if (!res.ok) throw new Error('保存一覧の取得に失敗しました');
  const data = await res.json();
  return Array.isArray(data?.saves) ? data.saves : [];
}

export async function getProofreadSave(id: number): Promise<ProofreadSaveDetail> {
  const res = await fetch(`/api/proofread/saves?id=${id}`);
  if (!res.ok) throw new Error('保存内容の取得に失敗しました');
  const data = await res.json();
  const save = data?.save;
  if (!save) throw new Error('保存内容が見つかりません');
  return {
    ...save,
    corrections: Array.isArray(save.corrections) ? save.corrections : [],
  } as ProofreadSaveDetail;
}

export async function createProofreadSave(input: {
  title: string;
  sourceText: string;
  workText: string;
  corrections: AppliedFix[];
}): Promise<void> {
  const res = await fetch('/api/proofread/saves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '保存に失敗しました');
  }
}

export async function deleteProofreadSave(id: number): Promise<void> {
  const res = await fetch(`/api/proofread/saves?id=${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('削除に失敗しました');
}

// 保存一覧 →「校正画面で大きく前後比較」への受け渡し（横断分析の handoff と同方式）
export const PROOFREAD_HANDOFF_KEY = 'lumina_proofread_open';

export interface ProofreadHandoff {
  title: string;
  before: string;
  after: string;
  fixes: AppliedFix[];
}

export function setProofreadHandoff(payload: ProofreadHandoff): void {
  try {
    sessionStorage.setItem(PROOFREAD_HANDOFF_KEY, JSON.stringify(payload));
  } catch {}
}

// 一度読んだら消す（戻ってくるたびに上書き復元されないように）
export function takeProofreadHandoff(): ProofreadHandoff | null {
  try {
    const raw = sessionStorage.getItem(PROOFREAD_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PROOFREAD_HANDOFF_KEY);
    const parsed = JSON.parse(raw);
    if (typeof parsed?.before !== 'string' || typeof parsed?.after !== 'string') {
      return null;
    }
    return {
      title: String(parsed.title ?? ''),
      before: parsed.before,
      after: parsed.after,
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
    };
  } catch {
    return null;
  }
}
