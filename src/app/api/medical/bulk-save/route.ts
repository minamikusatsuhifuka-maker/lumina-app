import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface BulkSaveDoc {
  docType: string;
  content?: string;
}

interface BulkSaveRequest {
  procedureName: string;
  docs: BulkSaveDoc[];
}

const labelFor = (docType: string): string => {
  if (docType === 'consent_dermatology') return '皮膚科診療同意書';
  if (docType === 'consent_cosmetic') return '美容施術同意書';
  if (docType === 'explanation') return '患者説明書';
  if (docType === 'aftercare') return 'アフターケア指導書';
  return docType;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as BulkSaveRequest;
    const { procedureName, docs } = body;
    if (!procedureName || !Array.isArray(docs)) {
      return NextResponse.json(
        { error: 'procedureNameとdocsは必須です' },
        { status: 400 },
      );
    }

    const saved: Array<{ id: number; title: string }> = [];
    for (const doc of docs) {
      if (!doc.content) continue;
      const title = `${labelFor(doc.docType)}：${procedureName}`;
      const rows = await sql`
        INSERT INTO medical_documents
          (doc_type, title, procedure_name, content, user_id)
        VALUES (
          ${doc.docType}, ${title}, ${procedureName},
          ${doc.content}, ${userId}
        )
        RETURNING id, title
      `;
      const row = rows[0] as { id: number; title: string };
      if (row) saved.push(row);
    }

    return NextResponse.json({ saved, count: saved.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
