const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''),
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function checkFirestore() {
    try {
        const db = admin.firestore();
        const collections = await db.listCollections();
        console.log('Successfully connected to Firestore!');
        console.log(`Found ${collections.length} collections.`);
        process.exit(0);
    } catch (error) {
        console.error('Firestore error details:', error.message);
        if (error.code === 5) {
            console.error('Database NOT FOUND. Please ensure Firestore is enabled and a database named (default) exists.');
        }
        process.exit(1);
    }
}

checkFirestore();
