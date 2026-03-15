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

async function listUsers() {
    try {
        console.log('Fetching users...');
        let nextPageToken;
        let totalUsers = 0;
        console.log('--- Current Users in Project ---');
        do {
            const listUsersResult = await admin.auth().listUsers(100, nextPageToken);
            console.log(`Fetched ${listUsersResult.users.length} users in batch.`);
            listUsersResult.users.forEach((user) => {
                console.log(`${user.email} (UID: ${user.uid}) - Claims:`, user.customClaims);
                totalUsers++;
            });
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        console.log(`--- Total Users: ${totalUsers} ---`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

listUsers();
