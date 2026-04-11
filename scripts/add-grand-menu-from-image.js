const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
const restaurantId = 'the-grand-mmk89g5w';
const categoryName = 'Imported From Sheet (Mar 2026)';

// Parsed from the screenshot provided by user.
// Only SUCCESS rows are included; FAILED row was intentionally skipped.
const rawRows = [
    { name: 'SUVIDHA GENERAL STO', price: 100.0 },
    { name: 'SHRI DURGA HOSPITALI', price: 20.0 },
    { name: 'AAKRITI', price: 500.0 },
    { name: 'SUJATHA SATISH SHETTY', price: 30.0 },
    { name: 'VIJAYANTH SHETTY', price: 5.0 },
    { name: 'VIJAYANTH SHETTY', price: 22.0 },
    { name: 'SHRI DURGA HOSPITALI', price: 50.0 },
    { name: 'SRI LAXMI GENERAL STORE', price: 3.0 },
    { name: 'SRI LAXMI GENERAL STORE', price: 20.0 },
    { name: 'SUVIDHA GENERAL STO', price: 40.0 },
    { name: 'SUVIDHA GENERAL STO', price: 98.0 },
    { name: 'Dominos Pizza', price: 243.6 },
    { name: 'Vikas K H', price: 89.0 },
    { name: 'Vikas K H', price: 109.0 },
    { name: 'super.money', price: 13.94 },
    { name: 'NITTE DEEMED TO BE UNIVERSITY', price: 10.0 },
    { name: 'VINYAS', price: 109.0 },
    { name: 'VIJAYANTH SHETTY', price: 27.0 },
    { name: 'ANUPA SHETTY', price: 110.0 },
    { name: 'YOGINI', price: 20.0 },
    { name: 'YOGINI', price: 40.0 },
    { name: 'Nithesh', price: 60.0 },
    { name: 'SHRI DURGA HOSPITALI', price: 45.0 },
    { name: 'Vikas K H', price: 180.0 },
    { name: 'Gautham Icecream', price: 50.0 },
];

function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueByNameAndPrice(rows) {
    const seen = new Set();
    const result = [];

    for (const row of rows) {
        const name = normalizeName(row.name);
        const price = Number(row.price);
        if (!name || !Number.isFinite(price) || price <= 0) continue;

        const key = `${name.toLowerCase()}::${price.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ name, price });
    }

    return result;
}

async function getOrCreateCategoryId() {
    const categoriesRef = db.collection('restaurants').doc(restaurantId).collection('categories');
    const existing = await categoriesRef.where('name', '==', categoryName).limit(1).get();

    if (!existing.empty) {
        return existing.docs[0].id;
    }

    const all = await categoriesRef.get();
    const maxOrder = all.docs.reduce((max, doc) => {
        const order = Number(doc.data().display_order || 0);
        return Number.isFinite(order) ? Math.max(max, order) : max;
    }, 0);

    const created = await categoriesRef.add({
        name: categoryName,
        display_order: maxOrder + 1,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return created.id;
}

async function addMenuRows() {
    const menuItemsRef = db.collection('restaurants').doc(restaurantId).collection('menu_items');
    const categoryId = await getOrCreateCategoryId();
    const rows = uniqueByNameAndPrice(rawRows);

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
        const dupe = await menuItemsRef
            .where('name', '==', row.name)
            .where('price', '==', row.price)
            .limit(1)
            .get();

        if (!dupe.empty) {
            skipped += 1;
            continue;
        }

        await menuItemsRef.add({
            name: row.name,
            price: row.price,
            category_id: categoryId,
            category_name: categoryName,
            type: 'veg',
            available: true,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        created += 1;
    }

    console.log(`Restaurant: ${restaurantId}`);
    console.log(`Category: ${categoryName}`);
    console.log(`Processed rows: ${rows.length}`);
    console.log(`Created: ${created}`);
    console.log(`Skipped existing: ${skipped}`);
}

addMenuRows()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Failed to add imported rows:', err.message);
        process.exit(1);
    });
