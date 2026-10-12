import React, { useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRelay } from "../lib/relayContext";
import { api } from "../lib/api";
import type { PcSummary } from "../lib/protocol/messages";

const ACCENT = "#5b8def";
const RELAY = "#3ee6ab";

function LinkPcCard({ onDone }: { onDone: () => void }) {
  const { auth, refreshDevices } = useRelay();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const digits = code.replace(/\D/g, "").slice(0, 6);

  const submit = async () => {
    if (!auth || digits.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { pc } = await api.linkPc(auth.serverUrl, auth.sessionToken, digits);
      setLinked(pc.name);
      setTimeout(refreshDevices, 2500); // give the agent a moment to connect
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link that PC.");
    } finally {
      setBusy(false);
    }
  };

  if (linked) {
    return (
      <View style={[styles.linkCard, { borderColor: "#1f4a3a", backgroundColor: "#12261f" }]}>
        <Text style={styles.cardTitle}>“{linked}” is linked</Text>
        <Text style={styles.cardMeta}>It will show up as online in a few seconds.</Text>
        <Pressable onPress={onDone} hitSlop={8} style={{ marginTop: 10 }}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.linkCard}>
      <Text style={styles.cardTitle}>Link a PC</Text>
      <Text style={styles.cardMeta}>Open Home Relay Agent on the PC. Type the 6-digit code it shows.</Text>
      <TextInput
        style={styles.codeInput}
        value={digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits}
        onChangeText={setCode}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={7}
        placeholder="123 456"
        placeholderTextColor="#3a4150"
        onSubmitEditing={() => void submit()}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <Pressable
          style={[styles.primaryBtn, (busy || digits.length !== 6) && { opacity: 0.5 }]}
          disabled={busy || digits.length !== 6}
          onPress={() => void submit()}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Link PC</Text>}
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onDone}>
          <Text style={styles.secondaryBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DevicesScreen() {
  const { auth, devices, connect, signOut, refreshDevices } = useRelay();
  const router = useRouter();
  const [linking, setLinking] = useState(false);

  const openDevice = (pc: PcSummary) => {
    if (!pc.online) return;
    connect(pc.id);
    router.push(`/remote/${pc.id}`);
  };

  const confirmUnlink = (pc: PcSummary) => {
    Alert.alert(`Unlink “${pc.name}”?`, "It will need a new code to be linked again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: () => {
          if (!auth) return;
          void api.unlinkPc(auth.serverUrl, auth.sessionToken, pc.id).catch(() => {}).then(refreshDevices);
        },
      },
    ]);
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Your PCs</Text>
        {!linking && (
          <Pressable onPress={() => setLinking(true)} hitSlop={8}>
            <Text style={styles.link}>+ Link a PC</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.headerRow}>
        <Text style={styles.subheading} numberOfLines={1}>
          {auth?.email}
        </Text>
        <Pressable onPress={confirmSignOut} hitSlop={8}>
          <Text style={styles.faint}>Sign out</Text>
        </Pressable>
      </View>

      {linking && <LinkPcCard onDone={() => setLinking(false)} />}

      <FlatList
        data={devices}
        keyExtractor={(pc) => pc.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refreshDevices} tintColor={ACCENT} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && item.online && styles.cardPressed, !item.online && { opacity: 0.6 }]}
            onPress={() => openDevice(item)}
            onLongPress={() => confirmUnlink(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <View style={[styles.pill, item.online ? styles.pillOnline : styles.pillOffline]}>
                <View style={[styles.dot, { backgroundColor: item.online ? RELAY : "#6b7280" }]} />
                <Text style={styles.pillText}>{item.online ? "Online" : "Offline"}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>
              {item.lanDevices.length} device{item.lanDevices.length === 1 ? "" : "s"} on its network
            </Text>
            <Text style={styles.cardMetaFaint}>
              Last seen {new Date(item.lastSeen).toLocaleString()} · long-press to unlink
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          linking ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No PCs linked yet. Install Home Relay Agent on your PC, then tap “Link a PC” and enter the code it shows.
              </Text>
              <Pressable style={[styles.primaryBtn, { alignSelf: "center", paddingHorizontal: 28, marginTop: 18, flex: 0 }]} onPress={() => setLinking(true)}>
                <Text style={styles.primaryBtnText}>Link a PC</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0d10", paddingHorizontal: 20, paddingTop: 20 },
  heading: { color: "#f2f4f8", fontSize: 28, fontWeight: "700" },
  subheading: { color: "#8a93a3", fontSize: 14, marginTop: 4, marginBottom: 16, flexShrink: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  link: { color: "#8fb0f5", fontSize: 15, fontWeight: "600" },
  faint: { color: "#6b7280", fontSize: 12, marginBottom: 12 },
  linkCard: { backgroundColor: "#171b22", borderColor: "#262b35", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  codeInput: {
    marginTop: 12,
    backgroundColor: "#0f1217",
    borderColor: "#262b35",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f2f4f8",
    fontSize: 28,
    letterSpacing: 6,
    textAlign: "center",
    paddingVertical: 12,
    fontVariant: ["tabular-nums"],
  },
  error: { color: "#f28b82", fontSize: 13, marginTop: 8 },
  primaryBtn: { flex: 1, backgroundColor: "#2f6fed", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryBtn: { paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: "#262b35", justifyContent: "center" },
  secondaryBtnText: { color: "#b7bec9", fontSize: 15 },
  list: { paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: "#171b22",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262b35",
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#f2f4f8", fontSize: 17, fontWeight: "600" },
  cardMeta: { color: "#b7bec9", fontSize: 13, marginTop: 8 },
  cardMetaFaint: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
  },
  pillOnline: { backgroundColor: "#123227" },
  pillOffline: { backgroundColor: "#262b35" },
  pillText: { color: "#d7dbe3", fontSize: 12, fontWeight: "600" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { paddingTop: 60, paddingHorizontal: 12 },
  emptyText: { color: "#6b7280", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
