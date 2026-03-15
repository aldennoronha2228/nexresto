const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Ensure private key handles newlines correctly
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    console.error('Error: Firebase environment variables are missing.');
    process.exit(1);
}

// Initialize Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const email = process.env.SUPER_ADMIN_EMAIL;

if (!email) {
    console.error('Error: SUPER_ADMIN_EMAIL is not set in the .env file.');
    process.exit(1);
}

async function assignSuperAdmin() {
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { role: 'super_admin' });
        console.log(`Successfully assigned super_admin role to: ${email}`);

        // Also ensure the profile exists in Firestore
        const db = admin.firestore();
        const profileRef = db.collection('admin_profiles').doc(user.uid);
        await profileRef.set({
            email: email,
            role: 'super_admin',
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`Firestore profile updated for: ${email}`);
        process.exit(0);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`Error: User with email ${email} not found in Firebase Auth.`);
            console.log('Please make sure you have created an account with this email first.');
        } else {
            console.error('An error occurred:', error.message);
        }
        process.exit(1);
    }
}

assignSuperAdmin();
