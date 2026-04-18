export async function fetchMenuItems(restaurantId: string, token: string) {
  const response = await fetch(`/api/menu/list?restaurantId=${encodeURIComponent(restaurantId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Failed to fetch menu items'));
  }

  return payload;
}
