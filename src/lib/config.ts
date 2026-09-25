function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env, fill it in, and restart the Metro dev server.`
    );
  }
  return value;
}

export const config = {
  backendUrl: required("EXPO_PUBLIC_BACKEND_URL", process.env.EXPO_PUBLIC_BACKEND_URL),
  authToken: required("EXPO_PUBLIC_AUTH_TOKEN", process.env.EXPO_PUBLIC_AUTH_TOKEN),
  // A stable id for this phone. Good enough for a single-user MVP; a real
  // per-install id (e.g. via expo-application) is a follow-up.
  deviceId: "phone-1",
};
