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
        log += 'Fetching existing menu items...\n';
        const snapshot = await db.collection('menu').get();

        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Help function to view items grouped by name to find duplicates
        const nameMap = new Map();
        items.forEach(item => {
            const normalizedName = item.name.trim().toLowerCase();
            if (!nameMap.has(normalizedName)) {
                nameMap.set(normalizedName, []);
            }
            nameMap.get(normalizedName).push(item);
        });

        log += `Total items: ${items.length}\n`;
        log += `Unique names: ${nameMap.size}\n\n`;

        let deleteOperations = [];
        let updateOperations = [];

        // Analyze duplicates and clean strings
        for (const [name, duplicates] of nameMap.entries()) {
            if (duplicates.length > 1) {
                log += `Duplicate found: "${name}" (${duplicates.length} instances)\n`;
                // Keep the one that looks most complete (has image, or oldest)
                // Just sort by ID as a fallback, keeping the first one.
                const [keep, ...removeList] = duplicates;

                for (const toRemove of removeList) {
                    log += `  -> Deleting duplicate ID: ${toRemove.id}\n`;
                    deleteOperations.push(toRemove.id);
                }
            }

            const keptItem = duplicates[0];

            // Also look for "2 Roti" vs "Roti-2 Pcs" type soft duplicates manually

            // Formatting fix: Capitalize properly, trim spaces
            const formattedName = keptItem.name
                .trim()
                .replace(/\s+/g, ' ') // remove double spaces
                .replace(/(^\w|\s\w)/g, m => m.toUpperCase()); // Title Case

            if (keptItem.name !== formattedName) {
                log += `  -> Formatting name: "${keptItem.name}" -> "${formattedName}"\n`;
                updateOperations.push({ id: keptItem.id, updates: { name: formattedName } });
            }
        }

        // Special case handling for "2 Roti" and "2 Butter Naan"
        const oldRoti = items.find(i => i.name.toLowerCase() === '2 roti');
        const newRoti = items.find(i => i.name.toLowerCase() === 'roti-2 pcs' || i.name.toLowerCase() === ' roti-2 pcs');
        if (oldRoti && newRoti) {
            log += `  -> Deleting redundant "2 Roti" ID: ${oldRoti.id}\n`;
            if (!deleteOperations.includes(oldRoti.id)) deleteOperations.push(oldRoti.id);
        }

        const oldNaan = items.find(i => i.name.toLowerCase() === '2 butter naan');
        const newNaan = items.find(i => i.name.toLowerCase() === 'butter naan-2 pcs' || i.name.toLowerCase() === ' butter naan-2 pcs');
        if (oldNaan && newNaan) {
            log += `  -> Deleting redundant "2 Butter Naan" ID: ${oldNaan.id}\n`;
            if (!deleteOperations.includes(oldNaan.id)) deleteOperations.push(oldNaan.id);
        }

        for (const id of deleteOperations) {
            await db.collection('menu').doc(id).delete();
        }
        log += `Deleted ${deleteOperations.length} items.\n`;

        for (const op of updateOperations) {
            // Don't update if it's already being deleted
            if (!deleteOperations.includes(op.id)) {
                await db.collection('menu').doc(op.id).update(op.updates);
            }
        }
        log += `Formatted ${updateOperations.length} items.\n`;

        fs.writeFileSync('cleanup-output.txt', log);
    }

    run().catch(e => {
        fs.writeFileSync('cleanup-output.txt', 'Error: ' + e.message + '\n' + e.stack);
    });
} catch (e) {
    fs.writeFileSync('cleanup-output.txt', 'Sync Error: ' + e.message + '\n' + e.stack);
}
