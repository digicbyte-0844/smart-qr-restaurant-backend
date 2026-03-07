require('dotenv').config();
const admin = require('firebase-admin');

try {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    };

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();

    async function run() {
        console.log('Fetching items to fix...');
        const snapshot = await db.collection('menu').get();

        let updateCount = 0;

        // Group categories correctly
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const name = data.name.toLowerCase();
            let updates = {};

            // 1. Fix "Curries" -> proper subcategories
            if (data.category === 'Curries') {
                if (name === 'egg curry') {
                    updates.category = 'Curries - Egg';
                } else if (name === 'prawns curry' || name === 'fish curry boneless') {
                    updates.category = 'Curries - Fish/Prawns'; // Match the image perfectly
                }
            }

            // Fix existing ones that got saved as "Curries - Fish & Prawns"
            if (data.category === 'Curries - Fish & Prawns') {
                updates.category = 'Curries - Fish/Prawns';
            }

            // 2. Fix Breads naming
            if (name === '2 roti') {
                updates.name = 'Roti - 2 Pcs';
            } else if (name === '2 butter naan') {
                updates.name = 'Butter Naan - 2 Pcs';
            } else if (name === ' roti-2 pcs') {
                // delete it if it accidentally got created, we will just rename the original
                await db.collection('menu').doc(doc.id).delete();
                console.log(`Deleted mistaken entry: ${data.name}`);
                continue;
            } else if (name === ' butter naan-2 pcs') {
                await db.collection('menu').doc(doc.id).delete();
                console.log(`Deleted mistaken entry: ${data.name}`);
                continue;
            }

            if (Object.keys(updates).length > 0) {
                console.log(`Updating ${data.name} ->`, updates);
                await db.collection('menu').doc(doc.id).update(updates);
                updateCount++;
            }
        }

        console.log(`Fixed ${updateCount} items successfully.`);
    }

    run().catch(console.error);
} catch (e) {
    console.error(e);
}
