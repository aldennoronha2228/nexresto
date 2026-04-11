const DEV_FALLBACK_ORIGIN = 'http://localhost:3000';
const PROD_FALLBACK_ORIGIN = 'https://nexresto.in';

function normalizeOrigin(raw: string): string | null {
    const value = (raw || '').trim();
    if (!value) return null;

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const parsed = new URL(withProtocol);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        if (!isLocalHost(parsed.hostname) && parsed.protocol === 'http:') {
            parsed.protocol = 'https:';
        }
        parsed.pathname = '/';
        parsed.hash = '';
        parsed.search = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

function isLocalHost(hostname: string): boolean {
    const value = (hostname || '').toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0' || value.endsWith('.local');
}

function isLocalOrigin(origin: string): boolean {
    try {
        const parsed = new URL(origin);
        return isLocalHost(parsed.hostname);
    } catch {
        return false;
    }
}

export function getSiteOrigin(): string {
    const isProduction = process.env.NODE_ENV === 'production';
    const candidates = [
        process.env.SEO_SITE_ORIGIN,
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL,
        process.env.NEXT_PUBLIC_MENU_BASE_URL,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeOrigin(candidate || '');
        if (!normalized) continue;
        if (isProduction && isLocalOrigin(normalized)) continue;
        return normalized;
    }

    return isProduction ? PROD_FALLBACK_ORIGIN : DEV_FALLBACK_ORIGIN;
}

export function normalizeCanonicalPath(inputPath: string): string {
    const value = (inputPath || '/').trim();
    let pathname = value;

    try {
        const asUrl = new URL(value, getSiteOrigin());
        pathname = asUrl.pathname;
    } catch {
        const qIndex = value.indexOf('?');
        const hIndex = value.indexOf('#');
        const cut = [qIndex, hIndex].filter((idx) => idx >= 0).sort((a, b) => a - b)[0];
        pathname = cut === undefined ? value : value.slice(0, cut);
    }

    if (!pathname.startsWith('/')) pathname = `/${pathname}`;
    pathname = pathname.replace(/\/{2,}/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    return pathname || '/';
}

export function buildAbsoluteUrl(path: string): string {
    const origin = getSiteOrigin();
    const pathname = normalizeCanonicalPath(path);
    return new URL(pathname, origin).toString();
}
