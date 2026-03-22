import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query, field, year } = await req.json();
  let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=10&fields=title,authors,abstract,year,citationCount,externalIds`;
  if (field) url += `&fieldsOfStudy=${encodeURIComponent(field)}`;
  if (year) url += `&year=${year}-`;
  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data);
}
