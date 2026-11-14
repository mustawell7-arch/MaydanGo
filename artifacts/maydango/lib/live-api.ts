import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { errorCopy } from '@/lib/content';
import { getDeviceInstallationToken } from '@/lib/device-identity';

export type Rules = {
  quota: number; dailyLimit: number; quotaMode: 'shared' | 'separate';
  physicalQuota: number; premiumQuota: number; liveQuota: number;
  cities?: string[]; facilities?: string[]; categories?: string[];
  facilityLimits?: Record<string, number>; categoryLimits?: Record<string, number>; partnerGroupLimits?: Record<string, number>;
  trialAllowedTypes?: string[]; corporateId?: string;
  planTerms?: {
    description: { en: string; ar: string; ku: string };
    trialPeriodDays: number; minimumContractMonths: number; renewalPeriodDays: number;
    cancellationPeriodDays: number; automaticRenewal: boolean; pauseAllowanceDays: number;
    priceProtectionMonths: number; promotionalPriceIqd: number | null; corporatePriceIqd: number | null;
    digitalContentAccess: boolean; guestPasses: number; eventAccess: boolean; additionalPaymentAllowed: boolean;
  };
};
export type Partner = { id: string; name: string; groupId: string; approved: boolean; ownerUserId: string };
export type Offering = {
  id: string; partnerId: string; title: string; kind: 'session' | 'event' | 'coach'; city: string; facility: string; category: string;
  localizedTitle?: { en: string; ar: string; ku: string } | null;
  localizedDescription?: { en: string; ar: string; ku: string } | null;
  joinUrl?: string | null; canJoin?: boolean;
  accessType: 'physical' | 'premium' | 'live'; tiers: string[]; startsAt: string; endsAt: string; cancellationDeadline: string;
  capacity: number; waitlistOfferMinutes?: number; gender: 'all' | 'female' | 'male'; minAge: number; maxAge: number | null; additionalPayment: boolean; active: boolean;
  targetId: string; slot: string; scope: string; cancelledAt: string | null; partnerName?: string; remaining?: number;
};
export type Plan = { id: string; name: string; tier: string; kind: 'paid' | 'trial' | 'corporate'; durationDays: number; active: boolean; rules: Rules; priceIqd?: number | null; purchasable?: boolean; priceLabel?: string | null; availabilityMessage?: string | null };
export type Subscription = { status: string; paymentStatus: string; cancelAtPeriodEnd: boolean; periodEndsAt: string | null; recoveryUrl: string | null };
export type Operations = { role: 'admin' | 'finance' | 'partner'; partnerId: string | null; partners: Partner[]; offerings: Offering[]; plans: Plan[] };

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export function useApiFetch() {
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken); tokenRef.current = getToken;
  return useCallback(async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const token = await tokenRef.current();
    const deviceToken = Platform.OS === 'web' ? null : await getDeviceInstallationToken();
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const res = await fetch(`${domain ? `https://${domain}` : ''}/api${path}`, {
      method: init?.method ?? 'GET', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceToken ? { 'X-MaydanGo-Device': deviceToken } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const msg = (json && typeof json === 'object' && ('error' in json || 'message' in json)) ? String((json as Record<string, unknown>).error ?? (json as Record<string, unknown>).message) : `Request failed (${res.status})`;
      throw new HttpError(res.status, msg);
    }
    return json as T;
  }, []);
}

/** Authenticated resource: refreshes on focus/app-active, clears on sign-out or user change. */
export function useAuthedResource<T>(path: string) {
  const { userId, isSignedIn } = useAuth();
  const api = useApiFetch();
  const owner = useRef(userId); owner.current = userId;
  const [data, setData] = useState<{ owner: string; value: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const who = userId;
    if (!who) return;
    setLoading(true);
    try { const v = await api<T>(path); if (owner.current === who) { setData({ owner: who, value: v }); setError(null); setStatus(null); } }
    catch (e) { if (owner.current === who) { if (e instanceof HttpError && [401, 403].includes(e.status)) setData(null); setStatus(e instanceof HttpError ? e.status : null); setError(e instanceof HttpError ? e.message : errorCopy(e)); } }
    finally { if (owner.current === who) setLoading(false); }
  }, [api, path, userId]);
  useEffect(() => {
    setData(null); setError(null); setStatus(null);
    if (!isSignedIn) return;
    void refresh();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    const timer = setInterval(() => void refresh(), 30000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [refresh, isSignedIn]);
  return { data: data && data.owner === userId ? data.value : null, error, status, loading, refresh, signedIn: !!isSignedIn, api };
}
