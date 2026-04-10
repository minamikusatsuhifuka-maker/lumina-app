import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useStats() {
  const { data, isLoading } = useSWR(
    '/api/stats',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );

  return {
    stats: data,
    isLoading,
  };
}
