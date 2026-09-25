import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { MediaStream } from "react-native-webrtc";
import { config } from "./config";
import { SignalingClient } from "./signalingClient";
import { WebRtcSession } from "./webrtcSession";
import { ActiveDownload } from "./fileDownloader";
import type { PcSummary } from "./protocol/messages";
import type { InputEvent } from "./protocol/inputEvent";
import type { FileEntry } from "./protocol/fileProtocol";

function makeRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type ConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";

export interface DownloadProgress {
  name: string;
  receivedBytes: number;
  totalBytes: number;
}

interface RelayContextValue {
  devices: PcSummary[];
  connectionState: ConnectionState;
  connectedDeviceId: string | null;
  remoteStream: MediaStream | null;
  lastError: string | null;
  connect: (deviceId: string) => void;
  disconnect: () => void;
  sendInput: (event: InputEvent) => void;
  listFiles: (path: string | null) => Promise<FileEntry[]>;
  downloadFile: (path: string, onProgress?: (p: DownloadProgress) => void) => Promise<{ uri: string; name: string }>;
  cancelDownload: () => void;
}

const RelayContext = createContext<RelayContextValue | null>(null);

interface PendingList {
  resolve: (entries: FileEntry[]) => void;
  reject: (err: Error) => void;
}

export function RelayProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [devices, setDevices] = useState<PcSummary[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const sessionRef = useRef<WebRtcSession | null>(null);
  const pendingListsRef = useRef<Map<string, PendingList>>(new Map());
  const activeDownloadRef = useRef<{
    download: ActiveDownload;
    onProgress?: (p: DownloadProgress) => void;
    resolve: (result: { uri: string; name: string }) => void;
    reject: (err: Error) => void;
  } | null>(null);

  useEffect(() => {
    const signaling = new SignalingClient({
      url: config.backendUrl,
      token: config.authToken,
      deviceId: config.deviceId,
      name: "Phone",
    });
    signaling.on("devices", (pcs) => setDevices(pcs));
    signaling.on("error", (message) => setLastError(message));
    signaling.on("signal", (from, payload) => {
      if (sessionRef.current && from === connectedDeviceIdRef.current) {
        void sessionRef.current.handleIncomingSignal(payload);
      }
    });
    signaling.connect();
    signalingRef.current = signaling;

    const interval = setInterval(() => signaling.requestDevices(), 5000);
    return () => {
      clearInterval(interval);
      signaling.close();
    };
    // Intentionally runs once — signaling is a single long-lived connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read inside the signaling 'signal' handler above without re-subscribing
  // every time the connected device changes.
  const connectedDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    connectedDeviceIdRef.current = connectedDeviceId;
  }, [connectedDeviceId]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setConnectedDeviceId(null);
    setRemoteStream(null);
    setConnectionState("closed");
  }, []);

  const connect = useCallback(
    (deviceId: string) => {
      const signaling = signalingRef.current;
      if (!signaling) return;

      sessionRef.current?.close();
      setRemoteStream(null);
      setConnectionState("connecting");
      setConnectedDeviceId(deviceId);

      const session = new WebRtcSession({
        targetDeviceId: deviceId,
        sendSignal: (target, payload) => signaling.send({ type: "signal", target, payload }),
      });

      session.on("remoteStream", (stream) => setRemoteStream(stream));
      session.on("error", (message) => setLastError(message));
      session.on("connectionStateChange", (state) => {
        if (state === "connected") setConnectionState("connected");
        else if (state === "failed" || state === "disconnected") setConnectionState("failed");
      });

      session.on("fileResponse", (response) => {
        if (response.type === "list-result") {
          pendingListsRef.current.get(response.requestId)?.resolve(response.entries);
          pendingListsRef.current.delete(response.requestId);
        } else if (response.type === "list-error") {
          pendingListsRef.current.get(response.requestId)?.reject(new Error(response.message));
          pendingListsRef.current.delete(response.requestId);
        } else if (response.type === "download-error") {
          const pending = activeDownloadRef.current;
          if (!pending || pending.download.requestId !== response.requestId) return;
          pending.download.abort();
          activeDownloadRef.current = null;
          pending.reject(new Error(response.message));
        } else if (response.type === "download-complete") {
          const pending = activeDownloadRef.current;
          if (!pending || pending.download.requestId !== response.requestId) return;
          pending.download.finish();
          activeDownloadRef.current = null;
          pending.resolve({ uri: pending.download.file.uri, name: pending.download.file.name });
        }
      });

      session.on("fileChunk", (data) => {
        const pending = activeDownloadRef.current;
        if (!pending) return;
        pending.download.writeChunk(data);
        pending.onProgress?.({
          name: pending.download.file.name,
          receivedBytes: pending.download.receivedBytes,
          totalBytes: pending.download.totalBytes,
        });
      });

      sessionRef.current = session;
      void session.connect();
    },
    []
  );

  const sendInput = useCallback((event: InputEvent) => {
    sessionRef.current?.sendInput(event);
  }, []);

  const listFiles = useCallback((path: string | null): Promise<FileEntry[]> => {
    return new Promise((resolve, reject) => {
      const session = sessionRef.current;
      if (!session) return reject(new Error("not connected to a PC"));
      const requestId = makeRequestId();
      pendingListsRef.current.set(requestId, { resolve, reject });
      session.sendFileRequest({ type: "list", requestId, path });
    });
  }, []);

  const downloadFile = useCallback(
    (path: string, onProgress?: (p: DownloadProgress) => void): Promise<{ uri: string; name: string }> => {
      return new Promise((resolve, reject) => {
        const session = sessionRef.current;
        if (!session) return reject(new Error("not connected to a PC"));
        if (activeDownloadRef.current) return reject(new Error("another download is already in progress"));

        const requestId = makeRequestId();
        const fallbackName = path.split(/[\\/]/).pop() ?? "download";

        // Wait for "download-start" (which carries the real name/size) before
        // creating the ActiveDownload; unsubscribe immediately after so this
        // one-shot listener doesn't accumulate across downloads.
        const onceStarted = (response: { type: string; requestId: string; name?: string; size?: number }) => {
          if (response.type !== "download-start" || response.requestId !== requestId) return;
          session.off("fileResponse", onceStarted as never);
          const download = ActiveDownload.begin(requestId, response.name ?? fallbackName, response.size ?? 0);
          activeDownloadRef.current = { download, onProgress, resolve, reject };
        };
        session.on("fileResponse", onceStarted as never);
        session.sendFileRequest({ type: "download", requestId, path });
      });
    },
    []
  );

  const cancelDownload = useCallback(() => {
    const pending = activeDownloadRef.current;
    if (!pending) return;
    sessionRef.current?.sendFileRequest({ type: "cancel-download", requestId: pending.download.requestId });
    pending.download.abort();
    activeDownloadRef.current = null;
  }, []);

  const value: RelayContextValue = {
    devices,
    connectionState,
    connectedDeviceId,
    remoteStream,
    lastError,
    connect,
    disconnect,
    sendInput,
    listFiles,
    downloadFile,
    cancelDownload,
  };

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>;
}

export function useRelay(): RelayContextValue {
  const ctx = useContext(RelayContext);
  if (!ctx) throw new Error("useRelay must be used within a RelayProvider");
  return ctx;
}
