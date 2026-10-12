// The server address is not a secret, so it's fine to bake it into the app.
// (The old shared AUTH_TOKEN used to be baked in here too — anyone could
// have extracted it from the app. Each sign-in now gets its own token.)
// Users can still change the server from the sign-in screen.
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";
