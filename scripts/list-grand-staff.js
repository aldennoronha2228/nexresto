const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
};

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function main() {
  const db = admin.firestore();
  const restaurantId = 'the-grand-mmk89g5w';
  const snap = await db.collection(`restaurants/${restaurantId}/staff`).get();
  console.log(`staff count: ${snap.size}`);
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    console.log(doc.id, '=>', d.email || '(no email)', '| role:', d.role || '(none)', '| active:', d.is_active !== false);
  }
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
