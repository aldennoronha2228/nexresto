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
import { adminAuth, adminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

interface ExcelRow {
    Name?: string;
    name?: string;
    Price?: number | string;
    price?: number | string;
    Category?: string;
    category?: string;
    Type?: string;
    type?: string;
    'Image URL'?: string;
    image_url?: string;
    ImageURL?: string;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const tenantId = formData.get('tenantId') as string | null;

        // Optionally, require an auth header to verify permission
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.replace('Bearer ', '');
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(idToken);
        } catch {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const userRecord = await adminAuth.getUser(decodedToken.uid);
        const claims = userRecord.customClaims || {};

        const claimRestaurantId = String(claims.restaurant_id || claims.tenant_id || '');
        if (claims.role !== 'super_admin' && claimRestaurantId !== tenantId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
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
        const rows: ExcelRow[] = XLSX.utils.sheet_to_json(sheet);

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
                categoryMap.set(data.name.toLowerCase(), doc.id);
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

        const batch = adminFirestore.batch();
        let batchCount = 0;

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number (1-indexed + header row)

            // Extract values (handle different column name formats)
            const name = (row.Name || row.name || '').toString().trim();
            const price = parseFloat((row.Price ?? row.price ?? '').toString());
            const categoryName = (row.Category || row.category || '').toString().trim();
            const typeRaw = (row.Type || row.type || 'veg').toString().toLowerCase().trim();
            const imageUrl = (row['Image URL'] || row.image_url || row.ImageURL || '').toString().trim();

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
            let categoryId = categoryMap.get(categoryName.toLowerCase());

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
                categoryMap.set(categoryName.toLowerCase(), categoryId);
                results.categoriesCreated.push(categoryName);
                batchCount++;
            }

            // Normalize type
            const type: 'veg' | 'non-veg' = typeRaw.includes('non') || typeRaw === 'nonveg' ? 'non-veg' : 'veg';

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
            if (batchCount >= 450) {
                await batch.commit();
                batchCount = 0;
            }

            results.imported++;
        }

        // Commit remaining batch
        if (batchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            message: `Imported ${results.imported} items`,
            ...results,
        });

    } catch (err: any) {
        console.error('[menu/import] Error:', err);
        return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 });
    }
}
