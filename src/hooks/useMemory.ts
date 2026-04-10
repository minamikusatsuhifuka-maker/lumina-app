import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useMemory() {
  const { data, error, isLoading, mutate } = useSWR(
    '/api/memory',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );

  return {
    memories: Array.isArray(data) ? data : [],
    isLoading,
    error,
    refresh: mutate,
  };
}
