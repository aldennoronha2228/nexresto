import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendDemoRequestNotificationEmail } from '@/lib/email';

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

function toIsoString(value: unknown): string | null {
  try {
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const millis = value < 1e12 ? value * 1000 : value;
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const snapshot = await adminFirestore
      .collection('demo_requests')
      .orderBy('created_at', 'desc')
      .limit(250)
      .get();

    const submissions = snapshot.docs.map((doc) => {
      const d = doc.data() || {};
      const createdAt =
        toIsoString(d.created_at) ||
        toIsoString(d.createdAt) ||
        toIsoString(d.requested_at) ||
        toIsoString(d.submitted_at) ||
        toIsoString(doc.createTime) ||
        new Date().toISOString();

      const contactName = String(d.contact_name || d.name || '');
      const businessEmail = String(d.business_email || '');
      const phone = String(d.phone || '');
      const restaurantName = String(d.restaurant_name || '');
      const outletCount = String(d.outlet_count || '');
      const qrRequirements = String(d.qr_requirements || '');

      return {
        id: doc.id,
        // Keep legacy keys for compatibility.
        name: contactName,
        createdAt,
        // Full fields used by the current home page + super admin flow.
        contactName,
        businessEmail,
        phone,
        restaurantName,
        outletCount,
        qrRequirements,
        status: String(d.status || 'new'),
      };
    });

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('[demo-requests] Failed to load submissions:', error);
    return NextResponse.json({ error: 'Failed to load demo requests' }, { status: 500 });
  }
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

    const superAdminEmail = cleanString(process.env.SUPER_ADMIN_EMAIL, 160).toLowerCase();
    if (superAdminEmail && isValidEmail(superAdminEmail)) {
      const notificationResult = await sendDemoRequestNotificationEmail({
        to: superAdminEmail,
        requestId: ref.id,
        contactName,
        businessEmail,
        phone,
        restaurantName,
        outletCount,
        qrRequirements,
      });

      if (notificationResult.success) {
        await adminFirestore
          .doc(`demo_requests/${ref.id}`)
          .set(
            {
              notification_email_sent_at: FieldValue.serverTimestamp(),
              notification_email_to: superAdminEmail,
              notification_email_provider_id: notificationResult.providerMessageId || null,
            },
            { merge: true }
          );
      } else {
        console.error('[demo-requests] Notification email failed:', notificationResult.error);
        await adminFirestore.collection('global_logs').add({
          event_type: 'DEMO_REQUEST_NOTIFICATION_EMAIL_FAILED',
          message: `Failed to send demo request notification for ${restaurantName}`,
          severity: 'warning',
          metadata: {
            request_id: ref.id,
            to: superAdminEmail,
            error: notificationResult.error || 'Unknown email error',
          },
          tenant_id: null,
          user_id: null,
          restaurant_name: restaurantName,
          created_at: FieldValue.serverTimestamp(),
        });
      }
    } else {
      console.warn('[demo-requests] SUPER_ADMIN_EMAIL is missing or invalid, skipping notification email');
    }

    return NextResponse.json({ ok: true, requestId: ref.id }, { status: 201 });
  } catch (error) {
    console.error('[demo-requests] Failed to create request:', error);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}
