import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';

type DemoRequestPayload = {
    contactName?: unknown;
    businessEmail?: unknown;
    phone?: unknown;
    restaurantName?: unknown;
    outletCount?: unknown;
    qrRequirements?: unknown;
};

const VALID_OUTLET_COUNTS = new Set([
    '1 Outlet',
    '2-5 Outlets',
    '6-20 Outlets',
    '20+ Outlets',
]);

function cleanString(value: unknown, maxLength: number): string {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }

    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;

    return 'unknown';
}

export async function POST(request: NextRequest) {
    try {
        const raw = (await request.json()) as DemoRequestPayload;

        const contactName = cleanString(raw.contactName, 80);
        const businessEmail = cleanString(raw.businessEmail, 120).toLowerCase();
        const phone = cleanString(raw.phone, 32);
        const restaurantName = cleanString(raw.restaurantName, 120);
        const outletCount = cleanString(raw.outletCount, 40);
        const qrRequirements = cleanString(raw.qrRequirements, 1200);

        if (!contactName || contactName.length < 2) {
            return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
        }
        if (!businessEmail || !isValidEmail(businessEmail)) {
            return NextResponse.json({ error: 'Valid business email is required' }, { status: 400 });
        }
        if (!phone || phone.length < 7) {
            return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 });
        }
        if (!restaurantName || restaurantName.length < 2) {
            return NextResponse.json({ error: 'Restaurant name is required' }, { status: 400 });
        }
        if (!VALID_OUTLET_COUNTS.has(outletCount)) {
            return NextResponse.json({ error: 'Please select a valid outlet count' }, { status: 400 });
        }

        const clientIp = getClientIp(request);
        const ipLimit = checkRateLimit(clientIp, 'demo_request_ip', 8, 600);
        if (!ipLimit.allowed) {
            return NextResponse.json(
                { error: `Too many requests. Retry in ${ipLimit.retryAfterSecs}s` },
                { status: 429 }
            );
        }

        const emailLimit = checkRateLimit(businessEmail, 'demo_request_email', 3, 1800);
        if (!emailLimit.allowed) {
            return NextResponse.json(
                { error: `Too many requests for this email. Retry in ${emailLimit.retryAfterSecs}s` },
                { status: 429 }
            );
        }

        const ref = await adminFirestore.collection('demo_requests').add({
            contact_name: contactName,
            business_email: businessEmail,
            phone,
            restaurant_name: restaurantName,
            outlet_count: outletCount,
            qr_requirements: qrRequirements,
            source: 'website-homepage',
            status: 'new',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        });

        await adminFirestore.collection('global_logs').add({
            event_type: 'DEMO_REQUEST_CREATED',
            message: `New demo request from ${restaurantName}`,
            severity: 'info',
            metadata: {
                request_id: ref.id,
                contact_name: contactName,
                business_email: businessEmail,
                outlet_count: outletCount,
            },
            tenant_id: null,
            user_id: null,
            restaurant_name: restaurantName,
            created_at: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ ok: true, requestId: ref.id }, { status: 201 });
    } catch (error) {
        console.error('[demo-requests] Failed to create request:', error);
        return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
    }
}
