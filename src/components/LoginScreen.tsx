import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRelay } from "../lib/relayContext";
import { api } from "../lib/api";
import { DEFAULT_SERVER_URL } from "../lib/config";
import { normalizeServerUrl } from "../lib/authStorage";

export function LoginScreen(): React.ReactElement {
  const { signIn } = useRelay();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    if (isRegister && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    const server = normalizeServerUrl(serverUrl);
    try {
      const result = isRegister
        ? await api.register(server, email.trim(), password)
        : await api.login(server, email.trim(), password);
      setPassword("");
      await signIn({ serverUrl: server, sessionToken: result.token, email: result.user.email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{isRegister ? "Create your account" : "Sign in"}</Text>
        <Text style={styles.sub}>
          {isRegister ? "One account for all your PCs, from any phone or browser." : "Welcome back to Home Relay."}
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          placeholderTextColor="#4b5260"
          placeholder="you@example.com"
        />

        <Text style={styles.label}>Password</Text>
        <View>
          <TextInput
            style={[styles.input, { paddingRight: 64 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isRegister ? "new-password" : "current-password"}
            textContentType={isRegister ? "newPassword" : "password"}
            onSubmitEditing={() => void submit()}
          />
          <Pressable style={styles.showBtn} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Text style={styles.showText}>{showPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
        {isRegister && <Text style={styles.hint}>At least 8 characters. A short phrase is easy to remember and hard to guess.</Text>}

        {showServer && (
          <>
            <Text style={styles.label}>Server</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://relay.example.com"
              placeholderTextColor="#4b5260"
            />
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.7 }]} onPress={() => void submit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isRegister ? "Create account" : "Sign in"}</Text>}
        </Pressable>

        <View style={styles.row}>
          <Pressable
            onPress={() => {
              setMode(isRegister ? "signin" : "register");
              setError(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.link}>{isRegister ? "I already have an account" : "Create an account"}</Text>
          </Pressable>
          <Pressable onPress={() => setShowServer((v) => !v)} hitSlop={8}>
            <Text style={styles.faint}>{showServer ? "Hide server" : "Server settings"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0d10" },
  content: { padding: 24, paddingTop: 72 },
  heading: { color: "#f2f4f8", fontSize: 28, fontWeight: "700" },
  sub: { color: "#8a93a3", fontSize: 14, marginTop: 6, marginBottom: 20 },
  label: { color: "#b7bec9", fontSize: 13, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: "#171b22",
    borderColor: "#262b35",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f2f4f8",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  showBtn: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  showText: { color: "#8a93a3", fontSize: 13 },
  hint: { color: "#6b7280", fontSize: 12, marginTop: 6 },
  error: {
    color: "#f28b82",
    backgroundColor: "#2a1717",
    borderColor: "#4a2323",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 16,
    fontSize: 14,
  },
  button: { backgroundColor: "#2f6fed", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 },
  link: { color: "#8fb0f5", fontSize: 14 },
  faint: { color: "#6b7280", fontSize: 12 },
});
