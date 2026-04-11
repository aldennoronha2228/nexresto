/**
 * lib/logger.ts
 * -------------
 * SECURITY: Structured security event logger.
 *
 * Threats mitigated / observability goals:
 *  - Inability to detect auth abuse without logs
 *  - Sensitive PII leaking into log files (emails/passwords stripped/redacted)
 *  - Silent policy denials being invisible during incident response
 *
 * Rules:
 *  - Never log passwords, tokens, or full JWTs
 *  - Email addresses are redacted to "u***@domain.com" in production logs
 *  - All security events include a timestamp + event type + context
 *
 * In production, replace `console.*` with your preferred transport
 * (e.g., Datadog, Sentry, Pino, CloudWatch).
 */

type SecurityEventType =
    | 'AUTH_LOGIN_SUCCESS'
    | 'AUTH_LOGIN_FAILURE'
    | 'AUTH_LOGOUT'
    | 'AUTH_SIGNUP'
    | 'AUTH_SIGNUP_DUPLICATE'
    | 'AUTH_GOOGLE_START'
    | 'AUTH_RATE_LIMITED'
    | 'AUTH_STALE_SESSION_CLEARED'
    | 'AUTHZ_DENIED'           // authorization check failed
    | 'AUTHZ_ADMIN_CHECK'
    | 'ORDER_SUBMITTED'
    | 'ORDER_STATUS_CHANGED'
    | 'ORDER_DELETED'
    | 'MENU_ITEM_CREATED'
    | 'MENU_ITEM_UPDATED'
    | 'MENU_ITEM_DELETED'
    | 'ENV_VALIDATION_FAILED'
    | 'SESSION_INVALID'
    | 'CSRF_VIOLATION'
    | 'INPUT_VALIDATION_FAILED'
    | 'AUTH_SIGNUP_FAILURE'
    | 'TENANT_CREATED'
    | 'TENANT_FETCH'
    | 'AUTH_TENANT_RESOLVED'
    | 'SUPER_ADMIN_AUTH_RESOLVED'
    | 'SUPER_ADMIN_SIGN_OUT';

interface SecurityEvent {
    event: SecurityEventType;
    ts: string;           // ISO timestamp
    [key: string]: unknown;
}

/** Redact email to "u***@domain.com" to avoid storing PII in plain logs */
function redactEmail(email: string): string {
    if (!email || !email.includes('@')) return '[redacted]';
    const [local, domain] = email.split('@');
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
}

function buildEvent(type: SecurityEventType, context: Record<string, unknown>): SecurityEvent {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(context)) {
        // Never include password / token fields
        if (['password', 'token', 'access_token', 'refresh_token', 'key', 'secret'].includes(k.toLowerCase())) {
            sanitized[k] = '[redacted]';
        } else if (k === 'email' && typeof v === 'string') {
            sanitized[k] = process.env.NODE_ENV === 'production' ? redactEmail(v) : v;
        } else {
            sanitized[k] = v;
        }
    }
    return { event: type, ts: new Date().toISOString(), ...sanitized };
}

export const securityLog = {
    info(type: SecurityEventType, context: Record<string, unknown> = {}): void {
        const payload = buildEvent(type, context);
        // In production, send to your log aggregator instead of stdout
        console.info('[SECURITY]', JSON.stringify(payload));
    },

    warn(type: SecurityEventType, context: Record<string, unknown> = {}): void {
        const payload = buildEvent(type, context);
        console.warn('[SECURITY:WARN]', JSON.stringify(payload));
    },

    error(type: SecurityEventType, context: Record<string, unknown> = {}): void {
        const payload = buildEvent(type, context);
        console.error('[SECURITY:ERROR]', JSON.stringify(payload));
    },
};
