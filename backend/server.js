const express = require('express');
const cors = require('cors');
require('dotenv').config();

const {
  createReviewForPlace,
  createSpotSuggestion,
  ensureDemoUser,
  getUserByCredentials,
  isFirebaseConfigured,
  listRecentSuggestions,
  listReviewsForPlace,
} = require('./storage');

const app = express();
const PORT = process.env.PORT || 4000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_NEARBY_RADIUS_METERS = Number(process.env.GOOGLE_NEARBY_RADIUS_METERS || 3500);
const GOOGLE_NEARBY_LIMIT = Number(process.env.GOOGLE_NEARBY_LIMIT || 20);
const MAX_RESULTS_DISTANCE_KM = Number(process.env.MAX_RESULTS_DISTANCE_KM || 20);

app.use(cors());
app.use(express.json());

function inferPlaceType(place) {
  const types = place.types || [];

  if (types.includes('library')) {
    return 'Library';
  }

  if (types.includes('cafe')) {
    return 'Cafe';
  }

  if (types.includes('lodging') || /hostel/i.test(place.name || '')) {
    return 'Hostel';
  }

  if (types.includes('university') || /campus|study room|student center/i.test(place.name || '')) {
    return 'Campus Room';
  }

  if (place.name && /cowork|co-working|shared office/i.test(place.name)) {
    return 'Coworking';
  }

  if (types.includes('establishment') || types.includes('point_of_interest')) {
    return 'Coworking';
  }

  return 'Cafe';
}

function hashString(input) {
  let hash = 0;

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 100000;
  }

  return hash;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInKm(aLat, aLng, bLat, bLng) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);

  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(aLat)) *
      Math.cos(toRadians(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  return earthRadiusKm * c;
}

function getRushScore(type, placeId, hour, reviewsCount, isOpenNow) {
  const baseScoreByType = {
    Cafe: 55,
    Library: 34,
    Coworking: 47,
  };

  const lunchPeak = hour >= 12 && hour <= 15 ? 20 : 0;
  const eveningPeak = hour >= 18 && hour <= 21 ? 16 : 0;
  const morningCalm = hour >= 7 && hour <= 10 ? -8 : 0;
  const lateNightCalm = hour >= 22 || hour <= 5 ? -12 : 0;
  const popularityLoad = Math.min(24, Math.round(Math.log1p(reviewsCount || 0) * 4));
  const openNowBoost = isOpenNow ? 8 : 0;
  const placeNoise = (hashString(placeId) % 14) - 6;

  const score =
    baseScoreByType[type] +
    lunchPeak +
    eveningPeak +
    morningCalm +
    lateNightCalm +
    popularityLoad +
    openNowBoost +
    placeNoise;

  return Math.max(8, Math.min(96, score));
}

function getCrowdLabel(score) {
  if (score <= 40) {
    return 'Low Rush';
  }

  if (score <= 65) {
    return 'Medium Rush';
  }

  return 'Busy';
}

function getNoiseLevel(score) {
  if (score <= 35) {
    return 'Very Quiet';
  }

  if (score <= 62) {
    return 'Moderate';
  }

  return 'Noisy';
}

function getLiveCrowd(score) {
  if (score <= 35) {
    return 'Low Crowd';
  }

  if (score <= 62) {
    return 'Moderate Crowd';
  }

  return 'High Crowd';
}

function getBestTimeToVisit(type) {
  if (type === 'Library' || type === 'Campus Room') {
    return 'Best time: 8:00 AM - 11:00 AM';
  }

  if (type === 'Cafe') {
    return 'Best time: 9:30 AM - 12:00 PM';
  }

  if (type === 'Hostel') {
    return 'Best time: 2:00 PM - 5:00 PM';
  }

  return 'Best time: 10:00 AM - 1:00 PM';
}

function getAllowedCategories(raw) {
  const all = ['Cafe', 'Library', 'Campus Room', 'Hostel', 'Coworking'];

  if (!raw) {
    return all;
  }

  const cleaned = String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const allowed = all.filter((category) => cleaned.includes(category));
  return allowed.length > 0 ? allowed : all;
}

function buildCategoryQueries(baseLocation, categories) {
  const queries = [];

  if (categories.includes('Cafe')) {
    queries.push(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${baseLocation}&radius=${GOOGLE_NEARBY_RADIUS_METERS}&type=cafe&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  if (categories.includes('Library')) {
    queries.push(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${baseLocation}&radius=${GOOGLE_NEARBY_RADIUS_METERS}&type=library&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  if (categories.includes('Campus Room')) {
    queries.push(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${baseLocation}&radius=${GOOGLE_NEARBY_RADIUS_METERS}&keyword=campus%20study%20room&type=university&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  if (categories.includes('Hostel')) {
    queries.push(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${baseLocation}&radius=${GOOGLE_NEARBY_RADIUS_METERS}&type=lodging&keyword=hostel&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  if (categories.includes('Coworking')) {
    queries.push(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${baseLocation}&radius=${GOOGLE_NEARBY_RADIUS_METERS}&keyword=coworking%20space&type=point_of_interest&key=${GOOGLE_MAPS_API_KEY}`
    );
  }

  return queries;
}

function summarizeRating(placeId, googleRating, googleRatingsCount) {
  return {
    rating: Number((googleRating || 0).toFixed(1)),
    reviewsCount: Number(googleRatingsCount || 0),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mapsConfigured: Boolean(GOOGLE_MAPS_API_KEY),
    firestoreConfigured: isFirebaseConfigured(),
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const found = await getUserByCredentials(email, password);

    if (!found) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.json({
      token: 'quiet-hour-demo-token',
      user: {
        name: found.name,
        email: found.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: `Login failed: ${error.message}`,
    });
  }
});

app.get('/api/places/quiet-nearby', (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({
      message:
        'Google Maps API key missing. Add GOOGLE_MAPS_API_KEY in backend/.env and restart backend.',
    });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const q = String(req.query.q || '').trim().toLowerCase();
  const categories = getAllowedCategories(req.query.categories);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: 'lat and lng query params are required.' });
  }

  const hour = new Date().getHours();
  const baseLocation = `${lat},${lng}`;
  const queryUrls = buildCategoryQueries(baseLocation, categories);

  if (queryUrls.length === 0) {
    return res.json({ places: [] });
  }

  return Promise.all(queryUrls.map((url) => fetch(url).then((response) => response.json())))
    .then((responses) => {
      const badResponse = responses.find((item) => item.status && item.status !== 'OK' && item.status !== 'ZERO_RESULTS');

      if (badResponse) {
        return res.status(502).json({
          message: `Google Places API error: ${badResponse.status}${
            badResponse.error_message ? ` - ${badResponse.error_message}` : ''
          }`,
        });
      }

      const uniqueById = new Map();

      responses.forEach((payload) => {
        (payload.results || []).forEach((place) => {
          if (place && place.place_id && !uniqueById.has(place.place_id)) {
            uniqueById.set(place.place_id, place);
          }
        });
      });

      const rankedCandidates = Array.from(uniqueById.values())
        .map((place) => {
          const placeType = inferPlaceType(place);
          const geometry = place.geometry?.location;

          if (!geometry || typeof geometry.lat !== 'number' || typeof geometry.lng !== 'number') {
            return null;
          }

          const rushScore = getRushScore(
            placeType,
            place.place_id,
            hour,
            place.user_ratings_total || 0,
            Boolean(place.opening_hours?.open_now)
          );

          const ratingSummary = summarizeRating(
            place.place_id,
            Number(place.rating || 0),
            Number(place.user_ratings_total || 0)
          );

          const calculatedDistanceKm = distanceInKm(lat, lng, geometry.lat, geometry.lng);

          return {
            id: place.place_id,
            name: place.name,
            type: placeType,
            distanceKm: calculatedDistanceKm,
            rushScore,
            crowdLabel: getCrowdLabel(rushScore),
            noiseLevel: getNoiseLevel(rushScore),
            liveCrowd: getLiveCrowd(rushScore),
            rating: ratingSummary.rating,
            reviewsCount: ratingSummary.reviewsCount,
            openNow: place.opening_hours?.open_now ?? null,
            bestTimeToVisit: getBestTimeToVisit(placeType),
            latitude: geometry.lat,
            longitude: geometry.lng,
            address: place.vicinity || place.formatted_address || 'Address not available',
          };
        })
        .filter(Boolean)
        .filter((place) => {
          if (!q) {
            return true;
          }

          return (
            place.name.toLowerCase().includes(q) ||
            place.type.toLowerCase().includes(q) ||
            place.address.toLowerCase().includes(q)
          );
        })
      const nearEnough = rankedCandidates.filter((place) => place.distanceKm <= MAX_RESULTS_DISTANCE_KM);
      const pool = nearEnough.length > 0 ? nearEnough : rankedCandidates;

      const ranked = pool
        .sort((a, b) => {
          if (a.distanceKm !== b.distanceKm) {
            return a.distanceKm - b.distanceKm;
          }

          if (a.rushScore !== b.rushScore) {
            return a.rushScore - b.rushScore;
          }

          return a.distanceKm - b.distanceKm;
        })
        .slice(0, GOOGLE_NEARBY_LIMIT);

      return res.json({ places: ranked });
    })
    .catch((error) => {
      return res.status(500).json({
        message: `Failed to fetch nearby places: ${error.message}`,
      });
    });
});

app.get('/api/places/:placeId/reviews', async (req, res) => {
  try {
    const placeId = req.params.placeId;
    const reviews = await listReviewsForPlace(placeId);
    return res.json({ reviews });
  } catch (error) {
    return res.status(500).json({
      message: `Could not fetch reviews: ${error.message}`,
    });
  }
});

app.post('/api/places/:placeId/reviews', async (req, res) => {
  try {
    const placeId = req.params.placeId;
    const { userName, rating, comment } = req.body;

    if (!userName || typeof userName !== 'string') {
      return res.status(400).json({ message: 'userName is required.' });
    }

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({ message: 'rating must be between 1 and 5.' });
    }

    await createReviewForPlace(placeId, { userName, rating, comment });

    return res.status(201).json({ message: 'Review added successfully.' });
  } catch (error) {
    return res.status(500).json({
      message: `Could not save review: ${error.message}`,
    });
  }
});

app.post('/api/spots/suggest', async (req, res) => {
  try {
    const { name, type, address, notes } = req.body;

    if (!name || !type || !address) {
      return res.status(400).json({ message: 'name, type, and address are required.' });
    }

    await createSpotSuggestion({ name, type, address, notes });

    return res.status(201).json({ message: 'Suggestion submitted. Pending admin approval.' });
  } catch (error) {
    return res.status(500).json({
      message: `Could not save suggestion: ${error.message}`,
    });
  }
});

app.get('/api/spots/new', async (_req, res) => {
  try {
    const items = await listRecentSuggestions(10);
    return res.json({
      count: items.length,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      message: `Could not load suggestions: ${error.message}`,
    });
  }
});

app.listen(PORT, async () => {

  await ensureDemoUser().catch((error) => {
    console.warn(`Firebase seed skipped: ${error.message}`);
  });

  console.log(`Quiet Hour backend running on port ${PORT}`);
});
