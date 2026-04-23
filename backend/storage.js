const { getDb, isFirebaseConfigured } = require('./firebase');

const demoUser = {
  id: 'u1',
  name: 'Areeba',
  email: 'student@quiethour.app',
  password: 'quiet123',
};

const memoryStore = {
  users: new Map([[demoUser.email.toLowerCase(), demoUser]]),
  reviewsByPlace: new Map(),
  suggestions: [],
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeReviewInput(payload) {
  return {
    userName: String(payload.userName || '').trim(),
    rating: Number(payload.rating),
    comment: String(payload.comment || '').trim(),
  };
}

async function ensureDemoUser() {
  if (!isFirebaseConfigured()) {
    return demoUser;
  }

  const db = getDb();
  const userRef = db.collection('users').doc(normalizeEmail(demoUser.email));
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    const now = new Date().toISOString();
    await userRef.set({
      ...demoUser,
      createdAt: now,
      updatedAt: now,
    });
  }

  return demoUser;
}

async function getUserByCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  if (isFirebaseConfigured()) {
    const db = getDb();
    const snapshot = await db.collection('users').doc(normalizedEmail).get();

    if (!snapshot.exists) {
      return null;
    }

    const user = snapshot.data();

    if (user.password !== password) {
      return null;
    }

    return {
      id: snapshot.id,
      ...user,
    };
  }

  const user = memoryStore.users.get(normalizedEmail);

  if (!user || user.password !== password) {
    return null;
  }

  return user;
}

async function listReviewsForPlace(placeId) {
  if (isFirebaseConfigured()) {
    const db = getDb();
    const snapshot = await db
      .collection('places')
      .doc(placeId)
      .collection('reviews')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data());
  }

  const reviews = memoryStore.reviewsByPlace.get(placeId) || [];
  return [...reviews].reverse();
}

async function createReviewForPlace(placeId, payload) {
  const reviewInput = normalizeReviewInput(payload);

  const review = {
    id: `${placeId}-${Date.now()}`,
    placeId,
    userName: reviewInput.userName,
    rating: reviewInput.rating,
    comment: reviewInput.comment,
    createdAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured()) {
    const db = getDb();
    await db.collection('places').doc(placeId).collection('reviews').doc(review.id).set(review);
    return review;
  }

  const existing = memoryStore.reviewsByPlace.get(placeId) || [];
  existing.push(review);
  memoryStore.reviewsByPlace.set(placeId, existing);
  return review;
}

async function createSpotSuggestion(payload) {
  const item = {
    id: `suggestion-${Date.now()}`,
    name: String(payload.name || '').trim(),
    type: String(payload.type || '').trim(),
    address: String(payload.address || '').trim(),
    notes: String(payload.notes || '').trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  if (isFirebaseConfigured()) {
    const db = getDb();
    await db.collection('spotSuggestions').doc(item.id).set(item);
    return item;
  }

  memoryStore.suggestions.push(item);
  return item;
}

async function listRecentSuggestions(limit = 10) {
  if (isFirebaseConfigured()) {
    const db = getDb();
    const snapshot = await db.collection('spotSuggestions').orderBy('createdAt', 'desc').limit(limit).get();

    return snapshot.docs.map((doc) => doc.data());
  }

  return [...memoryStore.suggestions].reverse().slice(0, limit);
}

module.exports = {
  createReviewForPlace,
  createSpotSuggestion,
  ensureDemoUser,
  getUserByCredentials,
  isFirebaseConfigured,
  listRecentSuggestions,
  listReviewsForPlace,
};