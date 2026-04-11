
const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
    }),
});

const db = admin.firestore();

async function check() {
    console.log("Checking Firestore Collections...");
    const snap = await db.collection('restaurants').get();
    console.log(`Total Restaurants found: ${snap.size}`);

    for (const doc of snap.docs) {
        console.log(`\nRestaurant [${doc.id}]:`, JSON.stringify(doc.data(), null, 2));

        const menuItems = await doc.ref.collection('menu_items').get();
        console.log(` - Menu Items: ${menuItems.size}`);

        const categories = await doc.ref.collection('categories').get();
        console.log(` - Categories: ${categories.size}`);

        const staff = await doc.ref.collection('staff').get();
        console.log(` - Staff: ${staff.size}`);
    }
}

check();
