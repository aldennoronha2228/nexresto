export async function fetchLiveOrders(restaurantId: string, token: string) {
  const response = await fetch(`/api/orders/live?restaurantId=${encodeURIComponent(restaurantId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Failed to fetch live orders'));
  }

  return payload;
}
