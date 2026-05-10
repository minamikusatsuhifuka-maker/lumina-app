import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface MedicalDocPostBody {
  docType: string;
  title: string;
  procedureName?: string | null;
  content?: string;
  researchBasis?: string | null;
  refs?: unknown[];
  isTemplate?: boolean;
}

interface MedicalDocPatchBody {
  id: number;
  title?: string | null;
  content?: string | null;
  procedureName?: string | null;
  status?: string | null;
  isTemplate?: boolean | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const docType = searchParams.get('type');
  const id = searchParams.get('id');

  try {
    if (id) {
      const rows = await sql`
        SELECT * FROM medical_documents
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      return NextResponse.json({ doc: rows[0] ?? null });
    }

    const docs = docType
      ? await sql`
          SELECT * FROM medical_documents
          WHERE user_id = ${userId} AND doc_type = ${docType}
          ORDER BY updated_at DESC
        `
      : await sql`
          SELECT * FROM medical_documents
          WHERE user_id = ${userId}
          ORDER BY updated_at DESC
        `;

    return NextResponse.json({ docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as MedicalDocPostBody;
    const {
      docType,
      title,
      procedureName,
      content,
      researchBasis,
      refs,
      isTemplate,
    } = body;

    if (!docType || !title) {
      return NextResponse.json(
        { error: 'docType・titleは必須です' },
        { status: 400 },
      );
    }

    const rows = await sql`
      INSERT INTO medical_documents
        (doc_type, title, procedure_name, content, research_basis, refs, is_template, user_id)
      VALUES (
        ${docType}, ${title}, ${procedureName ?? null},
        ${content ?? ''}, ${researchBasis ?? null},
        ${JSON.stringify(refs ?? [])}, ${isTemplate ?? false}, ${userId}
      )
      RETURNING *
    `;
    return NextResponse.json({ doc: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as MedicalDocPatchBody;
    const { id, title, content, procedureName, status, isTemplate } = body;

    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    const rows = await sql`
      UPDATE medical_documents SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        procedure_name = COALESCE(${procedureName ?? null}, procedure_name),
        status = COALESCE(${status ?? null}, status),
        is_template = COALESCE(${isTemplate ?? null}, is_template),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    return NextResponse.json({ doc: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    await sql`
      DELETE FROM medical_documents
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
