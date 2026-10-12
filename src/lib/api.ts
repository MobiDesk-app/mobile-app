import { Platform } from "react-native";
import type { PcSummary } from "./protocol/messages";

async function request<T>(serverUrl: string, path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection or the server address.");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // non-JSON error page
  }
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

export interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

const deviceName = Platform.OS === "ios" ? "iPhone app" : Platform.OS === "android" ? "Android app" : "Mobile app";

export const api = {
  register: (serverUrl: string, email: string, password: string) =>
    request<AuthResult>(serverUrl, "/api/auth/register", { body: { email, password, deviceName } }),
  login: (serverUrl: string, email: string, password: string) =>
    request<AuthResult>(serverUrl, "/api/auth/login", { body: { email, password, deviceName } }),
  logout: (serverUrl: string, token: string) => request<void>(serverUrl, "/api/auth/logout", { method: "POST", token }),
  linkPc: (serverUrl: string, token: string, code: string) =>
    request<{ pc: { id: string; name: string } }>(serverUrl, "/api/pairing/claim", { body: { code }, token }),
  unlinkPc: (serverUrl: string, token: string, pcId: string) =>
    request<void>(serverUrl, `/api/pcs/${encodeURIComponent(pcId)}`, { method: "DELETE", token }),
  listPcs: (serverUrl: string, token: string) => request<{ pcs: PcSummary[] }>(serverUrl, "/api/pcs", { token }),
};
