import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkRateLimit } from '@/lib/rateLimit';

type ConciergeMenuItem = {
    id: string;
    name: string;
    description: string;
    category: string;
    price: number;
    type?: 'veg' | 'non-veg';
    image?: string;
    available?: boolean;
};

type ConciergeResponse = {
    empatheticLine: string;
    recommendation: {
        name: string;
        reason: string;
    };
    pairing: {
        name: string;
        reason: string;
    };
};

function cleanText(value: unknown): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMenu(input: unknown): ConciergeMenuItem[] {
    if (!Array.isArray(input)) return [];

    return input
        .map((row) => {
            const item = (row || {}) as Record<string, unknown>;
            const rawType = cleanText(item.type).toLowerCase();
            const normalizedType: 'veg' | 'non-veg' = rawType === 'non-veg' ? 'non-veg' : 'veg';

            return {
                id: cleanText(item.id) || Math.random().toString(36).slice(2),
                name: cleanText(item.name),
                description: cleanText(item.description),
                category: cleanText(item.category),
                price: Number(item.price || 0),
                type: normalizedType,
                image: cleanText(item.image) || undefined,
                available: item.available !== false,
            };
        })
        .filter((item) => item.name.length > 0 && Number.isFinite(item.price) && item.price >= 0)
        .slice(0, 220);
}

function getMealPeriod(hour24: number): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
    if (hour24 >= 6 && hour24 < 11) return 'breakfast';
    if (hour24 >= 11 && hour24 < 15) return 'lunch';
    if (hour24 >= 15 && hour24 < 19) return 'snack';
    return 'dinner';
}

function extractJsonObject(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : trimmed;
}

function findItemByName(menu: ConciergeMenuItem[], name: string): ConciergeMenuItem | null {
    const needle = cleanText(name).toLowerCase();
    if (!needle) return null;

    const exact = menu.find((item) => item.name.toLowerCase() === needle);
    if (exact) return exact;

    const includes = menu.find((item) => item.name.toLowerCase().includes(needle) || needle.includes(item.name.toLowerCase()));
    return includes || null;
}

function scoreItem(item: ConciergeMenuItem, prompt: string, mealPeriod: string): number {
    const text = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    let score = 0;

    if (item.available === false) score -= 100;

    const wantsComfort = /comfort|stressed|warm|cozy|feel better/.test(prompt);
    const wantsHealthy = /healthy|light|clean|low calorie|fresh/.test(prompt);
    const wantsSpicy = /spicy|hot|chili|masala/.test(prompt);
    const wantsVeg = /veg|vegetarian|plant/.test(prompt);
    const wantsNonVeg = /non[- ]?veg|chicken|fish|meat/.test(prompt);

    if (wantsComfort && /cream|butter|pasta|soup|bowl|rice|noodle/.test(text)) score += 5;
    if (wantsHealthy && /salad|grill|steamed|fresh|bowl|juice|soup/.test(text)) score += 5;
    if (wantsSpicy && /spicy|chili|pepper|masala|schezwan/.test(text)) score += 5;
    if (wantsVeg && item.type === 'veg') score += 4;
    if (wantsNonVeg && item.type === 'non-veg') score += 4;

    if (mealPeriod === 'breakfast' && /breakfast|omelette|toast|idli|dosa|poha|coffee/.test(text)) score += 4;
    if (mealPeriod === 'lunch' && /thali|meal|rice|bowl|curry|grill/.test(text)) score += 3;
    if (mealPeriod === 'snack' && /snack|fries|chaat|starter|sandwich|roll/.test(text)) score += 3;
    if (mealPeriod === 'dinner' && /curry|pasta|biryani|main|platter/.test(text)) score += 3;

    if (item.price > 0 && item.price < 300) score += 1;

    return score;
}

function buildFallback(menu: ConciergeMenuItem[], input: string, mealPeriod: string): ConciergeResponse {
    const sorted = [...menu].sort((a, b) => scoreItem(b, input.toLowerCase(), mealPeriod) - scoreItem(a, input.toLowerCase(), mealPeriod));
    const primary = sorted[0] || menu[0];
    const pairing = sorted.find((item) => item.id !== primary?.id) || menu[1] || primary;

    return {
        empatheticLine: "I hear you. Let's find something that matches your vibe right now.",
        recommendation: {
            name: primary?.name || 'Chef Special',
            reason: `This fits your mood and is a strong ${mealPeriod} pick from the menu right now.`,
        },
        pairing: {
            name: pairing?.name || primary?.name || 'House Refreshment',
            reason: 'This complements the main recommendation without overpowering it.',
        },
    };
}

async function askGemini(apiKey: string, userInput: string, menu: ConciergeMenuItem[], hour24: number, mealPeriod: string): Promise<ConciergeResponse> {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

    const system = [
        'You are Nexie, a sophisticated, witty, helpful digital sommelier and food guide for NexResto.',
        'Be empathetic and premium, but concise.',
        'Use time-of-day context to prioritize menu choices.',
        'Respond ONLY as strict JSON with this schema:',
        '{"empatheticLine":"string","recommendation":{"name":"string","reason":"string"},"pairing":{"name":"string","reason":"string"}}',
        'Use exact item names from the provided menu for recommendation.name and pairing.name.',
    ].join('\n');

    const prompt = [
        `Current hour (24h): ${hour24}`,
        `Meal period focus: ${mealPeriod}`,
        `User message: ${userInput}`,
        'Menu JSON:',
        JSON.stringify(menu.map((item) => ({
            name: item.name,
            description: item.description,
            category: item.category,
            price: item.price,
            type: item.type,
            available: item.available !== false,
        }))),
    ].join('\n\n');

    const result = await model.generateContent(`${system}\n\n${prompt}`);
    const text = result.response.text();
    const json = JSON.parse(extractJsonObject(text)) as ConciergeResponse;

    return {
        empatheticLine: cleanText(json?.empatheticLine),
        recommendation: {
            name: cleanText(json?.recommendation?.name),
            reason: cleanText(json?.recommendation?.reason),
        },
        pairing: {
            name: cleanText(json?.pairing?.name),
            reason: cleanText(json?.pairing?.reason),
        },
    };
}

async function askOpenAi(apiKey: string, userInput: string, menu: ConciergeMenuItem[], hour24: number, mealPeriod: string): Promise<ConciergeResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.6,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are Nexie, a sophisticated, witty, helpful digital sommelier and food guide for NexResto.',
                        'Be empathetic and premium, but concise.',
                        'Respond ONLY as strict JSON with this schema:',
                        '{"empatheticLine":"string","recommendation":{"name":"string","reason":"string"},"pairing":{"name":"string","reason":"string"}}',
                        'Use exact menu names for recommendation.name and pairing.name.',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: [
                        `Current hour (24h): ${hour24}`,
                        `Meal period focus: ${mealPeriod}`,
                        `User message: ${userInput}`,
                        'Menu JSON:',
                        JSON.stringify(menu.map((item) => ({
                            name: item.name,
                            description: item.description,
                            category: item.category,
                            price: item.price,
                            type: item.type,
                            available: item.available !== false,
                        }))),
                    ].join('\n\n'),
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI request failed (${response.status})`);
    }

    const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const text = cleanText(payload?.choices?.[0]?.message?.content);
    const json = JSON.parse(extractJsonObject(text)) as ConciergeResponse;

    return {
        empatheticLine: cleanText(json?.empatheticLine),
        recommendation: {
            name: cleanText(json?.recommendation?.name),
            reason: cleanText(json?.recommendation?.reason),
        },
        pairing: {
            name: cleanText(json?.pairing?.name),
            reason: cleanText(json?.pairing?.reason),
        },
    };
}

export async function POST(request: NextRequest) {
    try {
        const ip = cleanText(request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown');
        const limit = checkRateLimit(ip, 'menu-concierge', 20, 60);
        if (!limit.allowed) {
            return NextResponse.json({ error: `Too many requests. Retry in ${limit.retryAfterSecs}s.` }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}));
        const restaurantId = cleanText((body as Record<string, unknown>)?.restaurantId);
        const userInput = cleanText((body as Record<string, unknown>)?.message);
        const menu = normalizeMenu((body as Record<string, unknown>)?.menuItems);

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
        }
        if (!userInput) {
            return NextResponse.json({ error: 'message is required.' }, { status: 400 });
        }
        if (menu.length === 0) {
            return NextResponse.json({ error: 'menuItems are required.' }, { status: 400 });
        }

        const now = new Date();
        const hour24 = now.getHours();
        const mealPeriod = getMealPeriod(hour24);

        let aiReply: ConciergeResponse | null = null;

        try {
            const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
            const openAiKey = process.env.OPENAI_API_KEY;

            if (geminiKey) {
                aiReply = await askGemini(geminiKey, userInput, menu, hour24, mealPeriod);
            } else if (openAiKey) {
                aiReply = await askOpenAi(openAiKey, userInput, menu, hour24, mealPeriod);
            }
        } catch {
            aiReply = null;
        }

        const safeReply = aiReply && aiReply.recommendation?.name
            ? aiReply
            : buildFallback(menu, userInput, mealPeriod);

        const recommendedItem = findItemByName(menu, safeReply.recommendation.name);
        const pairingItem = findItemByName(menu, safeReply.pairing.name);

        return NextResponse.json({
            persona: 'Nexie',
            hour24,
            mealPeriod,
            response: safeReply,
            recommendationItem: recommendedItem,
            pairingItem,
        });
    } catch {
        return NextResponse.json({ error: 'Unable to process concierge request right now.' }, { status: 500 });
    }
}
