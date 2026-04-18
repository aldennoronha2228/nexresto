export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  aiControlEnabled: String(process.env.AI_CONTROL_ENABLED || 'true').toLowerCase() === 'true',
};
