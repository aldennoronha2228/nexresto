const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
}

const db = admin.firestore();
const restaurantId = 'the-grand-mmk89g5w';

const menuData = [
    // Indo Chinese (Starters)
    { name: 'Gobi Chilli', price: 110, category: 'Indo Chinese', type: 'veg' },
    { name: 'Gobi Manchurian (Half)', price: 60, category: 'Indo Chinese', type: 'veg' },
    { name: 'Gobi Manchurian (Full)', price: 110, category: 'Indo Chinese', type: 'veg' },
    { name: 'Mushroom Manchurian (Half)', price: 70, category: 'Indo Chinese', type: 'veg' },
    { name: 'Mushroom Manchurian (Full)', price: 120, category: 'Indo Chinese', type: 'veg' },
    { name: 'Mushroom Chilli (Half)', price: 70, category: 'Indo Chinese', type: 'veg' },
    { name: 'Mushroom Chilli (Full)', price: 120, category: 'Indo Chinese', type: 'veg' },
    { name: 'Paneer Chilli (Half)', price: 90, category: 'Indo Chinese', type: 'veg' },
    { name: 'Paneer Chilli (Full)', price: 160, category: 'Indo Chinese', type: 'veg' },
    { name: 'Paneer Manchurian (Half)', price: 90, category: 'Indo Chinese', type: 'veg' },
    { name: 'Paneer Manchurian (Full)', price: 160, category: 'Indo Chinese', type: 'veg' },
    { name: 'Paneer Pepper Fry', price: 160, category: 'Indo Chinese', type: 'veg' },
    { name: 'Fried Chicken - Kabab', price: 80, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Pepper Chicken', price: 160, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Dragon (Half)', price: 100, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Dragon (Full)', price: 180, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Lollipop Dry (Single)', price: 30, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Lollipop Dry (Half-4)', price: 90, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Lollipop Dry (Plate-8)', price: 160, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chilli Chicken (Half)', price: 80, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chilli Chicken (Full)', price: 150, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Manchurian (Half)', price: 100, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Chicken Manchurian (Full)', price: 160, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Dragon Lollypop (Single)', price: 35, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Dragon Lollypop (Half-4)', price: 120, category: 'Indo Chinese', type: 'non-veg' },
    { name: 'Dragon Lollypop (Plate-8)', price: 220, category: 'Indo Chinese', type: 'non-veg' },

    // Fried Rice
    { name: 'Veg Fried Rice (Half)', price: 50, category: 'Fried Rice', type: 'veg' },
    { name: 'Veg Fried Rice (Full)', price: 80, category: 'Fried Rice', type: 'veg' },
    { name: 'Veg Schezwan Fried Rice (Half)', price: 60, category: 'Fried Rice', type: 'veg' },
    { name: 'Veg Schezwan Fried Rice (Full)', price: 90, category: 'Fried Rice', type: 'veg' },
    { name: 'Mushroom Fried Rice (Half)', price: 80, category: 'Fried Rice', type: 'veg' },
    { name: 'Mushroom Fried Rice (Full)', price: 140, category: 'Fried Rice', type: 'veg' },
    { name: 'Veg Tripple Rice', price: 80, category: 'Fried Rice', type: 'veg' },
    { name: 'Paneer Fried Rice (Half)', price: 80, category: 'Fried Rice', type: 'veg' },
    { name: 'Paneer Fried Rice (Full)', price: 140, category: 'Fried Rice', type: 'veg' },
    { name: 'Mix Veg Fried Rice', price: 120, category: 'Fried Rice', type: 'veg' },
    { name: 'Mix Veg Chopper Rice', price: 130, category: 'Fried Rice', type: 'veg' },
    { name: 'Schezwan Mix Veg Fried Rice', price: 150, category: 'Fried Rice', type: 'veg' },
    { name: 'Egg Fried Rice (Half)', price: 55, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Egg Fried Rice (Full)', price: 90, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Schezwan Egg Fried Rice (Half)', price: 65, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Schezwan Egg Fried Rice (Full)', price: 100, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Chicken Fried Rice (Half)', price: 60, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Chicken Fried Rice (Full)', price: 110, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Schezwan Chicken Fried Rice (Half)', price: 70, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Schezwan Chicken Fried Rice (Full)', price: 120, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Chicken Tripple Rice', price: 120, category: 'Fried Rice', type: 'non-veg' },
    { name: 'Chicken Chopper Rice', price: 130, category: 'Fried Rice', type: 'non-veg' },

    // Noodles
    { name: 'Veg Noodles (Half)', price: 50, category: 'Noodles', type: 'veg' },
    { name: 'Veg Noodles (Full)', price: 80, category: 'Noodles', type: 'veg' },
    { name: 'Veg Schezwan Noodles (Half)', price: 60, category: 'Noodles', type: 'veg' },
    { name: 'Veg Schezwan Noodles (Full)', price: 90, category: 'Noodles', type: 'veg' },
    { name: 'Paneer Noodles (Half)', price: 80, category: 'Noodles', type: 'veg' },
    { name: 'Paneer Noodles (Full)', price: 140, category: 'Noodles', type: 'veg' },
    { name: 'Paneer Schezwan Noodles (Half)', price: 90, category: 'Noodles', type: 'veg' },
    { name: 'Paneer Schezwan Noodles (Full)', price: 150, category: 'Noodles', type: 'veg' },
    { name: 'Egg Noodles (Half)', price: 55, category: 'Noodles', type: 'non-veg' },
    { name: 'Egg Noodles (Full)', price: 90, category: 'Noodles', type: 'non-veg' },
    { name: 'Chicken Noodles (Half)', price: 60, category: 'Noodles', type: 'non-veg' },
    { name: 'Chicken Noodles (Full)', price: 110, category: 'Noodles', type: 'non-veg' },
    { name: 'Chicken Schezwan Noodles (Half)', price: 70, category: 'Noodles', type: 'non-veg' },
    { name: 'Chicken Schezwan Noodles (Full)', price: 120, category: 'Noodles', type: 'non-veg' },
    { name: 'Chicken Tripple Noodles', price: 120, category: 'Noodles', type: 'non-veg' },

    // Meals
    { name: 'Veg Meals', price: 50, category: 'Meals', type: 'veg' },

    // Biriyani
    { name: 'Chicken Dum Biriyani (Half)', price: 80, category: 'Biriyani', type: 'non-veg' },
    { name: 'Chicken Dum Biriyani (Full)', price: 140, category: 'Biriyani', type: 'non-veg' },
    { name: 'Kushka Rice (Biriyani Rice)', price: 60, category: 'Biriyani', type: 'non-veg' },
];

async function updateMenu() {
    console.log(`Updating menu for restaurant: ${restaurantId}`);

    // 1. Delete existing items
    const itemsRef = db.collection('restaurants').doc(restaurantId).collection('menu_items');
    const itemsSnapshot = await itemsRef.get();
    const deletePromises = itemsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    console.log(`Deleted ${itemsSnapshot.size} existing items.`);

    // 2. Delete existing categories
    const catsRef = db.collection('restaurants').doc(restaurantId).collection('categories');
    const catsSnapshot = await catsRef.get();
    const deleteCatsPromises = catsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteCatsPromises);
    console.log(`Deleted ${catsSnapshot.size} existing categories.`);

    // 3. Create unique categories
    const categoryNames = [...new Set(menuData.map(item => item.category))];
    const categoryMap = {};

    for (let i = 0; i < categoryNames.length; i++) {
        const name = categoryNames[i];
        const catDoc = await catsRef.add({
            name: name,
            display_order: i + 1
        });
        categoryMap[name] = catDoc.id;
        console.log(`Created category: ${name} (ID: ${catDoc.id})`);
    }

    // 4. Add menu items
    let addedCount = 0;
    for (const item of menuData) {
        await itemsRef.add({
            name: item.name,
            price: item.price,
            category_id: categoryMap[item.category],
            category_name: item.category, // added for denormalization
            type: item.type,
            available: true,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        addedCount++;
    }
    console.log(`Added ${addedCount} menu items.`);
    console.log('Update complete!');
}

updateMenu().catch(err => {
    console.error('Update failed:', err);
    process.exit(1);
});
