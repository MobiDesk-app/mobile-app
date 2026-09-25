import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRelay, type DownloadProgress } from "../../lib/relayContext";
import type { FileEntry } from "../../lib/protocol/fileProtocol";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function FilesScreen() {
  useLocalSearchParams<{ deviceId: string }>();
  const router = useRouter();
  const { listFiles, downloadFile, cancelDownload } = useRelay();

  // null = roots (drives + quick-access folders). Breadcrumb is just the
  // stack of paths visited, matching how a folder-drilling UI is used.
  const [pathStack, setPathStack] = useState<Array<string | null>>([null]);
  const currentPath = pathStack[pathStack.length - 1] ?? null;

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<DownloadProgress | null>(null);

  const load = useCallback((path: string | null) => {
    setLoading(true);
    setError(null);
    listFiles(path)
      .then((result) => setEntries(result))
      .catch((err) => setError(err instanceof Error ? err.message : "failed to list directory"))
      .finally(() => setLoading(false));
  }, [listFiles]);

  useEffect(() => {
    load(currentPath);
  }, [currentPath, load]);

  const openEntry = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setPathStack((stack) => [...stack, entry.path]);
      return;
    }
    setDownload({ name: entry.name, receivedBytes: 0, totalBytes: entry.size });
    downloadFile(entry.path, (progress) => setDownload(progress))
      .then(async ({ uri, name }) => {
        setDownload(null);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          Alert.alert("Downloaded", `${name} saved to the app's documents.`, [
            { text: "OK" },
            { text: "Share / Save…", onPress: () => Sharing.shareAsync(uri) },
          ]);
        } else {
          Alert.alert("Downloaded", `${name} saved to the app's documents.`);
        }
      })
      .catch((err) => {
        setDownload(null);
        Alert.alert("Download failed", err instanceof Error ? err.message : String(err));
      });
  };

  const goUp = () => {
    if (pathStack.length > 1) {
      setPathStack((stack) => stack.slice(0, -1));
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.breadcrumbRow}>
        <Pressable onPress={goUp} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.path} numberOfLines={1}>
          {currentPath ?? "Quick access"}
        </Text>
      </View>

      {download && (
        <View style={styles.downloadBar}>
          <Text style={styles.downloadText} numberOfLines={1}>
            Downloading {download.name} — {formatBytes(download.receivedBytes)}
            {download.totalBytes > 0 ? ` / ${formatBytes(download.totalBytes)}` : ""}
          </Text>
          <Pressable
            onPress={() => {
              cancelDownload();
              setDownload(null);
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loading} color="#5b8def" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.path}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => openEntry(item)}
            >
              <Text style={styles.rowIcon}>{item.isDirectory ? "📁" : "📄"}</Text>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {!item.isDirectory && <Text style={styles.rowMeta}>{formatBytes(item.size)}</Text>}
              </View>
              {!item.isDirectory && <Text style={styles.downloadHint}>Download</Text>}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>This folder is empty.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0d10" },
  breadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#262b35", borderRadius: 8 },
  backButtonText: { color: "#f2f4f8", fontSize: 13, fontWeight: "600" },
  path: { color: "#8a93a3", fontSize: 13, flex: 1 },
  downloadBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1c2740",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  downloadText: { color: "#d7dbe3", fontSize: 12, flex: 1, marginRight: 8 },
  cancelText: { color: "#ff9a5c", fontSize: 12, fontWeight: "600" },
  loading: { marginTop: 40 },
  error: { color: "#ff9a5c", textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1c2029",
    gap: 12,
  },
  rowPressed: { opacity: 0.6 },
  rowIcon: { fontSize: 20 },
  rowTextWrap: { flex: 1 },
  rowName: { color: "#f2f4f8", fontSize: 15 },
  rowMeta: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  downloadHint: { color: "#5b8def", fontSize: 12, fontWeight: "600" },
  empty: { color: "#6b7280", textAlign: "center", marginTop: 40 },
});
