import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';

type Claims = {
    role?: string;
    restaurant_id?: string;
    tenant_id?: string;
};

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function sanitizeRestaurantId(input: unknown): string {
    if (typeof input !== 'string') return '';
    const v = input.trim();
    return /^[a-zA-Z0-9_-]{3,80}$/.test(v) ? v : '';
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<Claims | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = (user.customClaims || {}) as Claims;

    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return claims;
}

function extensionFromMime(type: string): string {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
}

export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const restaurantId = sanitizeRestaurantId(form.get('restaurantId'));
        const file = form.get('file');

        if (!restaurantId) {
            return NextResponse.json({ error: 'Valid restaurantId is required' }, { status: 400 });
        }

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'file is required' }, { status: 400 });
        }

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            return NextResponse.json({ error: 'Only PNG, JPG, JPEG, or WEBP files are allowed' }, { status: 400 });
        }

        if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: 'File size must be between 1 byte and 2MB' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = extensionFromMime(file.type);
        const objectPath = `restaurants/${restaurantId}/branding/logo-${Date.now()}.${ext}`;

        const configuredBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        const storage = configuredBucket
            ? getStorage().bucket(configuredBucket)
            : getStorage().bucket();

        const object = storage.file(objectPath);
        await object.save(buffer, {
            resumable: false,
            metadata: {
                contentType: file.type,
                cacheControl: 'public, max-age=3600',
            },
        });

        const [signedUrl] = await object.getSignedUrl({
            action: 'read',
            expires: '01-01-2500',
        });

        await adminFirestore.doc(`restaurants/${restaurantId}`).set({
            branding: {
                logoUrl: signedUrl,
            },
            logo_url: signedUrl,
            updated_at: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({ success: true, logoUrl: signedUrl });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to upload logo' }, { status: 500 });
    }
}
