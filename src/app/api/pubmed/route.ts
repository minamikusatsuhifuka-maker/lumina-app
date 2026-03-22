import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { query, maxResults = 5 } = await req.json();

    // PubMed ESearch
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const ids = searchData.esearchresult?.idlist || [];

    if (ids.length === 0) return NextResponse.json({ papers: [] });

    // PubMed EFetch
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
    const fetchRes = await fetch(fetchUrl);
    const xmlText = await fetchRes.text();

    // XML簡易パース
    const papers = ids.map((id: string) => {
      const titleMatch = xmlText.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const abstractMatch = xmlText.match(/<AbstractText[^>]*>([^<]+)<\/AbstractText>/);
      return {
        pmid: id,
        title: titleMatch?.[1] || 'タイトル不明',
        abstract: abstractMatch?.[1] || '要旨なし',
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });

    return NextResponse.json({ papers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
