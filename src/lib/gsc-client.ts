import { JWT } from 'google-auth-library';

// Google Search Console (webmasters v3) クライアント
// GA4と同じサービスアカウント (xlumina-ga4) を流用
// 事前に Search Console 側で当該サービスアカウントを「所有者/フルユーザー」として追加しておくこと

const GSC_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

function getJwtClient() {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL!;
  let key = process.env.GA4_PRIVATE_KEY!;
  key = key.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');

  return new JWT({
    email,
    key,
    scopes: GSC_SCOPES,
  });
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscData {
  queries: GscRow[];
  pages: GscRow[];
}

async function querySearchAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimension: 'query' | 'page',
  rowLimit = 50,
): Promise<GscRow[]> {
  const client = getJwtClient();
  const encoded = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;

  const res = await client.request<{ rows?: GscRow[] }>({
    url,
    method: 'POST',
    data: {
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit,
      startRow: 0,
    },
  });

  return res.data.rows ?? [];
}

export async function fetchSearchConsoleData(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscData> {
  const [queries, pages] = await Promise.all([
    querySearchAnalytics(siteUrl, startDate, endDate, 'query', 50),
    querySearchAnalytics(siteUrl, startDate, endDate, 'page', 50),
  ]);

  return { queries, pages };
}
