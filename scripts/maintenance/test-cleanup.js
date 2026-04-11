const { adminAuth } = require('./lib/firebase-admin');

async function createDummyAdmin() {
    try {
        const user = await adminAuth.createUser({
            email: 'dummy_admin@example.com',
            password: 'Password123!',
            displayName: 'Stale Admin',
        });
        await adminAuth.setCustomUserClaims(user.uid, { role: 'super_admin' });
        console.log('Created dummy super admin:', user.email);
    } catch (err) {
        console.error('Error creating dummy:', err.message);
    }
}

createDummyAdmin();
