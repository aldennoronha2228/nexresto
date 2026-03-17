import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type DashboardContext = {
    restaurant?: {
        id?: string;
        name?: string;
        subscriptionTier?: string;
        subscriptionStatus?: string;
        subscriptionEndDate?: string | null;
    };
    metrics?: {
        orderCounts?: Record<string, number>;
        menu?: Record<string, number>;
        tables?: Record<string, number>;
    };
    uiTips?: {
        keyAreas?: string[];
    };
    generatedAt?: string;
};

type Claims = {
    role?: string;
    restaurant_id?: string;
    tenant_id?: string;
};

type AiTier = 'free' | 'pro';

type AiUsage = {
    tier: AiTier;
    used: number;
    limit: number;
    remaining: number;
    isLimitReached: boolean;
    resetsAt: string;
};

const SYSTEM_PROMPT = [
    'You are a high-end Hospitality Consultant for restaurant and hotel owners.',
    'Persona and tone:',
    '- Professional, encouraging, and concise.',
    '- Confident and practical; never sound like a manual.',
    'Response structure (strict):',
    '- Never start with a list.',
    '- Begin with a direct 1-2 sentence conversational answer tailored to the user question.',
    '- Use hybrid formatting: if steps/tips are helpful, follow with a clean bulleted list.',
    '- Keep paragraphs short. Avoid walls of text.',
    '- Use markdown bold for key terms (for example: **Revenue Trend**, **Menu Visibility**).',
    'Knowledge base focus areas:',
    '- Operational doubts (for example: adding tables, dashboard workflows).',
    '- Business growth (for example: improving low-order days, average order value, conversion).',
    '- Technical support (for example: QR scanning/menu opening issues).',
    'Behavior rules:',
    '- Assume full context of this QR Hotel Dashboard when context is available.',
    '- If data is missing, ask one clarifying question and still offer best-practice guidance.',
    '- Never claim actions were performed in user systems.',
].join('\n');

const MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
];

function resolveAiTier(subscriptionTierRaw: unknown): AiTier {
    const tier = String(subscriptionTierRaw || '').trim().toLowerCase();
    if (tier === 'pro' || tier === '2k' || tier === '2.5k') return 'pro';
    return 'free';
}

function getDailyLimit(tier: AiTier): number {
    return tier === 'pro' ? 30 : 5;
}

function getTodayYmdUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function getNextUtcMidnightIso(): string {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return next.toISOString();
}

function toNonNegativeInt(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
}

function buildUsage(tier: AiTier, used: number): AiUsage {
    const limit = getDailyLimit(tier);
    return {
        tier,
        used,
        limit,
        remaining: Math.max(0, limit - used),
        isLimitReached: used >= limit,
        resetsAt: getNextUtcMidnightIso(),
    };
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<{ restaurantId: string } | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await adminAuth.getUser(decoded.uid);
    const claims = (user.customClaims || {}) as Claims;

    const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
    if (claims.role !== 'super_admin' && claimRestaurantId !== restaurantId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return { restaurantId };
}

function buildContextPrompt(context: DashboardContext | null): string {
    if (!context) return '';

    const safe = {
        restaurant: context.restaurant || {},
        metrics: context.metrics || {},
        uiTips: context.uiTips || {},
        generatedAt: context.generatedAt || null,
    };

    return [
        'Live dashboard context (trusted application snapshot):',
        JSON.stringify(safe),
        'Use this context to answer operational and usage questions accurately.',
        'If asked about numbers, prefer these values over generic estimates.',
    ].join('\n');
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((m) => {
            const role = m && typeof m === 'object' ? (m as any).role : null;
            const content = m && typeof m === 'object' ? (m as any).content : null;
            if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
            const trimmed = content.trim();
            if (!trimmed) return null;
            return {
                role,
                content: trimmed.slice(0, 4000),
            } as ChatMessage;
        })
        .filter((m): m is ChatMessage => !!m)
        .slice(-20);
}

function normalizeAssistantReply(raw: string): string {
    const stripped = raw
        .replace(/\r/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .trim();

    if (!stripped) {
        return 'I can help with operations, growth, and QR troubleshooting. What would you like to improve first?';
    }

    const lines = stripped
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 14);

    if (lines.length === 0) return stripped;

    const firstLine = lines[0];
    const startsWithList = /^([-*•]|\d+[.)])\s+/.test(firstLine);

    if (!startsWithList) {
        return lines.join('\n');
    }

    const firstBulletText = firstLine.replace(/^([-*•]|\d+[.)])\s+/, '').trim();
    const intro = firstBulletText
        ? `${firstBulletText}${/[.!?]$/.test(firstBulletText) ? '' : '.'}`
        : 'Here is a concise recommendation.';

    const remaining = lines.map((line) => {
        if (/^([-*•]|\d+[.)])\s+/.test(line)) return line.replace(/^\d+[.)]\s+/, '- ');
        return line;
    });

    return [intro, ...remaining].join('\n');
}

export async function POST(request: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const restaurantId = String(body?.restaurantId || '').trim();
        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        const restaurantRef = adminFirestore.doc(`restaurants/${restaurantId}`);
        const restaurantSnap = await restaurantRef.get();
        if (!restaurantSnap.exists) {
            return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const restaurantData = restaurantSnap.data() || {};
        const usageData = (restaurantData as any).usage || {};
        const tier = resolveAiTier((restaurantData as any).subscription_tier);
        const todayYmd = getTodayYmdUtc();
        let dailyAiCount = toNonNegativeInt(usageData.dailyAiCount);
        const dailyAiDate = String(usageData.dailyAiDate || '');

        if (dailyAiDate !== todayYmd) {
            dailyAiCount = 0;
            await restaurantRef.set(
                {
                    usage: {
                        dailyAiCount: 0,
                        dailyAiDate: todayYmd,
                    },
                },
                { merge: true },
            );
        }

        const currentUsage = buildUsage(tier, dailyAiCount);
        if (currentUsage.isLimitReached) {
            return NextResponse.json(
                {
                    error: 'Daily AI limit reached for your plan.',
                    code: 'daily_limit_reached',
                    usage: currentUsage,
                },
                { status: 429 },
            );
        }

        const messages = sanitizeMessages(body?.messages);
        const dashboardContext = (body?.dashboardContext && typeof body.dashboardContext === 'object'
            ? (body.dashboardContext as DashboardContext)
            : null);

        const contextPrompt = buildContextPrompt(dashboardContext);
        if (messages.length === 0) {
            return NextResponse.json({ error: 'At least one message is required.' }, { status: 400 });
        }

        const contents = messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        let geminiResponse: Response | null = null;
        let selectedModel = '';
        let lastErrorDetails = '';

        for (const modelName of MODEL_CANDIDATES) {
            const candidateResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{ text: contextPrompt ? `${SYSTEM_PROMPT}\n\n${contextPrompt}` : SYSTEM_PROMPT }],
                        },
                        contents,
                        generationConfig: {
                            temperature: 0.5,
                            topP: 0.85,
                            maxOutputTokens: 420,
                        },
                    }),
                }
            );

            if (candidateResponse.ok) {
                geminiResponse = candidateResponse;
                selectedModel = modelName;
                break;
            }

            const errorText = await candidateResponse.text();
            lastErrorDetails = `${modelName}: ${candidateResponse.status} ${errorText.slice(0, 240)}`;

            // 404 usually means model isn't available for this API key.
            // Keep trying fallback models.
            if (candidateResponse.status !== 404) {
                const mappedStatus = candidateResponse.status >= 400 && candidateResponse.status < 600
                    ? candidateResponse.status
                    : 502;

                if (candidateResponse.status === 429) {
                    return NextResponse.json(
                        {
                            error: 'Gemini quota exceeded for this API key.',
                            code: 'quota_exceeded',
                            details: 'Please check Gemini API billing/quota and retry after quota resets.',
                        },
                        { status: 429 }
                    );
                }

                return NextResponse.json(
                    { error: `Gemini request failed: ${candidateResponse.status}`, details: lastErrorDetails },
                    { status: mappedStatus }
                );
            }
        }

        if (!geminiResponse) {
            return NextResponse.json(
                { error: 'No supported Gemini model found for this API key.', details: lastErrorDetails },
                { status: 502 }
            );
        }

        const data = await geminiResponse.json();
        const rawReply =
            data?.candidates?.[0]?.content?.parts
                ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                .join('\n')
                .trim() ||
            'I can help with menu optimization, metrics explanation, QR troubleshooting, and staff advice. What would you like to improve first?';

        const reply = normalizeAssistantReply(rawReply);

        const nextUsage = buildUsage(tier, dailyAiCount + 1);
        await restaurantRef.set(
            {
                usage: {
                    dailyAiCount: FieldValue.increment(1),
                    dailyAiDate: todayYmd,
                    lastAiAt: FieldValue.serverTimestamp(),
                    lastAiModel: selectedModel || MODEL_CANDIDATES[0],
                },
            },
            { merge: true },
        );

        return NextResponse.json({ reply, usage: nextUsage });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Support chat request failed.' }, { status: 500 });
    }
}
