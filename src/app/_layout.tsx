import { Stack } from "expo-router";
import { RelayProvider } from "../lib/relayContext";

export default function RootLayout() {
  return (
    <RelayProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#12141a" },
          headerTintColor: "#f2f4f8",
          contentStyle: { backgroundColor: "#0c0d10" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Home Relay" }} />
        <Stack.Screen name="remote/[deviceId]" options={{ title: "Remote Screen" }} />
        <Stack.Screen name="files/[deviceId]" options={{ title: "Files" }} />
      </Stack>
    </RelayProvider>
  );
}
