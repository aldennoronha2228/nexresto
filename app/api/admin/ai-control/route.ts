import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type Claims = {
    role?: string;
};

type Operation = {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | boolean | null | undefined>;
    headers?: Record<string, string>;
};

const ALLOWED_PREFIXES = [
    '/api/admin/',
    '/api/tenant/',
    '/api/menu/',
    '/api/orders/',
    '/api/tables/',
    '/api/branding/',
    '/api/reports/',
    '/api/support/',
];

const BLOCKED_PATHS = [
    '/api/auth/',
    '/api/admin/ai-control',
];

const MAX_OPERATIONS_PER_REQUEST = 20;

function isAiControlEnabled(): boolean {
    return (process.env.AI_CONTROL_ENABLED || '').trim().toLowerCase() === 'true';
}

function getAiControlKey(): string {
    return (process.env.AI_CONTROL_KEY || '').trim();
}

function isAllowedPath(path: string): boolean {
    if (!path.startsWith('/api/')) return false;
    if (BLOCKED_PATHS.some((blocked) => path.startsWith(blocked))) return false;
    return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normalizeMethod(value: unknown): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
    const method = String(value || 'POST').toUpperCase();
    if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        return method;
    }
    return 'POST';
}

function sanitizeOperations(raw: unknown): Operation[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((op): Operation | null => {
            if (!op || typeof op !== 'object') return null;

            const path = String((op as any).path || '').trim();
            if (!path) return null;

            const method = normalizeMethod((op as any).method);
            const body = (op as any).body;
            const query = (op as any).query;
            const headers = (op as any).headers;

            return {
                path,
                method,
                body,
                query: query && typeof query === 'object' ? query : undefined,
                headers: headers && typeof headers === 'object' ? headers : undefined,
            };
        })
        .filter((op): op is Operation => !!op)
        .slice(0, MAX_OPERATIONS_PER_REQUEST);
}

function buildInternalUrl(origin: string, op: Operation): string {
    const url = new URL(op.path, origin);

    if (op.query) {
        for (const [key, value] of Object.entries(op.query)) {
            if (value === null || value === undefined) continue;
            url.searchParams.set(key, String(value));
        }
    }

    return url.toString();
}

async function requireSuperAdmin(request: NextRequest): Promise<{ uid: string; email: string | null } | NextResponse> {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = (user.customClaims || {}) as Claims;

    if (claims.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only super_admin can use AI control.' }, { status: 403 });
    }

    return { uid: user.uid, email: user.email || null };
}

export async function POST(request: NextRequest) {
    if (!isAiControlEnabled()) {
        return NextResponse.json(
            { error: 'AI control is disabled. Set AI_CONTROL_ENABLED=true to allow execution.' },
            { status: 403 }
        );
    }

    const controlKey = getAiControlKey();
    if (!controlKey) {
        return NextResponse.json({ error: 'Server misconfigured: AI_CONTROL_KEY is missing.' }, { status: 500 });
    }

    const providedKey = (request.headers.get('x-ai-control-key') || '').trim();
    if (!providedKey || providedKey !== controlKey) {
        return NextResponse.json({ error: 'Forbidden: invalid AI control key.' }, { status: 403 });
    }

    try {
        const auth = await requireSuperAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json();
        const dryRun = !!body?.dryRun;
        const operations = sanitizeOperations(body?.operations);

        if (operations.length === 0) {
            return NextResponse.json({ error: 'At least one operation is required.' }, { status: 400 });
        }

        const denied = operations.filter((op) => !isAllowedPath(op.path)).map((op) => op.path);
        if (denied.length > 0) {
            return NextResponse.json(
                {
                    error: 'One or more operations are not allowed.',
                    denied,
                    allowedPrefixes: ALLOWED_PREFIXES,
                },
                { status: 403 }
            );
        }

        const origin = request.nextUrl.origin;
        const adminAccessKey = (process.env.ADMIN_ACCESS_KEY || '').trim();

        const results: Array<{
            path: string;
            method: string;
            status: number;
            ok: boolean;
            data?: unknown;
            error?: string;
        }> = [];

        if (!dryRun) {
            for (const op of operations) {
                const url = buildInternalUrl(origin, op);
                const method = normalizeMethod(op.method);

                const headers: Record<string, string> = {
                    Authorization: request.headers.get('authorization') || '',
                    'Content-Type': 'application/json',
                    ...(op.headers || {}),
                };

                if (op.path.startsWith('/api/admin/') && adminAccessKey && !headers['x-admin-key']) {
                    headers['x-admin-key'] = adminAccessKey;
                }

                const response = await fetch(url, {
                    method,
                    headers,
                    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(op.body ?? {}),
                });

                const text = await response.text();
                let parsed: unknown = text;
                try {
                    parsed = text ? JSON.parse(text) : null;
                } catch {
                    // Keep plain-text body when JSON parsing fails.
                }

                results.push({
                    path: op.path,
                    method,
                    status: response.status,
                    ok: response.ok,
                    data: response.ok ? parsed : undefined,
                    error: response.ok ? undefined : (typeof parsed === 'string' ? parsed : JSON.stringify(parsed)),
                });
            }
        }

        await adminFirestore.collection('ai_control_logs').add({
            createdAt: FieldValue.serverTimestamp(),
            createdByUid: auth.uid,
            createdByEmail: auth.email,
            dryRun,
            operations: operations.map((op) => ({ path: op.path, method: normalizeMethod(op.method) })),
            successCount: results.filter((r) => r.ok).length,
            failureCount: results.filter((r) => !r.ok).length,
        });

        return NextResponse.json({
            mode: dryRun ? 'dry-run' : 'execute',
            operationCount: operations.length,
            operations,
            results,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'AI control execution failed.' }, { status: 500 });
    }
}
