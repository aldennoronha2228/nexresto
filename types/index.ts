export type TenantRole = 'owner' | 'manager' | 'staff' | 'super_admin';

export type CurrencyCode = 'INR';

export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}
