export async function fetchAuthProfile(token: string) {
  const response = await fetch('/api/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Failed to fetch auth profile'));
  }

  return payload;
}
