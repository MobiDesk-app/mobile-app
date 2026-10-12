import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { RelayProvider, useRelay } from "../lib/relayContext";
import { LoginScreen } from "../components/LoginScreen";

function Gate() {
  const { auth } = useRelay();

  if (auth === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0c0d10", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#5b8def" />
      </View>
    );
  }
  if (!auth) return <LoginScreen />;

  return (
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
  );
}

export default function RootLayout() {
  return (
    <RelayProvider>
      <Gate />
    </RelayProvider>
  );
}
