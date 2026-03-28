import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { adminFirestore } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif']);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const HERO_TARGET_BYTES = 150 * 1024;
const LOGO_TARGET_BYTES = 80 * 1024;

function sanitizeRestaurantId(input: unknown): string {
    if (typeof input !== 'string') return '';
    const v = input.trim();
    return /^[a-zA-Z0-9_-]{3,80}$/.test(v) ? v : '';
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<true | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const authz = await authorizeTenantAccess(token, restaurantId, 'manage');
    if (!authz) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return true;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

async function optimizeToWebp(
    source: Buffer,
    {
        width,
        targetBytes,
        startQuality,
    }: {
        width: number;
        targetBytes: number;
        startQuality: number;
    }
): Promise<Buffer> {
    let quality = startQuality;
    let output = source;

    while (quality >= 45) {
        output = await sharp(source)
            .rotate()
            .resize({
                width,
                withoutEnlargement: true,
            })
            .webp({ quality, effort: 4 })
            .toBuffer();

        if (output.length <= targetBytes) {
            return output;
        }

        quality -= 7;
    }

    return output;
}

export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const restaurantId = sanitizeRestaurantId(form.get('restaurantId'));
        const file = form.get('file');
        const assetTypeRaw = typeof form.get('assetType') === 'string' ? String(form.get('assetType')) : 'logo';
        const assetType = assetTypeRaw === 'hero' ? 'hero' : 'logo';

        if (!restaurantId) {
            return NextResponse.json({ error: 'Valid restaurantId is required' }, { status: 400 });
        }

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'file is required' }, { status: 400 });
        }

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            return NextResponse.json({ error: 'Only PNG, JPG, JPEG, WEBP, or AVIF files are allowed' }, { status: 400 });
        }

        if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: 'File size must be between 1 byte and 2MB' }, { status: 400 });
        }

        const originalBuffer = Buffer.from(await file.arrayBuffer());
        const optimizedBuffer = await optimizeToWebp(originalBuffer, assetType === 'hero'
            ? {
                width: 1600,
                targetBytes: HERO_TARGET_BYTES,
                startQuality: 70,
            }
            : {
                width: 512,
                targetBytes: LOGO_TARGET_BYTES,
                startQuality: 80,
            });
        const objectPath = `restaurants/${restaurantId}/branding/${assetType}-${Date.now()}.webp`;

        const configuredBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        const storage = configuredBucket
            ? getStorage().bucket(configuredBucket)
            : getStorage().bucket();

        const object = storage.file(objectPath);
        await object.save(optimizedBuffer, {
            resumable: false,
            metadata: {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000, immutable',
            },
        });

        const [signedUrl] = await object.getSignedUrl({
            action: 'read',
            expires: '01-01-2500',
        });

        const updatedAt = new Date().toISOString();

        if (assetType === 'hero') {
            await adminFirestore.doc(`restaurants/${restaurantId}`).set({
                branding: {
                    heroImageUrl: signedUrl,
                },
                updated_at: updatedAt,
            }, { merge: true });

            await adminFirestore.doc(`branding/${restaurantId}`).set({
                restaurantId,
                heroImageUrl: signedUrl,
                updated_at: updatedAt,
            }, { merge: true });
        } else {
            await adminFirestore.doc(`restaurants/${restaurantId}`).set({
                branding: {
                    logoUrl: signedUrl,
                },
                logo_url: signedUrl,
                updated_at: updatedAt,
            }, { merge: true });

            await adminFirestore.doc(`branding/${restaurantId}`).set({
                restaurantId,
                logoUrl: signedUrl,
                updated_at: updatedAt,
            }, { merge: true });
        }

        return NextResponse.json({
            success: true,
            logoUrl: signedUrl,
            assetType,
            originalBytes: originalBuffer.length,
            optimizedBytes: optimizedBuffer.length,
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: errorMessage(error, 'Failed to upload logo') }, { status: 500 });
    }
}
