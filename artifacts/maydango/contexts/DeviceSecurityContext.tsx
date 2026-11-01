import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import { useAuth, useClerk } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  cancelMemberDeviceChange,
  getGetMemberDeviceStatusQueryKey,
  getMemberDeviceStatus,
  registerMemberDevice,
  type MemberDeviceStatus,
} from "@workspace/api-client-react";
import { errorCopy } from "@/lib/content";

type DeviceSecurityValue = {
  status: MemberDeviceStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: "cancelled" | "no_change" | null;
  refresh: () => Promise<void>;
  cancelPendingChange: () => Promise<void>;
};

const DeviceSecurityContext = createContext<DeviceSecurityValue | null>(null);

export function DeviceSecurityProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MemberDeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DeviceSecurityValue["notice"]>(null);

  const acceptStatus = useCallback(async (next: MemberDeviceStatus) => {
    setStatus(next);
    setError(null);
    queryClient.setQueryData(getGetMemberDeviceStatusQueryKey(), next);
    if (next.status === "revoked") {
      queryClient.clear();
      await signOut();
    }
  }, [queryClient, signOut]);

  const refresh = useCallback(async () => {
    if (!userId || Platform.OS === "web") return;
    setNotice(null);
    try {
      await acceptStatus(await getMemberDeviceStatus());
    } catch (cause) {
      setError(errorCopy(cause));
    }
  }, [acceptStatus, userId]);

  useEffect(() => {
    let active = true;
    if (!isSignedIn || !userId || Platform.OS === "web") {
      setStatus(null);
      setLoading(false);
      setBusy(false);
      setError(null);
      setNotice(null);
      return;
    }

    const platform = Platform.OS === "ios" ? "ios" : "android";
    setLoading(true);
    setError(null);
    void registerMemberDevice({ platform }).then(async next => {
      if (active) await acceptStatus(next);
    }).catch(cause => {
      if (active) setError(errorCopy(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [acceptStatus, isSignedIn, userId]);

  useEffect(() => {
    if (!isSignedIn || !userId || Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [isSignedIn, refresh, userId]);

  const cancelPendingChange = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const hadPendingChange = !!status?.pendingActivationAt;
      const next = await cancelMemberDeviceChange();
      await acceptStatus(next);
      setNotice(hadPendingChange ? "cancelled" : "no_change");
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setBusy(false);
    }
  }, [acceptStatus, status?.pendingActivationAt]);

  const value = useMemo(() => ({
    status, loading, busy, error, notice, refresh, cancelPendingChange,
  }), [status, loading, busy, error, notice, refresh, cancelPendingChange]);

  return <DeviceSecurityContext.Provider value={value}>{children}</DeviceSecurityContext.Provider>;
}

export function useDeviceSecurity() {
  const value = useContext(DeviceSecurityContext);
  if (!value) throw new Error("useDeviceSecurity must be used inside DeviceSecurityProvider.");
  return value;
}
