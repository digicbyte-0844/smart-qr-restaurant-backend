require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

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
        let log = '';
        const snapshot = await db.collection('menu').get();

        // Group by category to make it easier to read
        const categories = new Map();

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const cat = data.category || 'Uncategorized';
            if (!categories.has(cat)) categories.set(cat, []);
            categories.get(cat).push({ id: doc.id, name: data.name, price: data.sizes?.[0]?.price });
        });

        for (const [cat, items] of categories.entries()) {
            log += `\n--- ${cat} ---\n`;
            items.forEach(item => {
                log += `${item.id}: "${item.name}" - ${item.price}\n`;
            });
        }

        fs.writeFileSync('cleanup-output.txt', log);
    }

    run().catch(e => {
        fs.writeFileSync('cleanup-output.txt', 'Error: ' + e.message + '\n' + e.stack);
    });
} catch (e) {
    fs.writeFileSync('cleanup-output.txt', 'Sync Error: ' + e.message + '\n' + e.stack);
}
