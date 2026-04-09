import { BetaAnalyticsDataClient } from '@google-analytics/data';

function getGaClient() {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n');

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: email,
      private_key: key,
    },
  });
}

export async function fetchGaData(
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const client = getGaClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'newUsers' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
      { name: 'conversions' },
      { name: 'sessionConversionRate' },
    ],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
  });

  return response;
}

export async function fetchTopPages(
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const client = getGaClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'sessions' }],
    dimensions: [{ name: 'pagePath' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });

  return response;
}
