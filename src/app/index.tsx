import React from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useRelay } from "../lib/relayContext";
import type { PcSummary } from "../lib/protocol/messages";

const ACCENT = "#5b8def";
const RELAY = "#3ee6ab";

export default function DevicesScreen() {
  const { devices, connect } = useRelay();
  const router = useRouter();

  const openDevice = (pc: PcSummary) => {
    connect(pc.id);
    router.push(`/remote/${pc.id}`);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Your PCs</Text>
      <Text style={styles.subheading}>
        {devices.length === 0 ? "Waiting for a PC agent to come online…" : `${devices.length} PC(s) reporting in`}
      </Text>

      <FlatList
        data={devices}
        keyExtractor={(pc) => pc.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={ACCENT} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => openDevice(item)}
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
            <Text style={styles.cardMetaFaint}>Last seen {new Date(item.lastSeen).toLocaleTimeString()}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No PCs yet. Make sure the agent is running and pointed at the same backend as this app.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0d10", paddingHorizontal: 20, paddingTop: 20 },
  heading: { color: "#f2f4f8", fontSize: 28, fontWeight: "700" },
  subheading: { color: "#8a93a3", fontSize: 14, marginTop: 4, marginBottom: 16 },
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
