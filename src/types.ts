export type PlaceType = 'Cafe' | 'Library' | 'Campus Room' | 'Hostel' | 'Coworking';

export type CrowdLabel = 'Low Rush' | 'Medium Rush' | 'Busy';
export type NoiseLevel = 'Very Quiet' | 'Moderate' | 'Noisy';
export type LiveCrowdLabel = 'Low Crowd' | 'Moderate Crowd' | 'High Crowd';

export type Place = {
  id: string;
  name: string;
  type: PlaceType;
  distanceKm: number;
  rushScore: number;
  crowdLabel: CrowdLabel;
  noiseLevel: NoiseLevel;
  liveCrowd: LiveCrowdLabel;
  rating: number;
  reviewsCount: number;
  openNow: boolean | null;
  bestTimeToVisit: string;
  latitude: number;
  longitude: number;
  address: string;
};

export type PlaceReview = {
  id: string;
  placeId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export type NewSpotSuggestion = {
  id: string;
  name: string;
  type: PlaceType;
  address: string;
  notes: string;
  createdAt: string;
  status: 'pending' | 'approved';
};

export type LoginResponse = {
  token: string;
  user: {
    name: string;
    email: string;
  };
};
