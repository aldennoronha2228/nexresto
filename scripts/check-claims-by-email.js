const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/check-claims-by-email.js <email>');
  process.exit(1);
}

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
};

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function main() {
  const user = await admin.auth().getUserByEmail(email);
  console.log('email:', user.email);
  console.log('uid:', user.uid);
  console.log('claims:', JSON.stringify(user.customClaims || {}, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
