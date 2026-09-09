// 319: 🔭 追加リサーチのサーバ専用（DB）。前提資料の取得（315/317 の fetchVisualSources と同じ取得）・
// 「🔭 追加: n」の集計と一覧（library.metadata.followUp.of から導出）・用途カテゴリ／マイフォルダの継承（297・298 の既存関数を呼ぶだけ）
import { sql } from '@/lib/db';
import { fetchVisualSources } from '@/lib/visuals-server';
import { ensurePurposeTables, getPurposeIdsForItems, setItemPurposes } from '@/lib/purpose-categories';
import { ensureCustomFolderTables, getFolderIdsForItems, setItemFolders } from '@/lib/custom-folders';
import { FOLLOWUP_MAX_SOURCES, type FollowUpMeta, type FollowUpOf, type FollowUpRef, type FollowUpScope, type FollowUpSource, parseFollowUp } from '@/lib/followup-research';

/** 前提資料の本文（本人のものだけ・入力順を保つ・存在しない参照は missing に分ける＝「資料なし」で無効化する材料） */
export async function fetchFollowUpSources(userId: string, refs: readonly FollowUpRef[]): Promise<{ sources: FollowUpSource[]; missing: FollowUpRef[] }> {
  const limited = refs.slice(0, FOLLOWUP_MAX_SOURCES);
  const byScope = new Map<FollowUpScope, string[]>();
  for (const r of limited) byScope.set(r.scope, [...(byScope.get(r.scope) ?? []), r.id]);
  const found = new Map<string, FollowUpSource>();
  for (const [scope, ids] of byScope) {
    const rows = await fetchVisualSources(userId, scope, ids);
    for (const row of rows) found.set(`${scope}:${row.id}`, { scope, id: row.id, title: row.title, text: row.text });
  }
  const sources: FollowUpSource[] = [];
  const missing: FollowUpRef[] = [];
  for (const r of limited) {
    const s = found.get(`${r.scope}:${r.id}`);
    if (s) sources.push(s);
    else missing.push(r);
  }
  return { sources, missing };
}

export interface FollowUpResultRow {
  id: string;
  title: string;
  created_at: string;
  followUp: FollowUpMeta;
}

/** metadata に followUp を持つ本人の行（TEXT 列なので LIKE で絞ってから JS で形を検証する＝309 の listArticlesFromChart と同じ流儀） */
async function listFollowUpRows(userId: string): Promise<FollowUpResultRow[]> {
  const rows = (await sql`
    SELECT id, title, metadata, created_at FROM library
    WHERE user_id = ${userId} AND metadata LIKE ${'%"followUp":%'}
    ORDER BY created_at DESC
    LIMIT 1000
  `) as { id: string; title: string | null; metadata: string | null; created_at: string }[];
  const out: FollowUpResultRow[] = [];
  for (const r of rows) {
    const f = parseFollowUp(r.metadata);
    if (!f) continue;
    out.push({ id: String(r.id), title: r.title ?? '', created_at: r.created_at, followUp: f });
  }
  return out;
}

/** 元資料ごとの「🔭 追加: n」（of に含む結果の件数） */
export async function countFollowUpsBySources(userId: string, scope: FollowUpScope, ids: readonly string[]): Promise<Record<string, number>> {
  const keys = new Set(ids.map(String).filter(Boolean).slice(0, 500));
  const out: Record<string, number> = {};
  if (keys.size === 0) return out;
  for (const r of await listFollowUpRows(userId)) {
    for (const o of r.followUp.of) {
      if (o.scope === scope && keys.has(o.item_key)) out[o.item_key] = (out[o.item_key] ?? 0) + 1;
    }
  }
  return out;
}

/** 元資料1件から作った追加リサーチの一覧（新しい順・ポップアップ用） */
export async function listFollowUpsOf(userId: string, scope: FollowUpScope, id: string): Promise<{ id: string; title: string; prompt: string; mode: string; model: string; at: string; created_at: string }[]> {
  const rows = await listFollowUpRows(userId);
  return rows
    .filter((r) => r.followUp.of.some((o) => o.scope === scope && o.item_key === String(id)))
    .map((r) => ({ id: r.id, title: r.title, prompt: r.followUp.prompt, mode: r.followUp.mode, model: r.followUp.model, at: r.followUp.at, created_at: r.created_at }));
}

/**
 * 継承（R-77 既定オン）: 元資料の用途カテゴリ・マイフォルダの**和集合**を結果（library 行）に付ける。
 * 付与は 297/298 と同じ関数（setItemPurposes／setItemFolders・置き換え式。新規行なので付与と同じ）。別の INSERT は作らない。
 * 🗂 text_analysis と 📚 library はマイフォルダ体系が同じ 'stock' なので、🗂由来のフォルダも付く（他体系は関数側が黙って弾く）
 */
export async function applyFollowUpInheritance(userId: string, libraryId: string, of: readonly FollowUpOf[]): Promise<{ purposes: number[]; folders: number[] }> {
  await ensurePurposeTables();
  await ensureCustomFolderTables();
  const byScope = new Map<FollowUpScope, string[]>();
  for (const o of of) byScope.set(o.scope, [...(byScope.get(o.scope) ?? []), o.item_key]);
  const purposes = new Set<number>();
  const folders = new Set<number>();
  for (const [scope, keys] of byScope) {
    const p = await getPurposeIdsForItems(userId, scope, keys);
    for (const ids of Object.values(p)) for (const id of ids) purposes.add(id);
    const f = await getFolderIdsForItems(userId, scope, keys);
    for (const ids of Object.values(f)) for (const id of ids) folders.add(id);
  }
  const purposeIds = [...purposes].sort((a, b) => a - b);
  const folderIds = [...folders].sort((a, b) => a - b);
  if (purposeIds.length > 0) await setItemPurposes(userId, 'library', libraryId, purposeIds);
  if (folderIds.length > 0) await setItemFolders(userId, 'library', libraryId, folderIds);
  return { purposes: purposeIds, folders: folderIds };
}
