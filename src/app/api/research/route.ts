import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { query, field, year } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: 'クエリが必要です' }, { status: 400 });
    }

    const encodedQuery = encodeURIComponent(query.trim());
    let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=10&fields=title,authors,abstract,year,citationCount,externalIds,fieldsOfStudy`;

    if (field) url += `&fieldsOfStudy=${encodeURIComponent(field)}`;
    if (year) url += `&year=${year}-`;

    console.log('[research] Searching:', query);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'LUMINA-App/1.0' },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[research] API error:', res.status, errorText);
      return NextResponse.json({ error: `検索APIエラー: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    console.log('[research] Results:', data.data?.length || 0, 'papers');
    return NextResponse.json(data);

  } catch (error) {
    console.error('[research] Unexpected error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
