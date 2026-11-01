import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const STORAGE_KEY = "maydango-installation-secret-v1";
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
let installationTokenPromise: Promise<string | null> | null = null;

/** The server stores only a digest of this random, installation-scoped secret. */
export function getDeviceInstallationToken(): Promise<string | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  if (!installationTokenPromise) {
    installationTokenPromise = (async () => {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved && UUID_V4.test(saved)) return saved.toLowerCase();
      const token = Crypto.randomUUID().toLowerCase();
      await SecureStore.setItemAsync(STORAGE_KEY, token);
      return token;
    })();
  }
  return installationTokenPromise;
}
