require('dotenv').config();
console.log('--- Environment Variables ---');
console.log('NEXT_PUBLIC_FIREBASE_PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('SUPER_ADMIN_EMAIL:', process.env.SUPER_ADMIN_EMAIL);
console.log('--- Process Env ---');
console.log('PROJECT_ID in process:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
