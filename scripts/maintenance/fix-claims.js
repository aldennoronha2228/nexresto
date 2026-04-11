
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

async function checkSuperAdmin() {
    const email = process.env.SUPER_ADMIN_EMAIL;
    console.log(`Checking claims for: ${email}`);
    try {
        const user = await admin.auth().getUserByEmail(email);
        console.log(`UID: ${user.uid}`);
        console.log(`Custom Claims:`, JSON.stringify(user.customClaims, null, 2));

        if (!user.customClaims || user.customClaims.role !== 'super_admin') {
            console.log("FIXING MISSING CLAIM...");
            await admin.auth().setCustomUserClaims(user.uid, { role: 'super_admin' });
            console.log("Claim set to super_admin");
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkSuperAdmin();
