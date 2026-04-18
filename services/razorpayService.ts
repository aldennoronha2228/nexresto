export type RazorpayOrderRequest = {
  amount: number;
  currency?: 'INR';
  restaurantId: string;
};

export async function createRazorpayOrder(token: string, request: RazorpayOrderRequest) {
  const response = await fetch('/api/payment/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...request, currency: 'INR' }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Failed to create Razorpay order'));
  }

  return payload;
}
