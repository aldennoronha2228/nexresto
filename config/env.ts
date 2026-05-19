import { getSiteOrigin } from '@/lib/seo/url';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || getSiteOrigin();

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || appUrl;

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl,
  siteUrl,
  aiControlEnabled: String(process.env.AI_CONTROL_ENABLED || 'true').toLowerCase() === 'true',
};
