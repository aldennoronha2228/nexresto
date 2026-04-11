/**
 * POST /api/menu/import  (Firebase)
 * -----------------------------------
 * Imports menu items from an uploaded Excel file.
 * 
 * Expected Excel columns:
 * - Name (required)
 * - Price (required)
 * - Category (required - must match existing category name or we create one)
 * - Type (optional - 'veg' or 'non-veg', defaults to 'veg')
 * - Image URL (optional)
 */

import { NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { authorizeTenantAccess } from '@/lib/server/authz/tenant';

interface ExcelRow {
    [key: string]: string | number | undefined;
}

const NAME_KEYS = ['name', 'itemname', 'dishname', 'item'];
const PRICE_KEYS = ['price', 'rate', 'amount', 'cost'];
const CATEGORY_KEYS = ['category', 'categoryname', 'section'];
const TYPE_KEYS = ['type', 'itemtype', 'vegornonveg', 'veg'];
const IMAGE_KEYS = ['imageurl', 'image', 'image_link', 'imagepath'];

function normalizeHeaderKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeCategoryKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getRowValue(row: ExcelRow, expectedKeys: string[]): string {
    for (const [rawKey, rawValue] of Object.entries(row)) {
        const key = normalizeHeaderKey(rawKey);
        if (!expectedKeys.includes(key)) continue;
        if (rawValue === undefined || rawValue === null) continue;
        return String(rawValue).trim();
    }
    return '';
}

function parsePrice(value: string): number {
    if (!value) return NaN;
    const cleaned = value.replace(/[₹$,]/g, '').replace(/\s+/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeType(value: string): 'veg' | 'non-veg' {
    const typeRaw = value.trim().toLowerCase().replace(/\s+/g, '');
    if (['nonveg', 'non-veg', 'nveg', 'nv', 'nonvegetarian'].includes(typeRaw)) {
        return 'non-veg';
    }
    return 'veg';
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const tenantId = String(formData.get('tenantId') || formData.get('restaurantId') || '').trim();

        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
        }

        // Optionally, require an auth header to verify permission
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.replace('Bearer ', '');
        try {
            const authz = await authorizeTenantAccess(idToken, tenantId, 'manage');
            if (!authz) {
                return NextResponse.json({
                    error: `Forbidden: tenant mismatch. You are not allowed to import menu data for restaurantId=${tenantId}.`,
                }, { status: 403 });
            }
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Read the Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 });
        }

        const sheet = workbook.Sheets[sheetName];
        const rows: ExcelRow[] = XLSX.utils.sheet_to_json(sheet, {
            defval: '',
            raw: false,
            blankrows: false,
        });

        if (rows.length === 0) {
            return NextResponse.json({ error: 'No data found in Excel file' }, { status: 400 });
        }

        // Fetch existing categories for this tenant
        const categoriesSnap = await adminFirestore
            .collection(`restaurants/${tenantId}/categories`)
            .get();

        const categoryMap = new Map<string, string>();
        let maxSortOrder = 0;

        categoriesSnap.forEach(doc => {
            const data = doc.data();
            if (data.name) {
                categoryMap.set(normalizeCategoryKey(String(data.name)), doc.id);
            }
            if (data.display_order > maxSortOrder) {
                maxSortOrder = data.display_order;
            }
        });

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as string[],
            categoriesCreated: [] as string[],
        };

        let batch = adminFirestore.batch();
        let batchCount = 0;

        const commitBatchIfNeeded = async (force = false) => {
            if (!force && batchCount < 450) return;
            if (batchCount === 0) return;
            await batch.commit();
            batch = adminFirestore.batch();
            batchCount = 0;
        };

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number (1-indexed + header row)

            // Extract values (handle different column name formats)
            const name = getRowValue(row, NAME_KEYS);
            const price = parsePrice(getRowValue(row, PRICE_KEYS));
            const categoryName = getRowValue(row, CATEGORY_KEYS);
            const typeValue = getRowValue(row, TYPE_KEYS);
            const imageUrl = getRowValue(row, IMAGE_KEYS);

            // Validate required fields
            if (!name) {
                results.errors.push(`Row ${rowNum}: Missing item name`);
                results.skipped++;
                continue;
            }

            if (isNaN(price) || price <= 0) {
                results.errors.push(`Row ${rowNum}: Invalid price for "${name}"`);
                results.skipped++;
                continue;
            }

            if (!categoryName) {
                results.errors.push(`Row ${rowNum}: Missing category for "${name}"`);
                results.skipped++;
                continue;
            }

            // Find or create category
            const normalizedCategory = normalizeCategoryKey(categoryName);
            let categoryId = categoryMap.get(normalizedCategory);

            if (!categoryId) {
                // Create new category
                const newCatRef = adminFirestore.collection(`restaurants/${tenantId}/categories`).doc();
                maxSortOrder++;
                batch.set(newCatRef, {
                    name: categoryName,
                    display_order: maxSortOrder,
                    created_at: FieldValue.serverTimestamp(),
                });

                categoryId = newCatRef.id;
                categoryMap.set(normalizedCategory, categoryId);
                results.categoriesCreated.push(categoryName);
                batchCount++;
            }

            // Normalize type
            const type = normalizeType(typeValue || 'veg');

            // Insert menu item
            const newItemRef = adminFirestore.collection(`restaurants/${tenantId}/menu_items`).doc();
            batch.set(newItemRef, {
                name,
                price,
                category_id: categoryId,
                type,
                image_url: imageUrl || null,
                available: true,
                created_at: FieldValue.serverTimestamp(),
            });
            batchCount++;

            // Commit batch if it gets too large (Firestore limit is 500 ops per batch)
            await commitBatchIfNeeded();

            results.imported++;
        }

        // Commit remaining batch
        await commitBatchIfNeeded(true);

        return NextResponse.json({
            success: true,
            message: `Imported ${results.imported} items`,
            ...results,
        });

    } catch (error: unknown) {
        console.error('[menu/import] Error:', error);
        return NextResponse.json({ error: errorMessage(error, 'Import failed') }, { status: 500 });
    }
}
