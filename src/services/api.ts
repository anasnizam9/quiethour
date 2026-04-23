import { LoginResponse, NewSpotSuggestion, Place, PlaceReview, PlaceType } from '../types';
import Constants from 'expo-constants';

const DEMO_EMAIL = 'student@quiethour.app';
const DEMO_PASSWORD = 'quiet123';
const DEMO_USER_NAME = 'Areeba';

const offlineReviewsByPlace = new Map<string, PlaceReview[]>();
const offlineSuggestions: NewSpotSuggestion[] = [];

function getApiBaseUrl(): string {
  const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const extraBaseUrl =
    (typeof Constants.expoConfig?.extra?.apiBaseUrl === 'string'
      ? Constants.expoConfig?.extra?.apiBaseUrl
      : '')?.trim() || '';

  if (envBaseUrl) {
    if (envBaseUrl.includes('your-backend-domain.com')) {
      throw new Error(
        'API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL to your backend URL and rebuild APK.'
      );
    }

    return envBaseUrl;
  }

  if (extraBaseUrl) {
    if (extraBaseUrl.includes('your-backend-domain.com')) {
      throw new Error(
        'API base URL is not configured. Set expo.extra.apiBaseUrl (or EXPO_PUBLIC_API_BASE_URL) to your backend URL and rebuild APK.'
      );
    }

    return extraBaseUrl;
  }

  if (isInstalledBuild) {
    throw new Error('API base URL is missing in installed build. Configure EXPO_PUBLIC_API_BASE_URL and rebuild APK.');
  }

  const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  const host = debuggerHost ?? 'localhost';
  return `http://${host}:4000`;
}

const FETCH_TIMEOUT_MS = 7000;
const isInstalledBuild = Constants.executionEnvironment === 'standalone';

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return r * (2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}

function getOfflineLogin(email: string, password: string): LoginResponse | null {
  if (normalizeEmail(email) !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return null;
  }

  return {
    token: 'quiet-hour-offline-token',
    user: {
      name: DEMO_USER_NAME,
      email: DEMO_EMAIL,
    },
  };
}

async function safeJson<T>(response: Response, context: string): Promise<T> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as T;
  } catch {
    const preview = raw.slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`${context} returned non-JSON response: ${preview || '<empty response>'}`);
  }
}

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return Promise.race([
    promise,
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout: backend server not responding. Make sure backend is running with: npm run start:backend')), ms)
    ),
  ]);
}

function getFriendlyApiError(err: unknown, featureName: string): Error {
  const rawMessage = err instanceof Error ? err.message : 'Unknown network error';

  if (/network request failed/i.test(rawMessage) && isInstalledBuild) {
    return new Error(
      `${featureName} failed: installed APK cannot reach backend URL. Set EXPO_PUBLIC_API_BASE_URL to a public HTTPS backend, rebuild APK, and reinstall.`
    );
  }

  return new Error(rawMessage);
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  const offline = getOfflineLogin(email, password);

  if (offline) {
    return offline;
  }

  try {
    const apiUrl = getApiBaseUrl();
    const response = await withTimeout(
      fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      }),
      FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const payload = (await safeJson<{ message?: string }>(
        response,
        'Login API'
      ).catch(() => null)) as { message?: string } | null;

      throw new Error(payload?.message || 'Login failed: Invalid credentials or backend error.');
    }

    return safeJson<LoginResponse>(response, 'Login API');
  } catch (err) {
    if (err instanceof Error && /invalid credentials|invalid email or password/i.test(err.message)) {
      throw err;
    }

    const fallbackEmail = normalizeEmail(email);

    if (!fallbackEmail) {
      throw new Error('Please enter an email address.');
    }

    return {
      token: 'quiet-hour-offline-token',
      user: {
        name: fallbackEmail.split('@')[0] || DEMO_USER_NAME,
        email: fallbackEmail,
      },
    };
  }
}

export async function fetchQuietPlaces(latitude: number, longitude: number): Promise<Place[]> {
  return fetchQuietPlacesWithFilters(latitude, longitude, '', []);
}

function keepNearestPlaces(places: Place[], latitude: number, longitude: number): Place[] {
  const MAX_REASONABLE_DISTANCE_KM = 20;

  const normalized = places
    .map((place) => {
      const computedDistance = distanceKm(latitude, longitude, place.latitude, place.longitude);

      return {
        ...place,
        distanceKm: Number(computedDistance.toFixed(2)),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.rushScore - b.rushScore);

  const nearby = normalized.filter((place) => place.distanceKm <= MAX_REASONABLE_DISTANCE_KM);
  return nearby.length > 0 ? nearby : normalized.slice(0, 20);
}

export async function fetchQuietPlacesWithFilters(
  latitude: number,
  longitude: number,
  searchQuery: string,
  categories: PlaceType[]
): Promise<Place[]> {
  try {
    const apiUrl = getApiBaseUrl();
    const params = new URLSearchParams({
      lat: String(latitude),
      lng: String(longitude),
    });

    if (searchQuery.trim().length > 0) {
      params.append('q', searchQuery.trim());
    }

    if (categories.length > 0) {
      params.append('categories', categories.join(','));
    }

    const response = await withTimeout(
      fetch(`${apiUrl}/api/places/quiet-nearby?${params.toString()}`, {
        method: 'GET',
      }),
      FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message || 'Could not load places. Backend might be offline.');
    }

    const result = await safeJson<{ places: Place[] }>(response, 'Quiet places API');
    return keepNearestPlaces(result.places || [], latitude, longitude);
  } catch (err) {
    throw getFriendlyApiError(err, 'Nearby places API');
  }
}

export async function fetchPlaceReviews(placeId: string): Promise<PlaceReview[]> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await withTimeout(fetch(`${apiUrl}/api/places/${placeId}/reviews`), FETCH_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error('Could not fetch reviews for this place.');
    }

    const result = await safeJson<{ reviews: PlaceReview[] }>(response, 'Reviews API');
    return result.reviews;
  } catch {
    return offlineReviewsByPlace.get(placeId) || [];
  }
}

export async function submitPlaceReview(payload: {
  placeId: string;
  userName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await withTimeout(
      fetch(`${apiUrl}/api/places/${payload.placeId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(result?.message || 'Could not submit review.');
    }
  } catch {
    const item: PlaceReview = {
      id: `offline-review-${Date.now()}`,
      placeId: payload.placeId,
      userName: payload.userName,
      rating: payload.rating,
      comment: payload.comment,
      createdAt: new Date().toISOString(),
    };

    const existing = offlineReviewsByPlace.get(payload.placeId) || [];
    offlineReviewsByPlace.set(payload.placeId, [item, ...existing]);
  }
}

export async function suggestNewSpot(payload: {
  name: string;
  address: string;
  type: PlaceType;
  notes: string;
}): Promise<void> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await withTimeout(
      fetch(`${apiUrl}/api/spots/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(result?.message || 'Could not suggest spot.');
    }
  } catch {
    offlineSuggestions.unshift({
      id: `offline-suggestion-${Date.now()}`,
      name: payload.name,
      type: payload.type,
      address: payload.address,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
  }
}

export async function fetchNewSuggestions(): Promise<NewSpotSuggestion[]> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await withTimeout(fetch(`${apiUrl}/api/spots/new`), FETCH_TIMEOUT_MS);

    if (!response.ok) {
      return [];
    }

    const result = await safeJson<{ items: NewSpotSuggestion[] }>(response, 'Suggestions API');
    return result.items;
  } catch {
    return offlineSuggestions.slice(0, 10);
  }
}
