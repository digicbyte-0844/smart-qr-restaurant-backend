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

    const targetItems = [
        { name: ' Roti-2 Pcs', category: 'Indian Breads', price: 29.00 },
        { name: ' Butter Naan-2 Pcs', category: 'Indian Breads', price: 29.00 },

        { name: 'Water Bottle', category: 'Beverages', price: 20.00 },
        { name: 'Cool Drink', category: 'Beverages', price: 20.00 }
    ];

    async function run() {
        let log = '';
        log += 'Fetching existing menu items...\n';
        const snapshot = await db.collection('menu').get();
        const existingNames = snapshot.docs.map(doc => doc.data().name.toLowerCase());

        log += `Found ${existingNames.length} items in DB.\n`;

        let addedCount = 0;
        for (const item of targetItems) {
            if (!existingNames.includes(item.name.toLowerCase())) {
                log += `Adding missing item: ${item.name} (${item.category})\n`;
                const newDoc = {
                    name: item.name,
                    category: item.category,
                    description: '',
                    imageUrl: '',
                    available: true,
                    sizes: [
                        { label: 'Regular', price: item.price, enabled: true }
                    ],
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('menu').add(newDoc);
                addedCount++;
            } else {
                log += `Item already exists: ${item.name}\n`;
            }
        }

        log += `\nOperation complete. Added ${addedCount} missing items.\n`;
        fs.writeFileSync('output.txt', log);
    }

    run().catch(e => {
        fs.writeFileSync('output.txt', 'Error: ' + e.message + '\n' + e.stack);
    });
} catch (e) {
    fs.writeFileSync('output.txt', 'Sync Error: ' + e.message + '\n' + e.stack);
}
