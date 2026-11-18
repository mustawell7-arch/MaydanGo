import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useMemberBookings } from '@/hooks/useMemberBookings';
import type { Language } from '@/lib/i18n';
import { activityFavoriteId, toggleActivityFavorite } from '@/lib/favorite-activities';

type LocalState = {
  language: Language; selectedCityId: string; favorites: string[]; favoriteActivities: string[];
  checkIns: { facilityId: string; checkedInAt: string }[];
  membershipTier: 'M' | 'L' | 'XL'; visitsRemaining: number;
};
const defaults: LocalState = {
  language: 'en',
  selectedCityId: 'baghdad',
  favorites: [],
  favoriteActivities: [],
  checkIns: [],
  membershipTier: 'M',
  visitsRemaining: 8,
};
// New preferences key leaves the old local preview reservations intact, but never imports them.
const STORAGE_KEY = 'maydango-preferences-v2';
function useAppState() {
  const [state, setState] = useState(defaults);
  const member = useMemberBookings(state.language);
  const ref = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<'load' | 'save' | null>(null);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const saves = useRef(Promise.resolve());
  const commit = (fn: (s: LocalState) => LocalState) => { ref.current = fn(ref.current); setState(ref.current); };
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (!active) return;
      if (value) {
        const saved = JSON.parse(value);
        if (!['en', 'ar', 'ku'].includes(saved.language)) throw new Error('Invalid saved language');
        // Discard old sample-course progress. Account progress now comes only from the learning API.
        delete saved.courseProgress;
        const favoriteActivities = Array.isArray(saved.favoriteActivities)
          ? [...new Set(saved.favoriteActivities
              .filter((value: unknown): value is string => typeof value === 'string')
              .map(activityFavoriteId)
              .filter(Boolean))]
          : [];
        const next = { ...defaults, ...saved, favoriteActivities }; ref.current = next; setState(next);
      }
      setLoaded(true); setStorageError(null);
    }).catch(() => { if (active) setStorageError('load'); }).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, [tick]);
  useEffect(() => {
    if (!loaded) return;
    // Keep rapid language/preferences changes in order on native storage too.
    saves.current = saves.current.then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))).catch(() => setStorageError('save'));
  }, [state, loaded]);
  return {
    ...state, ...member, hydrated, storageError,
    dismissStorageError: () => setStorageError(null),
    retrySave: () => {
      if (!loaded) setTick(t => t + 1);
      else {
        const value = JSON.stringify(ref.current);
        saves.current = saves.current.then(() => AsyncStorage.setItem(STORAGE_KEY, value)).then(() => setStorageError(null)).catch(() => setStorageError('save'));
      }
    },
    setLanguage: (language: Language) => commit(s => ({ ...s, language })),
    setSelectedCityId: (selectedCityId: string) => commit(s => ({ ...s, selectedCityId })),
    toggleFavorite: (id: string) => commit(s => ({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter(x => x !== id) : [...s.favorites, id] })),
    toggleFavoriteActivity: (activityName: string) => commit(s => ({
      ...s,
      favoriteActivities: toggleActivityFavorite(s.favoriteActivities, activityName),
    })),
    // Preview-only controls cannot grant a server membership or produce verified attendance.
    setMembershipTier: (membershipTier: LocalState['membershipTier']) => commit(s => ({ ...s, membershipTier })),
  };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useAppState();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
