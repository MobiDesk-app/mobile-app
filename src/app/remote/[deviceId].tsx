import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, Pressable, type LayoutChangeEvent } from "react-native";
import { RTCView } from "react-native-webrtc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRelay } from "../../lib/relayContext";

/**
 * Touches map to mouse events as a 0..1 fraction of this surface's own
 * measured size (see onLayout below) — not the PC's screen resolution,
 * which this app never needs to know. The agent turns the ratio back into
 * real pixels using its own screen size (agent/electron/inputInjector.ts).
 */
export default function RemoteScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const router = useRouter();
  const { remoteStream, connectionState, sendInput, disconnect } = useRelay();
  const [surfaceSize, setSurfaceSize] = useState({ width: 1, height: 1 });
  const surfaceSizeRef = useRef(surfaceSize);
  surfaceSizeRef.current = surfaceSize;

  const onSurfaceLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSurfaceSize({ width, height });
  };

  const sendMove = (x: number, y: number) => {
    const { width, height } = surfaceSizeRef.current;
    sendInput({
      type: "mousemove",
      xRatio: Math.min(1, Math.max(0, x / width)),
      yRatio: Math.min(1, Math.max(0, y / height)),
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        sendMove(event.nativeEvent.locationX, event.nativeEvent.locationY);
        sendInput({ type: "mousedown", button: "left" });
      },
      onPanResponderMove: (event) => {
        sendMove(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderRelease: () => {
        sendInput({ type: "mouseup", button: "left" });
      },
      onPanResponderTerminate: () => {
        sendInput({ type: "mouseup", button: "left" });
      },
    })
  ).current;

  const goToFiles = () => {
    router.push(`/files/${deviceId}`);
  };

  const goBack = () => {
    disconnect();
    router.back();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.videoWrap} onLayout={onSurfaceLayout} {...panResponder.panHandlers}>
        {remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} style={styles.video} objectFit="contain" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {connectionState === "connecting" ? "Connecting…" : "Waiting for video…"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.toolbar}>
        <Pressable style={styles.toolbarButton} onPress={goBack}>
          <Text style={styles.toolbarButtonText}>Disconnect</Text>
        </Pressable>
        <Text style={styles.status}>{connectionState}</Text>
        <Pressable style={[styles.toolbarButton, styles.toolbarButtonPrimary]} onPress={goToFiles}>
          <Text style={styles.toolbarButtonText}>Files</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  videoWrap: { flex: 1 },
  video: { flex: 1, backgroundColor: "#000" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "#8a93a3", fontSize: 14 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#12141a",
  },
  toolbarButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#262b35",
  },
  toolbarButtonPrimary: { backgroundColor: "#2f6fed" },
  toolbarButtonText: { color: "#f2f4f8", fontWeight: "600", fontSize: 13 },
  status: { color: "#8a93a3", fontSize: 12, textTransform: "capitalize" },
});
