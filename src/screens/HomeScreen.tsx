import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { QuietHourLogo } from '../components/Logo';
import {
  fetchNewSuggestions,
  fetchQuietPlacesWithFilters,
} from '../services/api';
import { colors } from '../theme';
import { Place, PlaceType } from '../types';

const CATEGORY_OPTIONS: PlaceType[] = ['Cafe', 'Library', 'Campus Room', 'Hostel'];
const FAVORITES_KEY = 'quiethour:favorites';

type Props = {
  userName: string;
  userEmail: string;
  onLogout: () => void;
};

export function HomeScreen({ userName, userEmail, onLogout }: Props) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [selectedCategories, setSelectedCategories] = useState<PlaceType[]>([...CATEGORY_OPTIONS]);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [lastQuietCount, setLastQuietCount] = useState(0);
  const [lastSuggestionCount, setLastSuggestionCount] = useState(0);

  const filteredPlaces = useMemo(
    () => (showSavedOnly ? places.filter((place) => favorites.includes(place.id)) : places),
    [favorites, places, showSavedOnly]
  );

  const recommendedPlace = useMemo(() => {
    if (filteredPlaces.length === 0) {
      return null;
    }

    const hour = new Date().getHours();

    const ranked = [...filteredPlaces].sort((a, b) => {
      const favoriteBoostA = favorites.includes(a.id) ? 16 : 0;
      const favoriteBoostB = favorites.includes(b.id) ? 16 : 0;

      const morningBoostA = hour < 12 && a.type === 'Library' ? 8 : 0;
      const morningBoostB = hour < 12 && b.type === 'Library' ? 8 : 0;

      const eveningBoostA = hour >= 16 && a.type === 'Cafe' ? 6 : 0;
      const eveningBoostB = hour >= 16 && b.type === 'Cafe' ? 6 : 0;

      const scoreA = 100 - a.rushScore - a.distanceKm * 5 + favoriteBoostA + morningBoostA + eveningBoostA;
      const scoreB = 100 - b.rushScore - b.distanceKm * 5 + favoriteBoostB + morningBoostB + eveningBoostB;

      return scoreB - scoreA;
    });

    return ranked[0];
  }, [favorites, filteredPlaces]);

  const loadFavorites = useCallback(async () => {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      setFavorites(parsed);
    } catch {
      setFavorites([]);
    }
  }, []);

  const persistFavorites = useCallback(async (next: string[]) => {
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    const status = await Notifications.requestPermissionsAsync();
    setNotifyEnabled(status.status === 'granted');
  }, []);

  const sendLocalNotification = useCallback(
    async (title: string, body: string) => {
      if (!notifyEnabled) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
        },
        trigger: null,
      });
    },
    [notifyEnabled]
  );

  const loadPlaces = useCallback(
    async (isPullToRefresh = false) => {
      try {
        setError('');
        if (isPullToRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('Location permission is required to discover nearby quiet spots.');
        }

        let location;

        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }

        const latestCoords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        setCoords(latestCoords);

        const items = await fetchQuietPlacesWithFilters(
          latestCoords.latitude,
          latestCoords.longitude,
          '',
          selectedCategories
        );

        setPlaces(items);

        const veryQuietCount = items.filter((place) => place.noiseLevel === 'Very Quiet').length;
        if (veryQuietCount > lastQuietCount && veryQuietCount > 0) {
          await sendLocalNotification(
            'Quiet spot available',
            `${veryQuietCount} very quiet spaces found near you right now.`
          );
        }
        setLastQuietCount(veryQuietCount);

        const newSuggestions = await fetchNewSuggestions();
        if (newSuggestions.length > lastSuggestionCount && newSuggestions.length > 0) {
          await sendLocalNotification(
            'New locations added',
            `${newSuggestions.length - lastSuggestionCount} new user-contributed spots are waiting in queue.`
          );
        }
        setLastSuggestionCount(newSuggestions.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load places.');
        setPlaces([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lastQuietCount, lastSuggestionCount, selectedCategories, sendLocalNotification]
  );

  const toggleCategory = async (category: PlaceType) => {
    const exists = selectedCategories.includes(category);
    const next = exists
      ? selectedCategories.filter((item) => item !== category)
      : [...selectedCategories, category];

    const finalCategories = next.length > 0 ? next : [category];
    setSelectedCategories(finalCategories);

    if (coords) {
      try {
        setRefreshing(true);
        const items = await fetchQuietPlacesWithFilters(
          coords.latitude,
          coords.longitude,
          '',
          finalCategories
        );
        setPlaces(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not apply category filter.');
      } finally {
        setRefreshing(false);
      }
    }
  };

  const toggleFavorite = async (placeId: string) => {
    const exists = favorites.includes(placeId);
    const next = exists ? favorites.filter((id) => id !== placeId) : [...favorites, placeId];
    await persistFavorites(next);
  };

  useEffect(() => {
    requestNotificationPermission();
    loadFavorites().catch(() => undefined);
    loadPlaces().catch(() => undefined);
  }, [loadFavorites, loadPlaces, requestNotificationPermission]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logoRow}>
          <QuietHourLogo size={106} />
        </View>

        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={styles.greeting}>Welcome, {userName}</Text>
            <Text style={styles.subGreeting}>{userEmail}</Text>
          </View>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <Text style={styles.profileTitle}>Profile Snapshot</Text>
          <Pressable style={styles.savedPlacesRow} onPress={() => setShowSavedOnly((prev) => !prev)}>
            <Text style={styles.profileStat}>Saved places: {favorites.length}</Text>
            <Text style={styles.savedToggleText}>{showSavedOnly ? 'Show All' : 'View Saved'}</Text>
          </Pressable>
          <Text style={styles.profileStat}>Notifications: {notifyEnabled ? 'Enabled' : 'Disabled'}</Text>
        </View>

        {recommendedPlace ? (
          <View style={styles.recommendCard}>
            <Text style={styles.recommendLabel}>AI Recommendation</Text>
            <Text style={styles.recommendName}>{recommendedPlace.name}</Text>
            <Text style={styles.recommendMeta}>
              {recommendedPlace.type} · {recommendedPlace.noiseLevel} · {recommendedPlace.distanceKm.toFixed(1)} km
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {CATEGORY_OPTIONS.map((category) => {
            const active = selectedCategories.includes(category);
            return (
              <Pressable
                key={category}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => {
                  toggleCategory(category).catch(() => undefined);
                }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && showSavedOnly ? <Text style={styles.savedBanner}>Showing saved locations only</Text> : null}

        {!loading && filteredPlaces.length === 0 ? (
          <Text style={styles.emptyText}>
            {showSavedOnly ? 'No saved locations yet. Tap Bookmark on any location.' : 'No nearby locations found right now.'}
          </Text>
        ) : null}

        {!loading &&
          filteredPlaces.map((place) => (
            <View style={styles.placeCard} key={place.id}>
              <View style={styles.placeTop}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.distance}>{place.distanceKm.toFixed(1)} km</Text>
              </View>

              <Text style={styles.placeType}>{place.type}</Text>
              <Text style={styles.address}>{place.address}</Text>

              <View style={styles.metaRow}>
                <View style={styles.pillGreen}>
                  <Text style={styles.pillGreenText}>{place.noiseLevel}</Text>
                </View>
                <View style={styles.pillBlue}>
                  <Text style={styles.pillBlueText}>{place.liveCrowd}</Text>
                </View>
              </View>

              <Text style={styles.detailLine}>
                Rating: {place.rating.toFixed(1)} ({place.reviewsCount} reviews) ·{' '}
                {place.openNow === null ? 'Hours unavailable' : place.openNow ? 'Open now' : 'Closed now'}
              </Text>
              <Text style={styles.detailLine}>{place.bestTimeToVisit}</Text>

              <View style={styles.cardButtonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => toggleFavorite(place.id).catch(() => undefined)}>
                  <Text style={styles.secondaryButtonText}>
                    {favorites.includes(place.id) ? 'Bookmarked' : 'Bookmark'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  content: {
    padding: 14,
    paddingBottom: 28,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topLeft: {
    flex: 1,
    marginRight: 8,
  },
  greeting: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  subGreeting: {
    marginTop: 2,
    color: colors.mutedInk,
    fontSize: 13,
  },
  logoutButton: {
    backgroundColor: '#f9d2bd',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  logoutText: {
    color: '#63391c',
    fontWeight: '700',
  },
  profileCard: {
    backgroundColor: '#fff4de',
    borderColor: '#efd8af',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  profileTitle: {
    color: '#5c4426',
    fontWeight: '800',
    marginBottom: 4,
  },
  profileStat: {
    color: '#4d5d54',
    fontSize: 13,
    marginBottom: 2,
  },
  savedPlacesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedToggleText: {
    color: '#0f6a4a',
    fontWeight: '700',
    fontSize: 12,
  },
  recommendCard: {
    backgroundColor: '#dff7eb',
    borderColor: '#bee7d1',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  recommendLabel: {
    color: '#0d6a47',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 2,
  },
  recommendName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  recommendMeta: {
    color: '#3d5a4e',
    marginTop: 2,
    fontSize: 13,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  filterPill: {
    backgroundColor: '#f2f2eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#dbdccc',
  },
  filterPillActive: {
    backgroundColor: '#0f6a4a',
    borderColor: '#0f6a4a',
  },
  filterText: {
    color: '#506258',
    fontWeight: '700',
    fontSize: 12,
  },
  filterTextActive: {
    color: '#effff8',
  },
  loaderBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  error: {
    marginTop: 8,
    color: colors.warning,
    fontSize: 14,
    fontWeight: '600',
  },
  savedBanner: {
    marginTop: 8,
    color: '#275848',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 8,
    color: '#516158',
    fontWeight: '600',
  },
  placeCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 10,
  },
  placeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  placeName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  distance: {
    color: '#325043',
    fontWeight: '600',
    fontSize: 13,
  },
  placeType: {
    color: '#4e6a5f',
    marginTop: 2,
    fontWeight: '600',
  },
  address: {
    color: '#66776e',
    marginTop: 2,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  pillGreen: {
    backgroundColor: '#d8f6e8',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  pillGreenText: {
    color: '#0c5f42',
    fontSize: 12,
    fontWeight: '700',
  },
  pillBlue: {
    backgroundColor: '#e5edff',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  pillBlueText: {
    color: '#31438e',
    fontSize: 12,
    fontWeight: '700',
  },
  detailLine: {
    marginTop: 6,
    color: '#495d54',
    fontSize: 12,
  },
  cardButtonRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    width: '100%',
    backgroundColor: '#f0f3ef',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d6dccc',
  },
  secondaryButtonText: {
    color: '#3e5a4d',
    fontWeight: '700',
    fontSize: 12,
  },
});
