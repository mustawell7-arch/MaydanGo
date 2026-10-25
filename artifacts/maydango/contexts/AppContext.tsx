import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Language } from '@/lib/i18n';
import { coaches, communityEvents, courses, sessions } from '@/data/demo';

/**
 * All statuses here are LOCAL PREVIEW statuses. Nothing is sent to a partner.
 * A reservation is never attendance; attendance only comes from check-ins.
 */
export type LocalStatus = 'reserved' | 'cancelled';
export type Booking = { sessionId: string; bookedAt: string; status: LocalStatus; cancelledAt?: string };
export type EventBooking = { eventId: string; reservedAt: string; status: LocalStatus; cancelledAt?: string };
export type CoachRequest = {
  coachId: string;
  slot: string;
  requestedAt: string;
  status: 'requested' | 'cancelled';
  cancelledAt?: string;
};
export type CourseProgress = { enrolledAt: string; completedLessons: string[] };
type CheckIn = { facilityId: string; checkedInAt: string };
type MembershipTier = 'M' | 'L' | 'XL';
type SavedState = {
  language: Language;
  selectedCityId: string;
  favorites: string[];
  bookings: Booking[];
  eventBookings: EventBooking[];
  coachRequests: CoachRequest[];
  courseProgress: Record<string, CourseProgress>;
  checkIns: CheckIn[];
  membershipTier: MembershipTier;
  visitsRemaining: number;
};

export type ActionResult = { ok: true } | { ok: false; reason: 'missing' | 'duplicate' | 'invalid' | 'notActive' };

type AppContextValue = SavedState & {
  hydrated: boolean;
  storageError: 'load' | 'save' | null;
  dismissStorageError: () => void;
  retrySave: () => void;
  setLanguage: (language: Language) => void;
  setSelectedCityId: (cityId: string) => void;
  toggleFavorite: (facilityId: string) => void;
  isSessionBooked: (sessionId: string) => boolean;
  bookSession: (sessionId: string) => ActionResult;
  cancelBooking: (sessionId: string) => ActionResult;
  isEventReserved: (eventId: string) => boolean;
  bookEvent: (eventId: string) => ActionResult;
  cancelEvent: (eventId: string) => ActionResult;
  activeCoachRequest: (coachId: string) => CoachRequest | undefined;
  requestCoaching: (coachId: string, slot: string) => ActionResult;
  cancelCoachRequest: (coachId: string, slot: string) => ActionResult;
  enrollCourse: (courseId: string) => ActionResult;
  toggleLesson: (courseId: string, lessonId: string) => ActionResult;
  courseCompletion: (courseId: string) => number;
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
  courseProgress: {},
  checkIns: [],
  membershipTier: 'M',
  visitsRemaining: 8,
};
const AppContext = createContext<AppContextValue | null>(null);

// Older stored shapes: bookings without status, eventBookings as string[], requests without status.
function normalize(parsed: Record<string, unknown>): SavedState {
  const next = { ...defaults, ...(parsed as Partial<SavedState>) };
  const now = new Date().toISOString();
  next.bookings = (Array.isArray(parsed.bookings) ? parsed.bookings : []).map((b: any) => ({
    ...b,
    status: b.status === 'cancelled' ? 'cancelled' : 'reserved',
  }));
  next.eventBookings = (Array.isArray(parsed.eventBookings) ? parsed.eventBookings : []).map((e: any) =>
    typeof e === 'string' ? { eventId: e, reservedAt: now, status: 'reserved' as const } : { ...e, status: e.status === 'cancelled' ? 'cancelled' : 'reserved' },
  );
  next.coachRequests = (Array.isArray(parsed.coachRequests) ? parsed.coachRequests : []).map((r: any) => ({
    ...r,
    status: r.status === 'cancelled' ? 'cancelled' : 'requested',
  }));
  next.courseProgress =
    parsed.courseProgress && typeof parsed.courseProgress === 'object' ? (parsed.courseProgress as SavedState['courseProgress']) : {};
  return next;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setStateRaw] = useState<SavedState>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<'load' | 'save' | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const [loadTick, setLoadTick] = useState(0);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const stateRef = useRef(state);

  // Synchronous ref keeps guards correct even with rapid repeated taps.
  const commit = useCallback((updater: (current: SavedState) => SavedState) => {
    const next = updater(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          const next = normalize(JSON.parse(stored));
          stateRef.current = next;
          setStateRaw(next);
        }
        setStorageLoaded(true);
        setStorageError(null);
      })
      .catch(() => {
        if (active) setStorageError('load');
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [loadTick]);

  useEffect(() => {
    if (!hydrated || !storageLoaded) return;
    let active = true;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      .then(() => {
        if (active) setStorageError((e) => (e === 'save' ? null : e));
      })
      .catch(() => {
        if (active) setStorageError('save');
      });
    return () => {
      active = false;
    };
  }, [hydrated, storageLoaded, state, saveTick]);

  const dismissStorageError = useCallback(() => setStorageError(null), []);
  const retrySave = useCallback(() => {
    if (!storageLoaded) setLoadTick((n) => n + 1);
    else setSaveTick((n) => n + 1);
  }, [storageLoaded]);

  const setLanguage = useCallback((language: Language) => commit((c) => ({ ...c, language })), [commit]);
  const setSelectedCityId = useCallback((selectedCityId: string) => commit((c) => ({ ...c, selectedCityId })), [commit]);
  const toggleFavorite = useCallback(
    (facilityId: string) =>
      commit((c) => ({
        ...c,
        favorites: c.favorites.includes(facilityId) ? c.favorites.filter((id) => id !== facilityId) : [...c.favorites, facilityId],
      })),
    [commit],
  );

  const isSessionBooked = useCallback(
    (id: string) => state.bookings.some((b) => b.sessionId === id && b.status === 'reserved'),
    [state.bookings],
  );

  const bookSession = useCallback(
    (sessionId: string): ActionResult => {
      if (!sessions.some((s) => s.id === sessionId)) return { ok: false, reason: 'missing' };
      const cur = stateRef.current;
      if (cur.bookings.some((b) => b.sessionId === sessionId && b.status === 'reserved')) return { ok: false, reason: 'duplicate' };
      commit((c) => ({
        ...c,
        bookings: [
          ...c.bookings.filter((b) => b.sessionId !== sessionId),
          { sessionId, bookedAt: new Date().toISOString(), status: 'reserved' },
        ],
      }));
      return { ok: true };
    },
    [commit],
  );

  const cancelBooking = useCallback(
    (sessionId: string): ActionResult => {
      if (!stateRef.current.bookings.some((b) => b.sessionId === sessionId && b.status === 'reserved')) return { ok: false, reason: 'notActive' };
      const at = new Date().toISOString();
      commit((c) => ({
        ...c,
        bookings: c.bookings.map((b) => (b.sessionId === sessionId && b.status === 'reserved' ? { ...b, status: 'cancelled', cancelledAt: at } : b)),
      }));
      return { ok: true };
    },
    [commit],
  );

  const isEventReserved = useCallback(
    (id: string) => state.eventBookings.some((e) => e.eventId === id && e.status === 'reserved'),
    [state.eventBookings],
  );

  const bookEvent = useCallback(
    (eventId: string): ActionResult => {
      if (!communityEvents.some((e) => e.id === eventId)) return { ok: false, reason: 'missing' };
      if (stateRef.current.eventBookings.some((e) => e.eventId === eventId && e.status === 'reserved')) return { ok: false, reason: 'duplicate' };
      commit((c) => ({
        ...c,
        eventBookings: [
          ...c.eventBookings.filter((e) => e.eventId !== eventId),
          { eventId, reservedAt: new Date().toISOString(), status: 'reserved' },
        ],
      }));
      return { ok: true };
    },
    [commit],
  );

  const cancelEvent = useCallback(
    (eventId: string): ActionResult => {
      if (!stateRef.current.eventBookings.some((e) => e.eventId === eventId && e.status === 'reserved')) return { ok: false, reason: 'notActive' };
      const at = new Date().toISOString();
      commit((c) => ({
        ...c,
        eventBookings: c.eventBookings.map((e) => (e.eventId === eventId && e.status === 'reserved' ? { ...e, status: 'cancelled', cancelledAt: at } : e)),
      }));
      return { ok: true };
    },
    [commit],
  );

  const activeCoachRequest = useCallback(
    (coachId: string) => state.coachRequests.find((r) => r.coachId === coachId && r.status === 'requested'),
    [state.coachRequests],
  );

  const requestCoaching = useCallback(
    (coachId: string, slot: string): ActionResult => {
      const coach = coaches.find((c) => c.id === coachId);
      if (!coach) return { ok: false, reason: 'missing' };
      if (!coach.slots.some((s) => s.id === slot)) return { ok: false, reason: 'invalid' };
      // One open request per coach keeps the preview honest and simple.
      if (stateRef.current.coachRequests.some((r) => r.coachId === coachId && r.status === 'requested')) return { ok: false, reason: 'duplicate' };
      commit((c) => ({
        ...c,
        coachRequests: [
          ...c.coachRequests.filter((r) => !(r.coachId === coachId && r.slot === slot)),
          { coachId, slot, requestedAt: new Date().toISOString(), status: 'requested' },
        ],
      }));
      return { ok: true };
    },
    [commit],
  );

  const cancelCoachRequest = useCallback(
    (coachId: string, slot: string): ActionResult => {
      if (!stateRef.current.coachRequests.some((r) => r.coachId === coachId && r.slot === slot && r.status === 'requested')) return { ok: false, reason: 'notActive' };
      const at = new Date().toISOString();
      commit((c) => ({
        ...c,
        coachRequests: c.coachRequests.map((r) =>
          r.coachId === coachId && r.slot === slot && r.status === 'requested' ? { ...r, status: 'cancelled', cancelledAt: at } : r,
        ),
      }));
      return { ok: true };
    },
    [commit],
  );

  const enrollCourse = useCallback(
    (courseId: string): ActionResult => {
      if (!courses.some((c) => c.id === courseId)) return { ok: false, reason: 'missing' };
      if (stateRef.current.courseProgress[courseId]) return { ok: false, reason: 'duplicate' };
      commit((c) => ({
        ...c,
        courseProgress: { ...c.courseProgress, [courseId]: { enrolledAt: new Date().toISOString(), completedLessons: [] } },
      }));
      return { ok: true };
    },
    [commit],
  );

  const toggleLesson = useCallback(
    (courseId: string, lessonId: string): ActionResult => {
      const course = courses.find((c) => c.id === courseId);
      if (!course || !course.sampleLessons.some((l) => l.id === lessonId)) return { ok: false, reason: 'missing' };
      if (!stateRef.current.courseProgress[courseId]) return { ok: false, reason: 'notActive' };
      commit((c) => {
        const p = c.courseProgress[courseId];
        const done = p.completedLessons.includes(lessonId)
          ? p.completedLessons.filter((id) => id !== lessonId)
          : [...p.completedLessons, lessonId];
        return { ...c, courseProgress: { ...c.courseProgress, [courseId]: { ...p, completedLessons: done } } };
      });
      return { ok: true };
    },
    [commit],
  );

  const courseCompletion = useCallback(
    (courseId: string) => {
      const course = courses.find((c) => c.id === courseId);
      const p = state.courseProgress[courseId];
      if (!course || !p || course.sampleLessons.length === 0) return 0;
      const done = p.completedLessons.filter((id) => course.sampleLessons.some((l) => l.id === id)).length;
      return Math.round((done / course.sampleLessons.length) * 100);
    },
    [state.courseProgress],
  );

  const recordCheckIn = useCallback(
    (facilityId: string) =>
      commit((c) => ({
        ...c,
        checkIns: [{ facilityId, checkedInAt: new Date().toISOString() }, ...c.checkIns],
        visitsRemaining: Math.max(0, c.visitsRemaining - 1),
      })),
    [commit],
  );

  const setMembershipTier = useCallback((membershipTier: MembershipTier) => commit((c) => ({ ...c, membershipTier })), [commit]);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      hydrated,
      storageError,
      dismissStorageError,
      retrySave,
      setLanguage,
      setSelectedCityId,
      toggleFavorite,
      isSessionBooked,
      bookSession,
      cancelBooking,
      isEventReserved,
      bookEvent,
      cancelEvent,
      activeCoachRequest,
      requestCoaching,
      cancelCoachRequest,
      enrollCourse,
      toggleLesson,
      courseCompletion,
      recordCheckIn,
      setMembershipTier,
    }),
    [
      state, hydrated, storageError, dismissStorageError, retrySave, setLanguage, setSelectedCityId, toggleFavorite,
      isSessionBooked, bookSession, cancelBooking, isEventReserved, bookEvent, cancelEvent, activeCoachRequest,
      requestCoaching, cancelCoachRequest, enrollCourse, toggleLesson, courseCompletion, recordCheckIn, setMembershipTier,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
