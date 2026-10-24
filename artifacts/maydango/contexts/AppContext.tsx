import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Language } from '@/lib/i18n';

type Booking = { sessionId: string; bookedAt: string };
type CheckIn = { facilityId: string; checkedInAt: string };
type CoachRequest = { coachId: string; slot: string; requestedAt: string };
type MembershipTier = 'M' | 'L' | 'XL';
type SavedState = {
  language: Language;
  selectedCityId: string;
  favorites: string[];
  bookings: Booking[];
  eventBookings: string[];
  coachRequests: CoachRequest[];
  checkIns: CheckIn[];
  membershipTier: MembershipTier;
  visitsRemaining: number;
};

type AppContextValue = SavedState & {
  hydrated: boolean;
  setLanguage: (language: Language) => void;
  setSelectedCityId: (cityId: string) => void;
  toggleFavorite: (facilityId: string) => void;
  bookSession: (sessionId: string) => boolean;
  cancelBooking: (sessionId: string) => void;
  bookEvent: (eventId: string) => void;
  requestCoaching: (coachId: string, slot: string) => void;
  recordCheckIn: (facilityId: string) => void;
  setMembershipTier: (tier: MembershipTier) => void;
};

const STORAGE_KEY = 'maydango-app-v1';
const defaults: SavedState = {
  language: 'en',
  selectedCityId: 'baghdad',
  favorites: [],
  bookings: [],
  eventBookings: [],
  coachRequests: [],
  checkIns: [],
  membershipTier: 'M',
  visitsRemaining: 8,
};
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SavedState>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Partial<SavedState>;
        setState({ ...defaults, ...parsed });
      })
      .catch(() => {
        // Keep the safe defaults available if local storage is unavailable.
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      // The current session remains usable if device storage is temporarily full.
    });
  }, [hydrated, state]);

  const setLanguage = useCallback((language: Language) => {
    setState((current) => ({ ...current, language }));
  }, []);

  const setSelectedCityId = useCallback((selectedCityId: string) => {
    setState((current) => ({ ...current, selectedCityId }));
  }, []);

  const toggleFavorite = useCallback((facilityId: string) => {
    setState((current) => ({
      ...current,
      favorites: current.favorites.includes(facilityId)
        ? current.favorites.filter((id) => id !== facilityId)
        : [...current.favorites, facilityId],
    }));
  }, []);

  const bookSession = useCallback((sessionId: string) => {
    let created = false;
    setState((current) => {
      if (current.bookings.some((booking) => booking.sessionId === sessionId)) {
        return current;
      }
      created = true;
      return {
        ...current,
        bookings: [
          ...current.bookings,
          { sessionId, bookedAt: new Date().toISOString() },
        ],
      };
    });
    return created;
  }, []);

  const cancelBooking = useCallback((sessionId: string) => {
    setState((current) => ({
      ...current,
      bookings: current.bookings.filter(
        (booking) => booking.sessionId !== sessionId,
      ),
    }));
  }, []);

  const bookEvent = useCallback((eventId: string) => {
    setState((current) => ({
      ...current,
      eventBookings: current.eventBookings.includes(eventId)
        ? current.eventBookings
        : [...current.eventBookings, eventId],
    }));
  }, []);

  const requestCoaching = useCallback((coachId: string, slot: string) => {
    setState((current) => {
      const alreadyRequested = current.coachRequests.some(
        (request) => request.coachId === coachId && request.slot === slot,
      );
      if (alreadyRequested) return current;
      return {
        ...current,
        coachRequests: [
          ...current.coachRequests,
          { coachId, slot, requestedAt: new Date().toISOString() },
        ],
      };
    });
  }, []);

  const recordCheckIn = useCallback((facilityId: string) => {
    setState((current) => ({
      ...current,
      checkIns: [
        { facilityId, checkedInAt: new Date().toISOString() },
        ...current.checkIns,
      ],
      visitsRemaining: Math.max(0, current.visitsRemaining - 1),
    }));
  }, []);

  const setMembershipTier = useCallback((membershipTier: MembershipTier) => {
    setState((current) => ({ ...current, membershipTier }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      hydrated,
      setLanguage,
      setSelectedCityId,
      toggleFavorite,
      bookSession,
      cancelBooking,
      bookEvent,
      requestCoaching,
      recordCheckIn,
      setMembershipTier,
    }),
    [
      state,
      hydrated,
      setLanguage,
      setSelectedCityId,
      toggleFavorite,
      bookSession,
      cancelBooking,
      bookEvent,
      requestCoaching,
      recordCheckIn,
      setMembershipTier,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
