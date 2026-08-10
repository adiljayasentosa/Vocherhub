// Initializes the Firebase Admin SDK exactly once and exports the
// Auth + Firestore handles the rest of the app uses.
// Credentials come from env.js — never hardcode a service account here.

const admin = require('firebase-admin');
const env = require('./env');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebaseAdmin.projectId,
      clientEmail: env.firebaseAdmin.clientEmail,
      privateKey: env.firebaseAdmin.privateKey,
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
