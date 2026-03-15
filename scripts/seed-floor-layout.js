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

const restaurantId = process.argv[2] || 'the-grand-mmk89g5w';

const tables = [
  { id: 'T-01', name: 'Table 1', seats: 2, x: 50, y: 50, status: 'available' },
  { id: 'T-02', name: 'Table 2', seats: 4, x: 200, y: 50, status: 'available' },
  { id: 'T-03', name: 'Table 3', seats: 2, x: 350, y: 50, status: 'available' },
  { id: 'T-04', name: 'Table 4', seats: 6, x: 500, y: 50, status: 'available' },
  { id: 'T-05', name: 'Table 5', seats: 4, x: 50, y: 200, status: 'busy' },
  { id: 'T-06', name: 'Table 6', seats: 2, x: 200, y: 200, status: 'available' },
  { id: 'T-07', name: 'Table 7', seats: 4, x: 350, y: 200, status: 'available' },
  { id: 'T-08', name: 'Table 8', seats: 2, x: 500, y: 200, status: 'busy' },
  { id: 'T-09', name: 'Table 9', seats: 8, x: 50, y: 350, status: 'available' },
  { id: 'T-10', name: 'Table 10', seats: 4, x: 250, y: 350, status: 'available' },
  { id: 'T-11', name: 'Table 11', seats: 6, x: 450, y: 350, status: 'reserved' },
  { id: 'T-12', name: 'Table 12', seats: 2, x: 70, y: 260, status: 'busy' },
  { id: 'T-13', name: 'Table 13', seats: 4, x: 170, y: 260, status: 'available' },
  { id: 'T-14', name: 'Table 14', seats: 2, x: 270, y: 260, status: 'available' },
  { id: 'T-15', name: 'Table 15', seats: 6, x: 20, y: 440, status: 'reserved' },
  { id: 'T-16', name: 'Table 16', seats: 4, x: 150, y: 440, status: 'available' },
  { id: 'T-17', name: 'Table 17', seats: 2, x: 270, y: 440, status: 'available' },
  { id: 'T-18', name: 'Table 18', seats: 3, x: 370, y: 440, status: 'busy' },
];

async function main() {
  const db = admin.firestore();
  const floorLayoutRef = db.doc(`restaurants/${restaurantId}/settings/floor_layout`);
  await floorLayoutRef.set(
    {
      tables,
      walls: [],
      desks: [],
      floorPlans: [{ id: '1', name: 'Default Layout', tables, walls: [], desks: [] }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'seed-floor-layout',
    },
    { merge: true }
  );

  console.log(`Seeded ${restaurantId} floor layout with ${tables.length} tables.`);
}

main().catch((err) => {
  console.error('Failed to seed floor layout:', err.message);
  process.exit(1);
});
