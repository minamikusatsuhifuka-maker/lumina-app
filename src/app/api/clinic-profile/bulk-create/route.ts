import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

interface FileText {
  fileName: string;
  text: string;
}

// タイトル正規化：前後空白除去・連続空白(全角/半角)を単一半角に圧縮・大小文字無視
// → 見た目が微妙に違う(空白の数など)タイトルも「同一資料」とみなして重複判定する
function normalizeTitle(title: string): string {
  return (title || '')
    .trim()
    .replace(/[\s　]+/g, ' ') // 全角・半角スペース → 単一半角スペース
    .toLowerCase();
}

// ファイル名 → プロファイル名（拡張子を除去）
function toProfileName(fileName: string): string {
  return (fileName ?? '無題').replace(/\.(pdf|docx?|doc|txt|md)$/i, '');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  const { fileTexts, dryRun } = (await req.json()) as { fileTexts: FileText[]; dryRun?: boolean };
  if (!Array.isArray(fileTexts) || fileTexts.length === 0) {
    return NextResponse.json({ error: 'fileTextsが必要です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // 1. 既存タイトル一覧を取得して正規化マップを作る（同一ユーザー内のみで重複判定）
  const existing = await sql`
    SELECT id, name FROM clinic_profiles WHERE user_id = ${userId}
  `;
  const existingMap = new Map<string, number>();
  for (const r of existing) existingMap.set(normalizeTitle(r.name), r.id as number);

  // 2. 取り込み対象を整形（空テキストはスキップ）
  //    バッチ内で同一正規化タイトルが複数ある場合は「後勝ち」で1件に集約
  const batchMap = new Map<string, { name: string; text: string }>();
  for (const { fileName, text } of fileTexts) {
    if (!text || !text.trim()) continue;
    const name = toProfileName(fileName);
    batchMap.set(normalizeTitle(name), { name, text });
  }
  const items = Array.from(batchMap.values());

  // 3. 重複件数の集計（dryRun・本実行で共通）
  const duplicateTitles: string[] = [];
  let willInsert = 0;
  let willUpdate = 0;
  for (const it of items) {
    if (existingMap.has(normalizeTitle(it.name))) {
      willUpdate++;
      duplicateTitles.push(it.name);
    } else {
      willInsert++;
    }
  }

  // 4. dryRun=true：重複チェックだけ返す（フロントで確認ダイアログを出すため）
  if (dryRun) {
    return NextResponse.json({ dryRun: true, willInsert, willUpdate, duplicateTitles });
  }

  // 5. dryRun=false：上書き + 新規追加を実行
  const created: { id: number; name: string }[] = [];
  const updated: { id: number; name: string }[] = [];
  for (const it of items) {
    const existingId = existingMap.get(normalizeTitle(it.name));
    if (existingId) {
      // 既存を上書き（content のみ更新。id・created_at・name は維持、updated_at を更新）
      const [row] = await sql`
        UPDATE clinic_profiles
        SET content = ${it.text},
            updated_at = NOW()
        WHERE id = ${existingId} AND user_id = ${userId}
        RETURNING id, name
      `;
      if (row) updated.push({ id: row.id as number, name: row.name as string });
    } else {
      // 新規追加
      const [row] = await sql`
        INSERT INTO clinic_profiles
          (user_id, name, description, content, sections, is_default)
        VALUES (
          ${userId},
          ${it.name},
          ${'ファイルから自動インポート'},
          ${it.text},
          ${'[]'}::jsonb,
          ${false}
        )
        RETURNING id, name
      `;
      if (row) created.push({ id: row.id as number, name: row.name as string });
    }
  }

  return NextResponse.json({
    created,
    updated,
    inserted: created.length,
    updatedCount: updated.length,
    count: created.length + updated.length,
  });
}
