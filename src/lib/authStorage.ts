import * as SecureStore from "expo-secure-store";

// Kept in the OS keychain (iOS) / Keystore-backed storage (Android), not in
// plain AsyncStorage. It's this phone's own revocable session token, never
// the password.
const KEY = "home_relay_auth";

export interface StoredAuth {
  serverUrl: string;
  sessionToken: string;
  email: string;
}

export async function loadAuth(): Promise<StoredAuth | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.serverUrl !== "string" || typeof parsed.sessionToken !== "string") return null;
    return { serverUrl: parsed.serverUrl, sessionToken: parsed.sessionToken, email: String(parsed.email ?? "") };
  } catch {
    return null;
  }
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(auth));
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

/** Accepts "example.com", "https://example.com", or "wss://example.com". */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^[a-z]+:\/\//i.test(url)) url = `${/^(localhost|\d+\.\d+\.\d+\.\d+)(:|$)/.test(url) ? "http" : "https"}://${url}`;
  return url.replace(/^ws(s?):\/\//i, "http$1://");
}

export function toWebSocketUrl(serverUrl: string): string {
  return serverUrl.replace(/^http(s?):\/\//i, "ws$1://");
}
