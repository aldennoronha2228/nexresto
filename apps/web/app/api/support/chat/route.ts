import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase-admin';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';
import { generateDailyReport } from '@/lib/reports';

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
        inventory?: Record<string, number>;
        analytics?: Record<string, number>;
        customers?: Record<string, number>;
        staff?: Record<string, number | Record<string, number>>;
    };
    modules?: {
        menu?: Record<string, unknown>;
        tables?: Record<string, unknown>;
        orders?: Record<string, unknown>;
        inventory?: Record<string, unknown>;
        reports?: Record<string, unknown>;
        analytics?: Record<string, unknown>;
        customers?: Record<string, unknown>;
        branding?: Record<string, unknown>;
        staff?: Record<string, unknown>;
    };
    uiTips?: {
        keyAreas?: string[];
    };
    generatedAt?: string;
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
    '- Keep default answers short: 2-5 lines total unless the user explicitly asks for details.',
    '- Use hybrid formatting: if steps/tips are helpful, follow with a clean bulleted list.',
    '- Keep paragraphs short. Avoid walls of text.',
    '- Use markdown bold for key terms (for example: **Revenue Trend**, **Menu Visibility**).',
    'Knowledge base focus areas:',
    '- Operational doubts (for example: adding tables, dashboard workflows).',
    '- Business growth (for example: improving low-order days, average order value, conversion).',
    '- Technical support (for example: QR scanning/menu opening issues).',
    'Behavior rules:',
    '- Assume full context of this QR Hotel Dashboard when context is available.',
    '- You have access to all dashboard pages and components provided in the context snapshot; use them when answering.',
    '- Never reveal internal reasoning, hidden analysis, or chain-of-thought.',
    '- Never output tags like <think>, <analysis>, or XML-style reasoning wrappers.',
    '- Return plain user-facing text only.',
    '- If data is missing, ask one clarifying question and still offer best-practice guidance.',
    '- Do not claim inability to perform dashboard actions. If details are missing, ask for exact fields needed.',
    '- For any monetary value, always use INR format with the rupee symbol (for example: ₹1,25,000).',
].join('\n');

const AI_DAILY_LIMIT = Number.MAX_SAFE_INTEGER;

const MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
];

function resolveGroqChatCompletionsUrl(apiUrl?: string): string {
    const base = String(apiUrl || '').trim().replace(/\/+$/, '');
    if (!base) return 'https://api.groq.com/openai/v1/chat/completions';
    if (base.endsWith('/chat/completions')) return base;
    return `${base}/chat/completions`;
}

function resolveGroqModelCandidates(): string[] {
    const raw = process.env.GROQ_MODEL_CANDIDATES || process.env.GROQ_MODEL || 'qwen/qwen3-32b,llama-3.3-70b-versatile';
    return Array.from(new Set(raw.split(',').map((m) => m.trim()).filter(Boolean)));
}

function resolveGroqApiKeys(): string[] {
    const raw = process.env.GROQ_API_KEYS
        || [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(Boolean).join(',');
    return Array.from(new Set(String(raw || '').split(',').map((k) => k.trim()).filter(Boolean)));
}

type ProviderReply = {
    rawReply: string;
    selectedModel: string;
};

type AuthorizedRestaurant = {
    restaurantId: string;
    uid: string;
    role: string;
};

type ParsedAction =
    | { type: 'add_table'; seats: number; name?: string }
    | { type: 'remove_table'; tableRef: string }
    | { type: 'add_menu_item'; name: string; price: number; category: string; foodType: 'veg' | 'non-veg'; imageUrl?: string }
    | { type: 'update_menu_item_price'; name: string; price: number }
    | { type: 'toggle_menu_item_availability'; name: string; available: boolean }
    | { type: 'delete_menu_item'; name: string }
    | { type: 'add_category'; name: string }
    | { type: 'rename_category'; from: string; to: string }
    | { type: 'arrange_tables_square' }
    | { type: 'keep_first_tables'; count: number }
    | { type: 'generate_report'; date?: string }
    | { type: 'analytics_summary'; days: number }
    | { type: 'unknown' };

type ActionExecution = {
    ok: boolean;
    message: string;
    data?: Record<string, unknown>;
};

function resolveAiTier(subscriptionTierRaw: unknown): AiTier {
    const tier = String(subscriptionTierRaw || '').trim().toLowerCase();
    if (tier === 'pro' || tier === '2k' || tier === '2.5k') return 'pro';
    return 'free';
}

function getDailyLimit(tier: AiTier): number {
    return AI_DAILY_LIMIT;
}

function formatINR(value: number): string {
    const amount = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
    }).format(amount);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getTodayYmdIst(): string {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const year = istNow.getUTCFullYear();
    const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istNow.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getNextIstMidnightIso(): string {
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const nextIstMidnightUtcBased = Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate() + 1,
        0,
        0,
        0,
        0,
    );
    return new Date(nextIstMidnightUtcBased - IST_OFFSET_MS).toISOString();
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
        resetsAt: getNextIstMidnightIso(),
    };
}

async function requireAuthorizedRestaurant(request: NextRequest, restaurantId: string): Promise<AuthorizedRestaurant | NextResponse> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

    return {
        restaurantId,
        uid: authz.uid,
        role: authz.role,
    };
}

function parseActionFromText(text: string): ParsedAction {
    const normalized = text.trim();
    if (!normalized) return { type: 'unknown' };

    const lower = normalized.toLowerCase();

    const tableMatch =
        lower.match(/\badd\b.*\btable\b.*?(\d{1,2})\s*(?:[- ]?\s*(?:seat|seats|seater|pax|people|persons?))\b/i) ||
        lower.match(/\badd\b.*\btable\b.*\bfor\b\s*(\d{1,2})\b/i) ||
        lower.match(/\b(\d{1,2})\s*[- ]?\s*(?:seat|seats|seater)\b.*\btable\b/i);
    if (tableMatch) {
        const seats = Number(tableMatch[1]);
        const nameMatch = normalized.match(/name\s*[:=]\s*([^,\n]+)/i);
        const name = nameMatch?.[1]?.trim();
        if (Number.isFinite(seats) && seats > 0) {
            return { type: 'add_table', seats: Math.min(20, Math.max(1, Math.floor(seats))), name };
        }
    }

    const removeTableMatch = normalized.match(/(?:remove|delete)\s+(?:table\s*)#?([A-Za-z0-9-]+)$/i)
        || normalized.match(/(?:remove|delete)\s+#?([A-Za-z0-9-]+)\s+table$/i)
        || normalized.match(/(?:remove|delete)\s+(?:the\s+)?table\s+(?:number\s*)?(\d{1,4})$/i);
    if (removeTableMatch) {
        const tableRef = String(removeTableMatch[1] || '').trim();
        if (tableRef) {
            return { type: 'remove_table', tableRef };
        }
    }

    if (
        lower.includes('add menu item') ||
        lower.includes('add item to menu') ||
        lower.startsWith('add item') ||
        (/(add|create)\b/.test(lower) && /(menu|item|dish)\b/.test(lower))
    ) {
        const name = (normalized.match(/name\s*[:=]\s*([^,\n]+)/i)?.[1] || '').trim();
        const priceText = (normalized.match(/price\s*[:=]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1] || '').trim();
        const category = (normalized.match(/category\s*[:=]\s*([^,\n]+)/i)?.[1] || '').trim();
        const typeText = (normalized.match(/type\s*[:=]\s*(veg|non-veg|nonveg)/i)?.[1] || 'veg').trim().toLowerCase();
        const imageUrl = (normalized.match(/image\s*[:=]\s*(https?:\/\/[^\s,]+)/i)?.[1] || '').trim();

        const price = Number(priceText);
        if (name && Number.isFinite(price) && price > 0 && category) {
            return {
                type: 'add_menu_item',
                name,
                price,
                category,
                foodType: typeText.includes('non') ? 'non-veg' : 'veg',
                imageUrl: imageUrl || undefined,
            };
        }
    }

    const updatePriceMatch =
        normalized.match(/(?:set|change|update)\s+(?:the\s+)?price\s+(?:of\s+)?(?:menu\s+item\s+)?"?([^"\n]+?)"?\s+(?:to|as)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
        normalized.match(/(?:set|change|update)\s+(?:menu\s+item\s+)?"?([^"\n]+?)"?\s+price\s+(?:to|as)\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    if (updatePriceMatch) {
        const name = updatePriceMatch[1].trim();
        const price = Number(updatePriceMatch[2]);
        if (name && Number.isFinite(price) && price > 0) {
            return {
                type: 'update_menu_item_price',
                name,
                price,
            };
        }
    }

    const setAvailabilityMatch = normalized.match(/(?:make|set|mark|turn)\s+(?:menu\s+item\s+)?"?([^"\n]+?)"?\s+(available|unavailable|on|off|enable|enabled|disable|disabled|show|hide)/i);
    if (setAvailabilityMatch) {
        const name = setAvailabilityMatch[1].trim();
        const state = setAvailabilityMatch[2].trim().toLowerCase();
        if (name) {
            return {
                type: 'toggle_menu_item_availability',
                name,
                available: ['available', 'on', 'enable', 'enabled', 'show'].includes(state),
            };
        }
    }

    const deleteItemMatch = normalized.match(/(?:delete|remove)\s+(?:menu\s+item|item|dish)\s+"?([^"\n]+?)"?$/i);
    if (deleteItemMatch) {
        const name = deleteItemMatch[1].trim();
        if (name) {
            return {
                type: 'delete_menu_item',
                name,
            };
        }
    }

    const addCategoryMatch = normalized.match(/(?:add|create)\s+(?:a\s+)?category\s*[:=]?\s*"?([^"\n]+?)"?$/i);
    if (addCategoryMatch) {
        const name = addCategoryMatch[1].trim();
        if (name) {
            return {
                type: 'add_category',
                name,
            };
        }
    }

    const renameCategoryMatch = normalized.match(/rename\s+category\s+"?([^"\n]+?)"?\s+(?:to|as)\s+"?([^"\n]+?)"?$/i);
    if (renameCategoryMatch) {
        const from = renameCategoryMatch[1].trim();
        const to = renameCategoryMatch[2].trim();
        if (from && to && from.toLowerCase() !== to.toLowerCase()) {
            return {
                type: 'rename_category',
                from,
                to,
            };
        }
    }

    const squareIntent =
        (/(arrange|make|set|organize|place)\b/.test(lower) && /(square)\b/.test(lower) && /(table|tables|floor plan|layout)\b/.test(lower)) ||
        (/\bsquare\b/.test(lower) && /\btable(s)?\b/.test(lower));
    if (squareIntent) {
        return { type: 'arrange_tables_square' };
    }

    const keepFirstMatch =
        lower.match(/\bkeep\b.*\bfirst\b\s*(\d{1,3})\s*\btable(s)?\b.*\b(remove|delete)\b/i) ||
        lower.match(/\bkeep\b.*\bonly\b\s*(\d{1,3})\s*\btable(s)?\b/i) ||
        lower.match(/\bremove\b.*\ball\b.*\bexcept\b.*\bfirst\b\s*(\d{1,3})\b/i);
    if (keepFirstMatch) {
        const count = Number(keepFirstMatch[1]);
        if (Number.isFinite(count) && count > 0) {
            return { type: 'keep_first_tables', count: Math.min(999, Math.floor(count)) };
        }
    }

    const reportDateMatch = normalized.match(/(?:generate|create|run)\s+(?:daily\s+)?report(?:\s+for)?\s+(\d{4}-\d{2}-\d{2})/i);
    if (reportDateMatch) {
        return { type: 'generate_report', date: reportDateMatch[1] };
    }

    if (/\b(generate|create|run)\b.*\b(report|daily report|yesterday'?s report)\b/i.test(normalized)) {
        return { type: 'generate_report' };
    }

    const analyticsSummaryMatch = normalized.match(/\b(?:analytics|revenue|summary|insights)\b.*\b(?:last|past)\s+(\d{1,2})\s+day/i);
    if (analyticsSummaryMatch) {
        const days = Number(analyticsSummaryMatch[1]);
        if (Number.isFinite(days) && days > 0) {
            return { type: 'analytics_summary', days: Math.min(30, Math.floor(days)) };
        }
    }

    if (/\b(analytics|revenue trend|sales summary|performance summary|analytics summary)\b/i.test(normalized)) {
        return { type: 'analytics_summary', days: 7 };
    }

    return { type: 'unknown' };
}

function looksLikeControlIntent(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    return /(add|create|insert|update|edit|delete|remove|arrange|make|set|organize|place|keep|rename|change|disable|enable|hide|show|unavailable|available|price|generate|download|export|summarize|analyze|fetch|refresh)\b/.test(normalized)
        && /(table|tables|menu item|item|menu|floor plan|layout|square|category|categories|availability|orders|history|analytics|report|reports|revenue|inventory|stock|branding|staff|customer|customers|account|dashboard)\b/.test(normalized);
}

function buildNextTablePosition(tableCount: number): { x: number; y: number } {
    const columns = 4;
    const col = tableCount % columns;
    const row = Math.floor(tableCount / columns);
    return {
        x: 80 + col * 150,
        y: 80 + row * 140,
    };
}

function buildSquarePositions(count: number): Array<{ x: number; y: number }> {
    if (count <= 0) return [];
    if (count === 1) return [{ x: 280, y: 220 }];

    const sideCount = Math.ceil(count / 4) + 1;
    const gap = 120;
    const x0 = 120;
    const y0 = 100;
    const x1 = x0 + gap * (sideCount - 1);
    const y1 = y0 + gap * (sideCount - 1);

    const positions: Array<{ x: number; y: number }> = [];

    // Top edge (left -> right)
    for (let i = 0; i < sideCount; i++) {
        positions.push({ x: x0 + i * gap, y: y0 });
    }

    // Right edge (top -> bottom), skip top-right corner
    for (let i = 1; i < sideCount; i++) {
        positions.push({ x: x1, y: y0 + i * gap });
    }

    // Bottom edge (right -> left), skip bottom-right corner
    for (let i = sideCount - 2; i >= 0; i--) {
        positions.push({ x: x0 + i * gap, y: y1 });
    }

    // Left edge (bottom -> top), skip both corners
    for (let i = sideCount - 2; i >= 1; i--) {
        positions.push({ x: x0, y: y0 + i * gap });
    }

    return positions.slice(0, count);
}

async function findCategoryByName(restaurantId: string, name: string) {
    const target = name.trim().toLowerCase();
    if (!target) return null;

    const categoriesSnap = await adminFirestore.collection(`restaurants/${restaurantId}/categories`).get();
    const exact = categoriesSnap.docs.find((docSnap) => String(docSnap.data()?.name || '').trim().toLowerCase() === target);
    if (exact) return exact;

    return categoriesSnap.docs.find((docSnap) => String(docSnap.data()?.name || '').trim().toLowerCase().includes(target)) || null;
}

async function findMenuItemByName(restaurantId: string, name: string) {
    const target = name.trim().toLowerCase();
    if (!target) return null;

    const itemsSnap = await adminFirestore.collection(`restaurants/${restaurantId}/menu_items`).get();
    const exact = itemsSnap.docs.find((docSnap) => String(docSnap.data()?.name || '').trim().toLowerCase() === target);
    if (exact) return exact;

    return itemsSnap.docs.find((docSnap) => String(docSnap.data()?.name || '').trim().toLowerCase().includes(target)) || null;
}

async function executeAction(action: ParsedAction, auth: AuthorizedRestaurant): Promise<ActionExecution | null> {
    if (action.type === 'unknown') return null;

    if (action.type === 'add_table') {
        const layoutRef = adminFirestore.doc(`restaurants/${auth.restaurantId}/settings/floor_layout`);
        const layoutSnap = await layoutRef.get();
        const currentTables = Array.isArray(layoutSnap.data()?.tables) ? layoutSnap.data()?.tables : [];

        const existingNumbers = currentTables
            .map((t: any) => String(t?.id || '').match(/(\d+)/)?.[1])
            .map((n: string | undefined) => (n ? Number(n) : NaN))
            .filter((n: number) => Number.isFinite(n));

        const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        const nextId = `T-${String(nextNum).padStart(2, '0')}`;
        const nextName = action.name || `Table ${nextNum}`;
        const pos = buildNextTablePosition(currentTables.length);

        const nextTable = {
            id: nextId,
            name: nextName,
            seats: action.seats,
            x: pos.x,
            y: pos.y,
            status: 'available',
        };

        await layoutRef.set(
            {
                tables: [...currentTables, nextTable],
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            },
            { merge: true }
        );

        return {
            ok: true,
            message: `Done. Added ${nextName} (${action.seats} seats) with id ${nextId}.`,
            data: nextTable,
        };
    }

    if (action.type === 'remove_table') {
        const layoutRef = adminFirestore.doc(`restaurants/${auth.restaurantId}/settings/floor_layout`);
        const layoutSnap = await layoutRef.get();
        const currentTables = Array.isArray(layoutSnap.data()?.tables) ? layoutSnap.data()?.tables : [];

        if (currentTables.length === 0) {
            return {
                ok: false,
                message: 'No tables exist yet, so there is nothing to remove.',
            };
        }

        const normalizedRef = action.tableRef.trim().toLowerCase();
        const refNumber = normalizedRef.match(/\d+/)?.[0] || '';

        const targetIndex = currentTables.findIndex((table: any) => {
            const id = String(table?.id || '').trim();
            const name = String(table?.name || '').trim();
            const idLower = id.toLowerCase();
            const nameLower = name.toLowerCase();

            if (!normalizedRef) return false;
            if (idLower === normalizedRef || nameLower === normalizedRef) return true;

            const idNumber = id.match(/\d+/)?.[0] || '';
            const nameNumber = name.match(/\d+/)?.[0] || '';
            if (refNumber && (idNumber === refNumber || nameNumber === refNumber)) return true;

            if (refNumber && (idLower === `t-${refNumber}` || idLower === `t-${refNumber.padStart(2, '0')}`)) return true;
            if (refNumber && (nameLower === `table ${refNumber}` || nameLower === `table-${refNumber}`)) return true;

            return false;
        });

        if (targetIndex < 0) {
            return {
                ok: false,
                message: `I could not find table ${action.tableRef}. Please share the exact table id or name (for example: T-11).`,
            };
        }

        const removed = currentTables[targetIndex];
        const nextTables = currentTables.filter((_: any, idx: number) => idx !== targetIndex);

        await layoutRef.set(
            {
                tables: nextTables,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            },
            { merge: true }
        );

        return {
            ok: true,
            message: `Done. Removed table ${String(removed?.name || removed?.id || action.tableRef)}.`,
            data: {
                removedId: String(removed?.id || ''),
                removedName: String(removed?.name || ''),
                remainingTables: nextTables.length,
            },
        };
    }

    if (action.type === 'add_menu_item') {
        const categoriesRef = adminFirestore.collection(`restaurants/${auth.restaurantId}/categories`);
        const categoriesSnap = await categoriesRef.get();

        let categoryId = '';
        let categoryName = action.category;
        let maxDisplayOrder = 0;

        categoriesSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const name = String(data?.name || '');
            if (name.toLowerCase() === action.category.toLowerCase()) {
                categoryId = docSnap.id;
                categoryName = name;
            }
            const order = Number(data?.display_order || 0);
            if (Number.isFinite(order) && order > maxDisplayOrder) {
                maxDisplayOrder = order;
            }
        });

        if (!categoryId) {
            const newCategoryRef = categoriesRef.doc();
            await newCategoryRef.set({
                name: action.category,
                display_order: maxDisplayOrder + 1,
                created_at: FieldValue.serverTimestamp(),
            });
            categoryId = newCategoryRef.id;
        }

        const menuItemRef = adminFirestore.collection(`restaurants/${auth.restaurantId}/menu_items`).doc();
        await menuItemRef.set({
            name: action.name,
            price: action.price,
            category_id: categoryId,
            category_name: categoryName,
            type: action.foodType,
            image_url: action.imageUrl || null,
            available: true,
            created_at: FieldValue.serverTimestamp(),
        });

        return {
            ok: true,
            message: `Done. Added menu item ${action.name} in ${categoryName} at ${formatINR(action.price)}.`,
            data: {
                id: menuItemRef.id,
                name: action.name,
                category: categoryName,
                price: action.price,
                type: action.foodType,
            },
        };
    }

    if (action.type === 'update_menu_item_price') {
        const menuItemDoc = await findMenuItemByName(auth.restaurantId, action.name);
        if (!menuItemDoc) {
            return {
                ok: false,
                message: `I could not find a menu item matching ${action.name}. Please share the exact item name.`,
            };
        }

        await menuItemDoc.ref.update({
            price: action.price,
            updated_at: FieldValue.serverTimestamp(),
        });

        return {
            ok: true,
            message: `Done. Updated ${String(menuItemDoc.data()?.name || action.name)} price to ${formatINR(action.price)}.`,
            data: {
                id: menuItemDoc.id,
                name: String(menuItemDoc.data()?.name || action.name),
                price: action.price,
            },
        };
    }

    if (action.type === 'toggle_menu_item_availability') {
        const menuItemDoc = await findMenuItemByName(auth.restaurantId, action.name);
        if (!menuItemDoc) {
            return {
                ok: false,
                message: `I could not find a menu item matching ${action.name}. Please share the exact item name.`,
            };
        }

        await menuItemDoc.ref.update({
            available: action.available,
            updated_at: FieldValue.serverTimestamp(),
        });

        return {
            ok: true,
            message: `Done. Marked ${String(menuItemDoc.data()?.name || action.name)} as ${action.available ? 'available' : 'unavailable'}.`,
            data: {
                id: menuItemDoc.id,
                name: String(menuItemDoc.data()?.name || action.name),
                available: action.available,
            },
        };
    }

    if (action.type === 'delete_menu_item') {
        const menuItemDoc = await findMenuItemByName(auth.restaurantId, action.name);
        if (!menuItemDoc) {
            return {
                ok: false,
                message: `I could not find a menu item matching ${action.name}. Please share the exact item name.`,
            };
        }

        const removedName = String(menuItemDoc.data()?.name || action.name);
        await menuItemDoc.ref.delete();

        return {
            ok: true,
            message: `Done. Removed menu item ${removedName}.`,
            data: {
                id: menuItemDoc.id,
                name: removedName,
            },
        };
    }

    if (action.type === 'add_category') {
        const existing = await findCategoryByName(auth.restaurantId, action.name);
        if (existing && String(existing.data()?.name || '').trim().toLowerCase() === action.name.trim().toLowerCase()) {
            return {
                ok: true,
                message: `Category ${String(existing.data()?.name || action.name)} already exists.`,
                data: {
                    id: existing.id,
                    name: String(existing.data()?.name || action.name),
                },
            };
        }

        const categoriesRef = adminFirestore.collection(`restaurants/${auth.restaurantId}/categories`);
        const categoriesSnap = await categoriesRef.get();
        const maxDisplayOrder = categoriesSnap.docs.reduce((max, docSnap) => {
            const value = Number(docSnap.data()?.display_order || 0);
            return Number.isFinite(value) && value > max ? value : max;
        }, 0);

        const newCategoryRef = categoriesRef.doc();
        await newCategoryRef.set({
            name: action.name,
            display_order: maxDisplayOrder + 1,
            created_at: FieldValue.serverTimestamp(),
        });

        return {
            ok: true,
            message: `Done. Added category ${action.name}.`,
            data: {
                id: newCategoryRef.id,
                name: action.name,
            },
        };
    }

    if (action.type === 'rename_category') {
        const sourceCategory = await findCategoryByName(auth.restaurantId, action.from);
        if (!sourceCategory) {
            return {
                ok: false,
                message: `I could not find category ${action.from}. Please share the exact category name.`,
            };
        }

        const duplicateTarget = await findCategoryByName(auth.restaurantId, action.to);
        if (duplicateTarget && duplicateTarget.id !== sourceCategory.id) {
            return {
                ok: false,
                message: `Category ${action.to} already exists. Please choose another name.`,
            };
        }

        await sourceCategory.ref.update({
            name: action.to,
            updated_at: FieldValue.serverTimestamp(),
        });

        const itemSnap = await adminFirestore
            .collection(`restaurants/${auth.restaurantId}/menu_items`)
            .where('category_id', '==', sourceCategory.id)
            .get();

        if (!itemSnap.empty) {
            const batch = adminFirestore.batch();
            itemSnap.docs.forEach((docSnap) => {
                batch.update(docSnap.ref, {
                    category_name: action.to,
                    updated_at: FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
        }

        return {
            ok: true,
            message: `Done. Renamed category ${String(sourceCategory.data()?.name || action.from)} to ${action.to}.`,
            data: {
                id: sourceCategory.id,
                name: action.to,
                updatedItems: itemSnap.size,
            },
        };
    }

    if (action.type === 'arrange_tables_square') {
        const layoutRef = adminFirestore.doc(`restaurants/${auth.restaurantId}/settings/floor_layout`);
        const layoutSnap = await layoutRef.get();
        const currentTables = Array.isArray(layoutSnap.data()?.tables) ? layoutSnap.data()?.tables : [];

        if (currentTables.length === 0) {
            return {
                ok: false,
                message: 'No tables found yet. Add at least one table first, then I can arrange them in a square.',
            };
        }

        const positions = buildSquarePositions(currentTables.length);
        const nextTables = currentTables.map((t: any, idx: number) => ({
            ...t,
            x: positions[idx]?.x ?? t?.x ?? 0,
            y: positions[idx]?.y ?? t?.y ?? 0,
        }));

        await layoutRef.set(
            {
                tables: nextTables,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            },
            { merge: true }
        );

        return {
            ok: true,
            message: `Done. Arranged ${nextTables.length} tables in a square layout.`,
            data: { arrangedCount: nextTables.length },
        };
    }

    if (action.type === 'keep_first_tables') {
        const layoutRef = adminFirestore.doc(`restaurants/${auth.restaurantId}/settings/floor_layout`);
        const layoutSnap = await layoutRef.get();
        const currentTables = Array.isArray(layoutSnap.data()?.tables) ? layoutSnap.data()?.tables : [];

        if (currentTables.length === 0) {
            return {
                ok: false,
                message: 'No tables exist yet, so there is nothing to prune.',
            };
        }

        const sortedTables = [...currentTables].sort((a: any, b: any) => {
            const aNum = Number(String(a?.id || '').match(/(\d+)/)?.[1] || NaN);
            const bNum = Number(String(b?.id || '').match(/(\d+)/)?.[1] || NaN);

            if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                return aNum - bNum;
            }

            return String(a?.id || '').localeCompare(String(b?.id || ''));
        });

        const keepCount = Math.min(action.count, sortedTables.length);
        const nextTables = sortedTables.slice(0, keepCount);
        const removedCount = sortedTables.length - nextTables.length;

        await layoutRef.set(
            {
                tables: nextTables,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: auth.uid,
            },
            { merge: true }
        );

        return {
            ok: true,
            message: `Done. Kept the first ${nextTables.length} tables and removed ${removedCount}.`,
            data: {
                kept: nextTables.length,
                removed: removedCount,
            },
        };
    }

    if (action.type === 'generate_report') {
        const reportDate = String(action.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10));
        const { report } = await generateDailyReport(auth.restaurantId, reportDate);
        return {
            ok: true,
            message: `Done. Generated report for ${report.report_date} with ${report.total_orders} orders and ${formatINR(Number(report.total_revenue || 0))} revenue.`,
            data: {
                reportDate: report.report_date,
                totalOrders: report.total_orders,
                totalRevenue: report.total_revenue,
            },
        };
    }

    if (action.type === 'analytics_summary') {
        const days = Math.max(1, Math.min(30, Number(action.days || 7)));
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (days - 1));

        const ordersSnap = await adminFirestore
            .collection(`restaurants/${auth.restaurantId}/orders`)
            .where('created_at', '>=', start)
            .get();

        const rows = ordersSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
        const valid = rows.filter((row) => String(row.status || '') !== 'cancelled');
        const cancelled = rows.length - valid.length;
        const revenue = valid.reduce((sum, row) => sum + Number(row.total || 0), 0);
        const avg = valid.length > 0 ? revenue / valid.length : 0;

        return {
            ok: true,
            message: `Analytics summary for last ${days} days: ${valid.length} active orders, ${cancelled} cancelled, revenue ${formatINR(revenue)}, average order value ${formatINR(Math.round(avg))}.`,
            data: {
                days,
                orders: valid.length,
                cancelled,
                revenue,
                averageOrderValue: avg,
            },
        };
    }

    return null;
}

function buildContextPrompt(context: DashboardContext | null, currentPath?: string): string {
    if (!context) return '';

    const safe = {
        restaurant: context.restaurant || {},
        metrics: context.metrics || {},
        modules: context.modules || {},
        navigation: (context as any).navigation || {},
        components: (context as any).components || {},
        uiTips: context.uiTips || {},
        generatedAt: context.generatedAt || null,
    };

    return [
        'Live dashboard context (trusted application snapshot):',
        JSON.stringify(safe),
        'Use this context to answer operational and usage questions accurately.',
        currentPath ? `Current dashboard page path: ${currentPath}` : '',
        'If asked about numbers, prefer these values over generic estimates.',
        'You are connected to all dashboard pages/components listed in this context, plus major modules: menu, tables, orders, inventory, reports, analytics, customers, branding, staff, account settings, waiter, kitchen, and history workflows.',
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
        .replace(/<\s*(think|analysis)[^>]*>[\s\S]*?<\s*\/\s*(think|analysis)\s*>/gi, '')
        .replace(/<\s*(think|analysis)[^>]*>[\s\S]*$/gi, '')
        .replace(/```(?:think|analysis)?[\s\S]*?```/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .trim();

    if (!stripped) {
        return 'I can help with operations, growth, and QR troubleshooting. What would you like to improve first?';
    }

    const lines = stripped
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8);

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

function extractFirstJsonObject(text: string): Record<string, unknown> | null {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;

    const direct = (() => {
        try {
            const parsed = JSON.parse(trimmed);
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    })();
    if (direct) return direct;

    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] || trimmed.match(/```\s*([\s\S]*?)```/i)?.[1] || '';
    if (fenced) {
        try {
            const parsed = JSON.parse(fenced.trim());
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
            // fall through
        }
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const candidate = trimmed.slice(firstBrace, lastBrace + 1);
        try {
            const parsed = JSON.parse(candidate);
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }

    return null;
}

function normalizeTextValue(value: unknown): string {
    return String(value || '').trim();
}

function coerceParsedAction(raw: unknown): ParsedAction {
    if (!raw || typeof raw !== 'object') return { type: 'unknown' };

    const input = raw as Record<string, unknown>;
    const type = normalizeTextValue(input.type).toLowerCase();

    if (type === 'add_table') {
        const seats = Number(input.seats);
        const name = normalizeTextValue(input.name);
        if (!Number.isFinite(seats) || seats <= 0) return { type: 'unknown' };
        return {
            type: 'add_table',
            seats: Math.min(20, Math.max(1, Math.floor(seats))),
            name: name || undefined,
        };
    }

    if (type === 'remove_table') {
        const tableRef = normalizeTextValue(input.tableRef || input.table || input.id || input.name);
        if (!tableRef) return { type: 'unknown' };
        return {
            type: 'remove_table',
            tableRef,
        };
    }

    if (type === 'add_menu_item') {
        const name = normalizeTextValue(input.name);
        const category = normalizeTextValue(input.category);
        const price = Number(input.price);
        const rawFoodType = normalizeTextValue(input.foodType || input.type).toLowerCase();
        const imageUrl = normalizeTextValue(input.imageUrl);
        if (!name || !category || !Number.isFinite(price) || price <= 0) return { type: 'unknown' };
        return {
            type: 'add_menu_item',
            name,
            price,
            category,
            foodType: rawFoodType.includes('non') ? 'non-veg' : 'veg',
            imageUrl: imageUrl || undefined,
        };
    }

    if (type === 'update_menu_item_price') {
        const name = normalizeTextValue(input.name);
        const price = Number(input.price);
        if (!name || !Number.isFinite(price) || price <= 0) return { type: 'unknown' };
        return {
            type: 'update_menu_item_price',
            name,
            price,
        };
    }

    if (type === 'toggle_menu_item_availability') {
        const name = normalizeTextValue(input.name);
        const available = Boolean(input.available);
        if (!name) return { type: 'unknown' };
        return {
            type: 'toggle_menu_item_availability',
            name,
            available,
        };
    }

    if (type === 'delete_menu_item') {
        const name = normalizeTextValue(input.name);
        if (!name) return { type: 'unknown' };
        return {
            type: 'delete_menu_item',
            name,
        };
    }

    if (type === 'add_category') {
        const name = normalizeTextValue(input.name);
        if (!name) return { type: 'unknown' };
        return {
            type: 'add_category',
            name,
        };
    }

    if (type === 'rename_category') {
        const from = normalizeTextValue(input.from);
        const to = normalizeTextValue(input.to);
        if (!from || !to || from.toLowerCase() === to.toLowerCase()) return { type: 'unknown' };
        return {
            type: 'rename_category',
            from,
            to,
        };
    }

    if (type === 'arrange_tables_square') {
        return { type: 'arrange_tables_square' };
    }

    if (type === 'keep_first_tables') {
        const count = Number(input.count);
        if (!Number.isFinite(count) || count <= 0) return { type: 'unknown' };
        return {
            type: 'keep_first_tables',
            count: Math.min(999, Math.floor(count)),
        };
    }

    if (type === 'generate_report') {
        const date = normalizeTextValue(input.date);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
        return {
            type: 'generate_report',
            date: validDate ? date : undefined,
        };
    }

    if (type === 'analytics_summary') {
        const days = Number(input.days);
        if (!Number.isFinite(days) || days <= 0) {
            return { type: 'analytics_summary', days: 7 };
        }
        return {
            type: 'analytics_summary',
            days: Math.min(30, Math.floor(days)),
        };
    }

    return { type: 'unknown' };
}

const ACTION_PLANNER_PROMPT = [
    'You convert free-form admin instructions into one executable dashboard action JSON.',
    'Output STRICT JSON only. No markdown.',
    'Allowed action types: add_table, remove_table, add_menu_item, update_menu_item_price, toggle_menu_item_availability, delete_menu_item, add_category, rename_category, arrange_tables_square, keep_first_tables, generate_report, analytics_summary, unknown.',
    'Required shape by type:',
    '- add_table: {"type":"add_table","seats":number,"name"?:string}',
    '- remove_table: {"type":"remove_table","tableRef":string}',
    '- add_menu_item: {"type":"add_menu_item","name":string,"price":number,"category":string,"foodType":"veg"|"non-veg","imageUrl"?:string}',
    '- update_menu_item_price: {"type":"update_menu_item_price","name":string,"price":number}',
    '- toggle_menu_item_availability: {"type":"toggle_menu_item_availability","name":string,"available":boolean}',
    '- delete_menu_item: {"type":"delete_menu_item","name":string}',
    '- add_category: {"type":"add_category","name":string}',
    '- rename_category: {"type":"rename_category","from":string,"to":string}',
    '- arrange_tables_square: {"type":"arrange_tables_square"}',
    '- keep_first_tables: {"type":"keep_first_tables","count":number}',
    '- generate_report: {"type":"generate_report","date"?:"YYYY-MM-DD"}',
    '- analytics_summary: {"type":"analytics_summary","days":number}',
    '- unknown: {"type":"unknown"}',
    'Rules:',
    '- Infer intent even from messy grammar/typos/Hinglish.',
    '- If multiple actions are requested, return the first executable action only.',
    '- If required fields are missing, return unknown.',
].join('\n');

async function inferActionFromOpenAi(apiKey: string, model: string, latestUserMessage: string): Promise<ParsedAction> {
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 220,
            messages: [
                { role: 'system', content: ACTION_PLANNER_PROMPT },
                { role: 'user', content: latestUserMessage.slice(0, 1500) },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI action planner failed: ${response.status}`);
    }

    const data: any = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim();
    const parsed = extractFirstJsonObject(raw);
    return coerceParsedAction(parsed);
}

async function inferActionFromGemini(apiKey: string, latestUserMessage: string): Promise<ParsedAction> {
    for (const modelName of MODEL_CANDIDATES) {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: ACTION_PLANNER_PROMPT }] },
                    contents: [{ role: 'user', parts: [{ text: latestUserMessage.slice(0, 1500) }] }],
                    generationConfig: {
                        temperature: 0,
                        maxOutputTokens: 220,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                continue;
            }
            throw new Error(`Gemini action planner failed: ${response.status}`);
        }

        const data: any = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
            .join('\n')
            .trim();
        const parsed = extractFirstJsonObject(raw || '');
        return coerceParsedAction(parsed);
    }

    return { type: 'unknown' };
}

async function inferActionFromGroq(apiKeys: string[], latestUserMessage: string): Promise<ParsedAction> {
    const endpoint = resolveGroqChatCompletionsUrl(process.env.GROQ_API_URL);
    let lastError = 'Groq action planner failed';
    let sawQuotaError = false;

    for (const apiKey of apiKeys) {
        for (const modelName of resolveGroqModelCandidates()) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    temperature: 0,
                    max_tokens: 220,
                    messages: [
                        { role: 'system', content: ACTION_PLANNER_PROMPT },
                        { role: 'user', content: latestUserMessage.slice(0, 1500) },
                    ],
                }),
            });

            if (!response.ok) {
                const details = await response.text();
                lastError = `${modelName}: ${response.status} ${details.slice(0, 220)}`;
                if (response.status === 429) {
                    sawQuotaError = true;
                    break;
                }
                if (response.status === 400 || response.status === 404) continue;
                throw new Error(`Groq action planner failed: ${response.status}`);
            }

            const data: any = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content;
            const raw = String(
                Array.isArray(rawContent)
                    ? rawContent
                        .map((p: any) => (typeof p?.text === 'string' ? p.text : typeof p === 'string' ? p : ''))
                        .join('\n')
                    : rawContent || ''
            ).trim();
            const parsed = extractFirstJsonObject(raw);
            const action = coerceParsedAction(parsed);
            if (action.type !== 'unknown') return action;
        }
    }

    if (sawQuotaError) {
        throw new Error('Groq quota exceeded across all configured API keys.');
    }

    throw new Error(lastError);
}

async function inferActionFromAi(latestUserMessage: string, groqApiKeys: string[], openAiApiKey?: string, openAiModelCandidates?: string[], geminiApiKey?: string): Promise<ParsedAction> {
    if (groqApiKeys.length > 0) {
        try {
            const action = await inferActionFromGroq(groqApiKeys, latestUserMessage);
            if (action.type !== 'unknown') return action;
        } catch {
            // Non-fatal fallback.
        }
    }

    if (openAiApiKey && Array.isArray(openAiModelCandidates) && openAiModelCandidates.length > 0) {
        for (const candidateModel of openAiModelCandidates) {
            try {
                const action = await inferActionFromOpenAi(openAiApiKey, candidateModel, latestUserMessage);
                if (action.type !== 'unknown') return action;
            } catch {
                // Try next model/provider.
            }
        }
    }

    if (geminiApiKey) {
        try {
            const action = await inferActionFromGemini(geminiApiKey, latestUserMessage);
            if (action.type !== 'unknown') return action;
        } catch {
            // Non-fatal fallback.
        }
    }

    return { type: 'unknown' };
}

async function requestOpenAiReply(apiKey: string, model: string, messages: ChatMessage[], contextPrompt: string): Promise<ProviderReply> {
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.5,
            top_p: 0.85,
            max_tokens: 420,
            messages: [
                {
                    role: 'system',
                    content: contextPrompt ? `${SYSTEM_PROMPT}\n\n${contextPrompt}` : SYSTEM_PROMPT,
                },
                ...messages.map((m) => ({ role: m.role, content: m.content })),
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
            throw Object.assign(new Error('OpenAI quota exceeded for this API key.'), {
                statusCode: 429,
                errorCode: 'quota_exceeded',
                details: errorText.slice(0, 500),
            });
        }

        throw Object.assign(new Error(`OpenAI request failed: ${response.status}`), {
            statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
            details: errorText.slice(0, 500),
        });
    }

    const data: any = await response.json();
    const rawReply =
        data?.choices?.[0]?.message?.content?.trim() ||
        'I can help with menu optimization, metrics explanation, QR troubleshooting, and staff advice. What would you like to improve first?';

    return {
        rawReply,
        selectedModel: data?.model || model,
    };
}

function resolveOpenAiModelCandidates(): string[] {
    const raw = process.env.OPENAI_MODEL_CANDIDATES || process.env.OPENAI_MODEL || 'gpt-5.2-codex';
    const unique = new Set(
        raw
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
    );
    return Array.from(unique);
}

async function requestGroqReply(apiKeys: string[], messages: ChatMessage[], contextPrompt: string): Promise<ProviderReply> {
    const endpoint = resolveGroqChatCompletionsUrl(process.env.GROQ_API_URL);
    let lastError = 'Groq request failed';
    let sawQuotaError = false;

    for (const apiKey of apiKeys) {
        for (const modelName of resolveGroqModelCandidates()) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    temperature: 0.5,
                    top_p: 0.85,
                    max_tokens: 420,
                    messages: [
                        {
                            role: 'system',
                            content: contextPrompt ? `${SYSTEM_PROMPT}\n\n${contextPrompt}` : SYSTEM_PROMPT,
                        },
                        ...messages.map((m) => ({ role: m.role, content: m.content })),
                    ],
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                lastError = `${modelName}: ${response.status} ${errorText.slice(0, 500)}`;
                if (response.status === 429) {
                    sawQuotaError = true;
                    break;
                }
                if (response.status === 400 || response.status === 404) continue;

                throw Object.assign(new Error(`Groq request failed: ${response.status}`), {
                    statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
                    details: errorText.slice(0, 500),
                });
            }

            const data: any = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content;
            const rawReply = String(
                Array.isArray(rawContent)
                    ? rawContent
                        .map((p: any) => (typeof p?.text === 'string' ? p.text : typeof p === 'string' ? p : ''))
                        .join('\n')
                    : rawContent || ''
            ).trim() || 'I can help with menu optimization, metrics explanation, QR troubleshooting, and staff advice. What would you like to improve first?';

            return {
                rawReply,
                selectedModel: data?.model || modelName,
            };
        }
    }

    if (sawQuotaError) {
        throw Object.assign(new Error('Groq quota exceeded across all configured API keys.'), {
            statusCode: 429,
            errorCode: 'quota_exceeded',
            details: lastError,
        });
    }

    throw Object.assign(new Error('No configured Groq model candidate succeeded.'), {
        statusCode: 502,
        details: lastError,
    });
}

async function requestGeminiReply(apiKey: string, messages: ChatMessage[], contextPrompt: string): Promise<ProviderReply> {
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
                throw Object.assign(new Error('Gemini quota exceeded for this API key.'), {
                    statusCode: 429,
                    errorCode: 'quota_exceeded',
                    details: 'Please check Gemini API billing/quota and retry after quota resets.',
                });
            }

            throw Object.assign(new Error(`Gemini request failed: ${candidateResponse.status}`), {
                statusCode: mappedStatus,
                details: lastErrorDetails,
            });
        }
    }

    if (!geminiResponse) {
        throw Object.assign(new Error('No supported Gemini model found for this API key.'), {
            statusCode: 502,
            details: lastErrorDetails,
        });
    }

    const data: any = await geminiResponse.json();
    const rawReply =
        data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
            .join('\n')
            .trim() ||
        'I can help with menu optimization, metrics explanation, QR troubleshooting, and staff advice. What would you like to improve first?';

    return {
        rawReply,
        selectedModel: selectedModel || MODEL_CANDIDATES[0],
    };
}

export async function POST(request: NextRequest) {
    const groqApiKeys = resolveGroqApiKeys();
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const openAiModelCandidates = resolveOpenAiModelCandidates();
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (groqApiKeys.length === 0 && !openAiApiKey && !geminiApiKey) {
        return NextResponse.json(
            { error: 'No AI provider key configured. Set GROQ_API_KEY/GROQ_API_KEYS, OPENAI_API_KEY, or GEMINI_API_KEY.' },
            { status: 500 }
        );
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
        const todayYmd = getTodayYmdIst();
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
        // AI dashboard assistant runs without per-plan daily caps.

        const messages = sanitizeMessages(body?.messages);
        const dashboardContext = (body?.dashboardContext && typeof body.dashboardContext === 'object'
            ? (body.dashboardContext as DashboardContext)
            : null);

        const currentPath = typeof body?.currentPath === 'string' ? body.currentPath.trim().slice(0, 200) : '';
        const contextPrompt = buildContextPrompt(dashboardContext, currentPath);
        if (messages.length === 0) {
            return NextResponse.json({ error: 'At least one message is required.' }, { status: 400 });
        }

        const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
        let parsedAction = parseActionFromText(latestUserMessage);
        if (parsedAction.type === 'unknown' && looksLikeControlIntent(latestUserMessage)) {
            parsedAction = await inferActionFromAi(latestUserMessage, groqApiKeys, openAiApiKey, openAiModelCandidates, geminiApiKey);
        }

        if (parsedAction.type !== 'unknown') {
            const actionResult = await executeAction(parsedAction, auth);
            if (actionResult) {
                return NextResponse.json({
                    reply: actionResult.message,
                    usage: currentUsage,
                    action: {
                        type: parsedAction.type,
                        ok: actionResult.ok,
                        data: actionResult.data,
                    },
                });
            }
        }

        if (looksLikeControlIntent(latestUserMessage)) {
            return NextResponse.json({
                reply:
                    'I can execute that right away across dashboard workflows. Try: "make paneer tikka unavailable", "change margherita price to 349", "generate yesterday report", "give analytics summary for last 7 days", "arrange all tables in square", or "keep only first 10 tables".',
                usage: currentUsage,
                action: {
                    type: 'clarification',
                    ok: false,
                },
            });
        }

        let providerReply: ProviderReply;
        try {
            if (groqApiKeys.length > 0) {
                providerReply = await requestGroqReply(groqApiKeys, messages, contextPrompt);
            } else if (openAiApiKey) {
                let openAiError: any = null;
                let resolvedReply: ProviderReply | null = null;

                for (const candidateModel of openAiModelCandidates) {
                    try {
                        resolvedReply = await requestOpenAiReply(openAiApiKey, candidateModel, messages, contextPrompt);
                        break;
                    } catch (err: any) {
                        openAiError = err;

                        const status = Number(err?.statusCode || 0);
                        const details = String(err?.details || '').toLowerCase();
                        const message = String(err?.message || '').toLowerCase();
                        const canTryNextModel =
                            status === 400 ||
                            status === 404 ||
                            details.includes('model') ||
                            message.includes('model');

                        if (!canTryNextModel) {
                            throw err;
                        }
                    }
                }

                if (!resolvedReply) {
                    throw openAiError || new Error('No configured OpenAI model candidate succeeded.');
                }

                providerReply = resolvedReply;
            } else if (geminiApiKey) {
                providerReply = await requestGeminiReply(geminiApiKey, messages, contextPrompt);
            } else {
                return NextResponse.json(
                    { error: 'No AI provider key configured. Set GROQ_API_KEY/GROQ_API_KEYS, OPENAI_API_KEY, or GEMINI_API_KEY.' },
                    { status: 500 }
                );
            }
        } catch (providerError: any) {
            return NextResponse.json(
                {
                    error: providerError?.message || 'AI provider request failed.',
                    code: providerError?.errorCode,
                    details: providerError?.details,
                },
                { status: providerError?.statusCode || 502 }
            );
        }

        const reply = normalizeAssistantReply(providerReply.rawReply);

        const nextUsage = buildUsage(tier, dailyAiCount + 1);
        await restaurantRef.set(
            {
                usage: {
                    dailyAiCount: FieldValue.increment(1),
                    dailyAiDate: todayYmd,
                    lastAiAt: FieldValue.serverTimestamp(),
                    lastAiModel: providerReply.selectedModel,
                },
            },
            { merge: true },
        );

        return NextResponse.json({ reply, usage: nextUsage });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Support chat request failed.' }, { status: 500 });
    }
}
