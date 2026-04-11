const admin = require('firebase-admin');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing required env vars: NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    process.exit(1);
}

const serviceAccount = {
    projectId,
    clientEmail,
    privateKey,
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Since the user created a database named "restaurant" instead of "(default)"
try {
    const db = admin.firestore();

    // We can initialize it either with `getFirestore()` if we set it as default config, or maybe:
    const dbNamed = admin.firestore()._settings({ databaseId: 'restaurant' }) || new admin.firestore.Firestore({ databaseId: 'restaurant', projectId });

    dbNamed.collection('test').doc('test').set({ hello: 'world' })
        .then(() => {
            console.log('SUCCESS USING DB: restaurant');
            process.exit(0);
        })
        .catch((e) => {
            console.error('ERROR (restaurant DB):', e.message);
            process.exit(1);
        });
} catch (e) {
    console.error("SDK error:", e.message);
}