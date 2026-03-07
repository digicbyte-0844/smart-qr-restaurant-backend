require('dotenv').config();
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle newline characters in the private key
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
});

const db = admin.firestore();

async function checkMenu() {
    const menuSnapshot = await db.collection('menu').get();
    const existingItems = [];
    menuSnapshot.forEach(doc => {
        existingItems.push(doc.data().name.toLowerCase());
    });

    console.log("Existing items:");
    console.log(existingItems);
}

checkMenu().catch(console.error);
