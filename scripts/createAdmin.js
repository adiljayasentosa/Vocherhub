// Creates (or updates) the users/{uid} Firestore doc that grants app
// access + a role to an EXISTING Firebase Auth account. This script does
// not create the Auth account itself — create that first in the Firebase
// Console (Authentication > Users > Add user) or via Firebase's own
// sign-up flow, then run this with the UID it generates.
//
// Usage:
//   node scripts/createAdmin.js <uid> <email> <name> [role]
//   role defaults to "admin". Use "operator" for operator accounts.

const { db, admin } = require('../config/firebase-admin');

async function main() {
  const [uid, email, name, role = 'admin'] = process.argv.slice(2);

  if (!uid || !email || !name) {
    console.error('Usage: node scripts/createAdmin.js <uid> <email> <name> [role]');
    process.exit(1);
  }
  if (!['admin', 'operator'].includes(role)) {
    console.error('role must be "admin" or "operator"');
    process.exit(1);
  }

  await db.collection('users').doc(uid).set({
    email,
    name,
    role,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLoginAt: null,
  }, { merge: true });

  console.log(`users/${uid} created/updated with role "${role}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
