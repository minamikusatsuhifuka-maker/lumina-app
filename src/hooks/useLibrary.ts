import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useLibrary(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/library?${params.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      keepPreviousData: true,
    }
  );

  return {
    items: Array.isArray(data) ? data : [],
    isLoading,
    error,
    refresh: mutate,
  };
}
