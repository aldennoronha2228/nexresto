import { NextRequest, NextResponse } from 'next/server';

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

        return NextResponse.json({ reply });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Support chat request failed.' }, { status: 500 });
    }
}
