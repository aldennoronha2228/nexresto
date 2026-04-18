export * from './cartService';
export * from './CartUI';

export function getCartEndpoint(path: string): string {
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
}
