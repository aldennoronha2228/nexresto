const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''),
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function checkEmails() {
    const emails = [
        'aldennoronha2228@gmail.com',
        'aldenengineeringentranceexam@gmail.com',
        'admin@restaurant.com'
    ];

    for (const email of emails) {
        try {
            const user = await admin.auth().getUserByEmail(email);
            console.log(`Found user: ${email} (UID: ${user.uid}) - Claims:`, user.customClaims);
        } catch (e) {
            console.log(`User NOT found: ${email}`);
        }
    }
    process.exit(0);
}

checkEmails();
