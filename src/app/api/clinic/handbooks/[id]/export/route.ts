import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { format } = await req.json();
  if (!format || (format !== 'txt' && format !== 'md')) {
    return NextResponse.json({ error: 'format は txt または md を指定してください' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const handbookRows = await sql`SELECT * FROM handbooks WHERE id = ${id}`;
  if (!handbookRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const handbook = handbookRows[0];

  const chapters = await sql`SELECT * FROM handbook_chapters WHERE handbook_id = ${id} ORDER BY order_index`;

  let content = '';
  const title = handbook.title as string;

  if (format === 'md') {
    content = `# ${title}\n\n`;
    if (handbook.description) {
      content += `${handbook.description}\n\n---\n\n`;
    }
    for (const ch of chapters) {
      content += `## ${ch.title}\n\n${ch.content}\n\n`;
    }
  } else {
    content = `${title}\n${'='.repeat(title.length * 2)}\n\n`;
    if (handbook.description) {
      content += `${handbook.description}\n\n`;
    }
    for (const ch of chapters) {
      content += `${'-'.repeat(40)}\n${ch.title}\n${'-'.repeat(40)}\n\n${ch.content}\n\n`;
    }
  }

  const ext = format === 'md' ? 'md' : 'txt';
  const contentType = format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
  const fileName = `${title}.${ext}`;

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
