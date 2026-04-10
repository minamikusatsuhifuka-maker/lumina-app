import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useNotifications() {
  const { data, mutate } = useSWR(
    '/api/notifications',
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    refresh: mutate,
  };
}
