const UNSPLASH_HOST = 'images.unsplash.com';

const HERO_FALLBACK = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&fm=webp&w=1400&q=60';
const MENU_ITEM_FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&fm=webp&w=800&q=58';

type ImagePreset = 'hero' | 'card';

type PresetOptions = {
    width: number;
    quality: number;
};

const PRESET_OPTIONS: Record<ImagePreset, PresetOptions> = {
    hero: { width: 1400, quality: 60 },
    card: { width: 800, quality: 58 },
};

function normalizeInput(value: string | null | undefined): string {
    return (value || '').trim();
}

function optimizeUnsplashUrl(rawUrl: string, preset: ImagePreset): string {
    const { width, quality } = PRESET_OPTIONS[preset];

    try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname !== UNSPLASH_HOST) {
            return parsed.toString();
        }

        parsed.searchParams.set('auto', 'format');
        parsed.searchParams.set('fit', 'crop');
        parsed.searchParams.set('fm', 'webp');
        parsed.searchParams.set('w', String(width));
        parsed.searchParams.set('q', String(quality));

        return parsed.toString();
    } catch {
        return rawUrl;
    }
}

function optimizePublicImageUrl(url: string, preset: ImagePreset): string {
    const value = normalizeInput(url);
    if (!value) {
        return preset === 'hero' ? HERO_FALLBACK : MENU_ITEM_FALLBACK;
    }

    if (value.startsWith('/')) {
        return value;
    }

    if (!/^https?:\/\//i.test(value)) {
        return preset === 'hero' ? HERO_FALLBACK : MENU_ITEM_FALLBACK;
    }

    return optimizeUnsplashUrl(value, preset);
}

export function getOptimizedHeroImageSrc(url: string | null | undefined): string {
    return optimizePublicImageUrl(url || '', 'hero');
}

export function getOptimizedMenuItemImageSrc(url: string | null | undefined): string {
    return optimizePublicImageUrl(url || '', 'card');
}
