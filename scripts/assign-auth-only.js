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

const email = 'aldenengineeringentranceexam@gmail.com';

async function assignOnlyAuth() {
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { role: 'super_admin' });
        console.log(`Successfully assigned super_admin role to AUTH: ${email}`);
        process.exit(0);
    } catch (error) {
        console.error('Auth error:', error.message);
        process.exit(1);
    }
}

assignOnlyAuth();
