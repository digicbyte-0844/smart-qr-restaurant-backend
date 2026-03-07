import { Module } from '@nestjs/common';
import * as admin from 'firebase-admin';

// Load environment variables
require('dotenv').config();

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

// Initialize Firebase Admin SDK (once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseAdminConfig),
    projectId: firebaseAdminConfig.projectId,
  });
}

const firestore = admin.firestore();

@Module({
  providers: [
    {
      provide: 'FIRESTORE',
      useValue: firestore,
    },
  ],
  exports: ['FIRESTORE'],
})
export class FirebaseModule { }
