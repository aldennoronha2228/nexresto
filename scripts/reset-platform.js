const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    console.error('Error: Firebase environment variables are missing.');
    process.exit(1);
}

// Initialize Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
const db = admin.firestore();

async function deleteCollection(collectionPath, batchSize = 100) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, reject);
    });
}

async function deleteQueryBatch(query, resolve, reject) {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    // Recurse on the next process tick, to avoid blocking the event loop
    process.nextTick(() => {
        deleteQueryBatch(query, resolve, reject);
    });
}

async function deleteRestaurantRecursive(restaurantDoc) {
    const subCollections = ['orders', 'menu_items', 'staff', 'categories', 'settings', 'analytics'];
    for (const subCol of subCollections) {
        const subSnap = await restaurantDoc.ref.collection(subCol).get();
        if (subSnap.size > 0) {
            console.log(`  Deleting ${subSnap.size} docs from ${subCol} for restaurant ${restaurantDoc.id}...`);
            const batch = db.batch();
            subSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    }
    await restaurantDoc.ref.delete();
}

async function resetPlatform() {
    console.log('--- Starting Platform Reset ---');

    try {
        // 1. Delete all restaurants
        console.log('1. Deleting all restaurants...');
        const restaurantsSnap = await db.collection('restaurants').get();
        console.log(`Found ${restaurantsSnap.size} restaurants.`);

        for (const doc of restaurantsSnap.docs) {
            console.log(`Deleting restaurant: ${doc.id} (${doc.data().name || 'unnamed'})...`);
            await deleteRestaurantRecursive(doc);
        }
        console.log('All restaurants deleted.');

        // 2. Clear global logs
        console.log('2. Clearing global logs...');
        await deleteCollection('global_logs');
        console.log('Global logs cleared.');

        // 3. Clear pending signups
        console.log('3. Clearing pending signups...');
        await deleteCollection('pending_signups');
        console.log('Pending signups cleared.');

        // 4. Assign Super Admin
        if (superAdminEmail) {
            console.log(`4. Setting up Super Admin: ${superAdminEmail}...`);
            let user;
            try {
                user = await admin.auth().getUserByEmail(superAdminEmail);
                console.log('User found, updating claims...');
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    console.log('User not found, creating new account...');
                    if (!superAdminPassword) {
                        console.error('Error: Cannot create user because SUPER_ADMIN_PASSWORD is not set.');
                        process.exit(1);
                    }
                    user = await admin.auth().createUser({
                        email: superAdminEmail,
                        password: superAdminPassword,
                        emailVerified: true,
                        displayName: 'Super Admin',
                    });
                } else {
                    throw error;
                }
            }

            try {
                await admin.auth().setCustomUserClaims(user.uid, { role: 'super_admin' });

                // Clear all other admin profiles but keep/set this one
                const adminsSnap = await db.collection('admin_profiles').get();
                const batch = db.batch();
                adminsSnap.docs.forEach(doc => {
                    if (doc.id !== user.uid) batch.delete(doc.ref);
                });
                await batch.commit();

                await db.collection('admin_profiles').doc(user.uid).set({
                    email: superAdminEmail,
                    role: 'super_admin',
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                console.log(`Successfully assigned super_admin role to: ${superAdminEmail}`);

                // Update password if provided
                if (superAdminPassword) {
                    await admin.auth().updateUser(user.uid, { password: superAdminPassword });
                    console.log(`Password updated for: ${superAdminEmail}`);
                }

                // 5. Delete all other users from Firebase Auth
                console.log('5. Deleting all other users from Firebase Auth...');
                let nextPageToken;
                do {
                    const listUsersResult = await admin.auth().listUsers(100, nextPageToken);
                    for (const userRecord of listUsersResult.users) {
                        if (userRecord.email !== superAdminEmail) {
                            console.log(`Deleting user: ${userRecord.email} (${userRecord.uid})`);
                            await admin.auth().deleteUser(userRecord.uid);
                        }
                    }
                    nextPageToken = listUsersResult.pageToken;
                } while (nextPageToken);
            } catch (error) {
                console.error('Error setting up super admin:', error.message);
                process.exit(1);
            }
        }

        console.log('--- Platform Reset Complete ---');
        process.exit(0);
    } catch (error) {
        console.error('An error occurred during reset:', error.message);
        process.exit(1);
    }
}

resetPlatform();
