const admin = require('firebase-admin');

let firestoreInstance = null;

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function isFirebaseConfigured() {
  return Boolean(getFirebaseConfig());
}

function getDb() {
  const config = getFirebaseConfig();

  if (!config) {
    return null;
  }

  if (!firestoreInstance) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(config),
      });
    }

    firestoreInstance = admin.firestore();
  }

  return firestoreInstance;
}

module.exports = {
  admin,
  getDb,
  isFirebaseConfigured,
};