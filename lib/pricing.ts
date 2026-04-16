export type PricingPlan = {
  name: string;
  subtitle: string;
  priceInr: string;
  priceUsd: string;
  cta: string;
  featured?: boolean;
  detailTitle: string;
  details: string[];
};

export type MatrixRow = {
  feature: string;
  starter: boolean;
  growth: boolean;
  pro: boolean;
};

export type HomePricingPlan = {
  name: string;
  price: string;
  cadence: string;
  highlighted?: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Starter',
    subtitle: 'Up to 15 tables · Go digital',
    priceInr: 'Rs 999',
    priceUsd: '$12/mo',
    cta: 'Start with Starter',
    detailTitle: 'Included:',
    details: [
      'QR code per table',
      'Customer PWA - no app download',
      'Kitchen Display (KDS) - real-time',
      'Auto-print thermal receipt',
      'Basic table management + QR setup',
      'Menu management + images',
      'Reviews and complaints',
      'GST-compliant receipts',
      '2 staff roles',
    ],
  },
  {
    name: 'Growth',
    subtitle: 'Unlimited tables · AI-powered',
    priceInr: 'Rs 2,499',
    priceUsd: '$24/mo',
    cta: 'Choose Growth',
    featured: true,
    detailTitle: 'Everything in Starter, plus:',
    details: [
      'AI mood + menu chat + digest',
      'COD delivery - zero commission',
      'Group ordering - shared cart',
      'Full analytics + dish intelligence',
      'Waitlist + merged tables',
      'Invoice PDF + web push',
      'CSV import + 3 staff roles',
      'Unlimited tables',
    ],
  },
  {
    name: 'Pro Chain',
    subtitle: 'Up to 5 branches',
    priceInr: 'Rs 7,999',
    priceUsd: '$95/mo',
    cta: 'Get Pro Chain',
    detailTitle: 'Everything in Growth, plus:',
    details: [
      'Multi-branch (up to 5)',
      'White-label customer PWA',
      'Custom domain',
      'Cross-branch analytics',
      'Priority WhatsApp support',
      'Early feature access',
    ],
  },
];

export const FEATURE_MATRIX: MatrixRow[] = [
  { feature: 'QR code ordering (PWA)', starter: true, growth: true, pro: true },
  { feature: 'Customer PWA - no app download', starter: true, growth: true, pro: true },
  { feature: 'Kitchen Display System (KDS)', starter: true, growth: true, pro: true },
  { feature: 'Interactive floor plan', starter: false, growth: true, pro: true },
  { feature: 'Cafe mode - batch by item', starter: true, growth: true, pro: true },
  { feature: 'Combo deals and offers', starter: true, growth: true, pro: true },
  { feature: 'Menu management + images', starter: true, growth: true, pro: true },
  { feature: 'Reviews and complaints', starter: true, growth: true, pro: true },
  { feature: 'Analytics dashboard', starter: false, growth: true, pro: true },
  { feature: 'Custom branding', starter: false, growth: true, pro: true },
  { feature: 'AI mood + menu chat', starter: false, growth: true, pro: true },
  { feature: 'Multi-branch analytics', starter: false, growth: false, pro: true },
  { feature: 'Custom API integration', starter: false, growth: false, pro: true },
];

export const HOME_PRICING_PLANS: HomePricingPlan[] = [
  { name: 'Starter', price: 'Rs 999', cadence: '/month' },
  { name: 'Growth', price: 'Rs 2,499', cadence: '/month', highlighted: true },
  { name: 'Pro Chain', price: 'Rs 7,999', cadence: '/month' },
];

export const STARTING_PRICE_INR = 'Rs 999';
