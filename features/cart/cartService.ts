import { getCartEndpoint } from './index';

export async function requestBill(restaurantId: string, tableId: string, token: string): Promise<void> {
  const response = await fetch(getCartEndpoint('/customer/session/request-bill'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ restaurantId, tableId }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error || 'Failed to request bill'));
  }
}
