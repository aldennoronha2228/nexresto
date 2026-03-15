const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, ''),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function run() {
  const restaurantId = process.argv[2] || process.env.NEXT_PUBLIC_RESTAURANT_ID;
  if (!restaurantId) {
    throw new Error('Missing restaurant id');
  }

  const snap = await admin.firestore().doc(`restaurants/${restaurantId}`).get();
  if (!snap.exists) {
    throw new Error(`Restaurant not found: ${restaurantId}`);
  }

  const d = snap.data() || {};
  console.log(JSON.stringify({
    id: snap.id,
    name: d.name || null,
    subscription_tier: d.subscription_tier || null,
    subscription_status: d.subscription_status || null,
    subscription_start_date: d.subscription_start_date || null,
    subscription_end_date: d.subscription_end_date || null,
  }, null, 2));
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
