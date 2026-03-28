const FALLBACK_ORIGIN = 'http://localhost:3000';

function normalizeOrigin(raw: string): string | null {
    const value = (raw || '').trim();
    if (!value) return null;

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const parsed = new URL(withProtocol);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        parsed.hash = '';
        parsed.search = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

export function getSiteOrigin(): string {
    const candidates = [
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NEXT_PUBLIC_MENU_BASE_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeOrigin(candidate || '');
        if (normalized) return normalized;
    }

    return FALLBACK_ORIGIN;
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
