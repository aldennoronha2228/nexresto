import { NextRequest, NextResponse } from 'next/server';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

type VisionTable = {
    id: string;
    type: 'standard' | 'booth' | 'high-top';
    x: number;
    y: number;
    seats: number;
    confidence: number;
};

type ProviderResult = {
    tables: VisionTable[];
    model: string;
};

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

function parseOpenAiModels(): string[] {
    const raw = process.env.OPENAI_VISION_MODEL_CANDIDATES || process.env.OPENAI_MODEL_CANDIDATES || process.env.OPENAI_MODEL || 'gpt-4o,gpt-4o-mini';
    return Array.from(new Set(raw.split(',').map((m) => m.trim()).filter(Boolean)));
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<{ uid: string } | NextResponse> {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!restaurantId) {
        return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const token = authHeader.slice(7);
    const authz = await authorizeTenantAccess(token, restaurantId, 'manage');
    if (!authz) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return { uid: authz.uid };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeType(raw: unknown): VisionTable['type'] {
    const v = String(raw || '').toLowerCase();
    if (v === 'booth') return 'booth';
    if (v === 'high-top' || v === 'high_top' || v === 'hightop') return 'high-top';
    return 'standard';
}

function parseJsonObject(text: string): any {
    const trimmed = String(text || '').trim();
    if (!trimmed) return {};

    try {
        return JSON.parse(trimmed);
    } catch {
        const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || trimmed;
        const first = block.indexOf('{');
        const last = block.lastIndexOf('}');
        if (first >= 0 && last > first) {
            return JSON.parse(block.slice(first, last + 1));
        }
        throw new Error('Model returned invalid JSON');
    }
}

function sanitizeTables(rawTables: unknown, hintTableCount: number): VisionTable[] {
    if (!Array.isArray(rawTables)) return [];

    const maxTables = clamp(Number.isFinite(hintTableCount) && hintTableCount > 0 ? hintTableCount + 12 : 24, 4, 32);
    const seen = new Set<string>();

    const parsed = rawTables
        .map((item: any, idx): VisionTable | null => {
            const x = Number(item?.x);
            const y = Number(item?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

            const id = String(item?.id || `T-${String(idx + 1).padStart(2, '0')}`);
            const safeId = seen.has(id) ? `${id}-${idx + 1}` : id;
            seen.add(safeId);

            const seatsRaw = Number(item?.seats);
            const seats = clamp(Number.isFinite(seatsRaw) ? Math.round(seatsRaw) : 4, 2, 12);
            const confidenceRaw = Number(item?.confidence);
            const confidence = clamp(Number.isFinite(confidenceRaw) ? confidenceRaw : 0.74, 0, 1);
            if (confidence < 0.62) return null;

            return {
                id: safeId,
                type: normalizeType(item?.type),
                x: Number(clamp(x, 0, 100).toFixed(2)),
                y: Number(clamp(y, 0, 100).toFixed(2)),
                seats,
                confidence: Number(confidence.toFixed(3)),
            };
        })
        .filter((x): x is VisionTable => !!x);

    parsed.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const deduped: VisionTable[] = [];
    for (const table of parsed) {
        const near = deduped.some((d) => Math.hypot(d.x - table.x, d.y - table.y) < 4.5);
        if (!near) deduped.push(table);
        if (deduped.length >= maxTables) break;
    }

    return deduped;
}

function consensusMerge(first: VisionTable[], second: VisionTable[], hintTableCount: number): VisionTable[] {
    const maxTables = clamp(Number.isFinite(hintTableCount) && hintTableCount > 0 ? hintTableCount + 10 : 24, 3, 30);
    const merged: VisionTable[] = [];

    for (const a of first) {
        const b = second.find((x) => Math.hypot(x.x - a.x, x.y - a.y) <= 6.5);
        if (!b) continue;

        merged.push({
            id: a.id,
            type: a.type === b.type ? a.type : (a.confidence >= b.confidence ? a.type : b.type),
            x: Number(((a.x + b.x) / 2).toFixed(2)),
            y: Number(((a.y + b.y) / 2).toFixed(2)),
            seats: clamp(Math.round((a.seats + b.seats) / 2), 2, 12),
            confidence: Number((((a.confidence + b.confidence) / 2) + 0.06).toFixed(3)),
        });
    }

    merged.sort((a, b) => b.confidence - a.confidence);

    const deduped: VisionTable[] = [];
    for (const t of merged) {
        if (t.confidence < 0.68) continue;
        const near = deduped.some((d) => Math.hypot(d.x - t.x, d.y - t.y) < 4.8);
        if (!near) deduped.push(t);
        if (deduped.length >= maxTables) break;
    }

    return deduped;
}

function buildVisionPrompt(hintTableCount: number): string {
    const target = clamp(hintTableCount || 8, 1, 30);
    return [
        'Analyze this restaurant floor image and detect ONLY dining tables.',
        'Do not detect chairs, people, decor, doors, wall art, counters, lights, or shadows.',
        'Return strict JSON only with this schema:',
        '{"tables":[{"id":"T-01","type":"standard|booth|high-top","x":0,"y":0,"seats":4,"confidence":0.0}],"confidence":0}',
        'Coordinates must be normalized to a top-view floor grid: x and y in range 0..100.',
        `Expected approximate table count is around ${target}.`,
        'If uncertain, return fewer high-confidence tables rather than guessing.',
        'Use confidence 0.00 to 1.00 for each table. Do not output low-confidence guesses.',
        'No markdown, no explanations, no extra keys outside tables/confidence.',
    ].join('\n');
}

async function requestOpenAiVisionPass(apiKey: string, model: string, dataUrl: string, prompt: string, passLabel: string): Promise<VisionTable[]> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 900,
            messages: [
                {
                    role: 'system',
                    content: 'You are a strict vision extraction engine. Return JSON only.',
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `${prompt}\nPass: ${passLabel}` },
                        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw Object.assign(new Error(`OpenAI vision request failed: ${response.status}`), {
            status: response.status,
            details: errText.slice(0, 220),
        });
    }

    const payload: any = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    const parsed = parseJsonObject(content);
    return sanitizeTables(parsed?.tables, 12);
}

async function analyzeWithOpenAi(apiKey: string, models: string[], dataUrl: string, hintTableCount: number): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(hintTableCount);
    let lastError = '';

    for (const model of models) {
        try {
            const passA = await requestOpenAiVisionPass(apiKey, model, dataUrl, prompt, 'A');
            const passB = await requestOpenAiVisionPass(apiKey, model, dataUrl, prompt, 'B');
            const consensus = consensusMerge(passA, passB, hintTableCount);

            if (consensus.length > 0) {
                return { tables: consensus, model };
            }

            const fallback = passA.filter((t) => t.confidence >= 0.78);
            if (fallback.length > 0) {
                return { tables: fallback, model };
            }
        } catch (error: unknown) {
            const errObj = error as { status?: unknown; details?: unknown; message?: unknown };
            const status = Number(errObj?.status || 0);
            lastError = `${model}: ${status || 500} ${String(errObj?.details || errObj?.message || '').slice(0, 220)}`;
            if (status === 400 || status === 404) continue;
            throw new Error(lastError);
        }
    }

    throw new Error(lastError || 'No OpenAI vision model produced valid table detections');
}

async function analyzeWithGemini(apiKey: string, mimeType: string, base64Data: string, hintTableCount: number): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(hintTableCount);
    let lastError = '';

    for (const model of GEMINI_MODELS) {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 900,
                        responseMimeType: 'application/json',
                    },
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Data,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            lastError = `${model}: ${response.status} ${errText.slice(0, 220)}`;
            if (response.status === 404) continue;
            throw new Error(`Gemini vision request failed: ${response.status}`);
        }

        const payload: any = await response.json();
        const text = String(
            payload?.candidates?.[0]?.content?.parts
                ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                .join('\n') || ''
        ).trim();
        const parsed = parseJsonObject(text);
        const tables = sanitizeTables(parsed?.tables, hintTableCount).filter((t) => t.confidence >= 0.72);
        if (tables.length > 0) {
            return { tables, model };
        }
    }

    throw new Error(lastError || 'No Gemini vision model produced valid table detections');
}

export async function POST(request: NextRequest) {
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!openAiApiKey && !geminiApiKey) {
        return NextResponse.json(
            { error: 'No AI provider key configured. Set OPENAI_API_KEY or GEMINI_API_KEY.' },
            { status: 500 },
        );
    }

    try {
        const formData = await request.formData();
        const restaurantId = String(formData.get('restaurantId') || '').trim();
        const hintTableCount = Number(formData.get('hintTableCount') || 0);
        const image = formData.get('image');

        const auth = await requireAuthorizedRestaurant(request, restaurantId);
        if (auth instanceof NextResponse) return auth;

        if (!(image instanceof File)) {
            return NextResponse.json({ error: 'image file is required' }, { status: 400 });
        }

        if (!image.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Unsupported file type. Please upload an image.' }, { status: 400 });
        }

        if (image.size > 8 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image is too large. Please upload an image under 8MB.' }, { status: 413 });
        }

        const buffer = Buffer.from(await image.arrayBuffer());
        const base64Data = buffer.toString('base64');
        const mimeType = image.type || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64Data}`;

        let result: ProviderResult;
        if (openAiApiKey) {
            result = await analyzeWithOpenAi(openAiApiKey, parseOpenAiModels(), dataUrl, hintTableCount);
        } else {
            result = await analyzeWithGemini(geminiApiKey as string, mimeType, base64Data, hintTableCount);
        }

        if (result.tables.length === 0) {
            return NextResponse.json(
                { error: 'AI could not confidently detect tables in this image. Use a clearer and more top-down photo.' },
                { status: 422 },
            );
        }

        return NextResponse.json({
            tables: result.tables,
            model: result.model,
            count: result.tables.length,
            quality: 'strict',
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Image analysis failed' }, { status: 500 });
    }
}
