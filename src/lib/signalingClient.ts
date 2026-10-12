import { MiniEmitter } from "./miniEmitter";
import { serverMessageSchema } from "./protocol/messages";
import type { AppMessage, PcSummary } from "./protocol/messages";

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

export interface SignalingClientOptions {
  url: string;
  sessionToken: string;
}

/** Backend close code meaning "this sign-in is no longer valid". */
const CLOSE_UNAUTHORIZED = 4003;

interface SignalingClientEvents {
  authenticated: [];
  devices: [pcs: PcSummary[]];
  signal: [from: string, payload: unknown];
  error: [message: string];
  disconnected: [];
  /** Signed out elsewhere or session expired — show sign-in, don't retry. */
  unauthorized: [];
}

/**
 * Mirrors agent/src/signaling/signalingClient.ts: owns the WebSocket,
 * authenticates on connect, validates every inbound message, reconnects
 * with backoff on drop. The one difference is role ("app" here, "pc"
 * there) and that this side also requests/receives the device list.
 */
export class SignalingClient extends MiniEmitter<SignalingClientEvents> {
  private ws: WebSocket | null = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private closedByCaller = false;

  constructor(private readonly options: SignalingClientOptions) {
    super();
  }

  connect(): void {
    this.closedByCaller = false;
    this.open();
  }

  send(message: AppMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  requestDevices(): void {
    this.send({ type: "get_devices" });
  }

  close(): void {
    this.closedByCaller = true;
    this.ws?.close();
  }

  private open(): void {
    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.send({ type: "auth", role: "app", sessionToken: this.options.sessionToken });
    };

    ws.onmessage = (event) => this.handleMessage(event.data);

    ws.onclose = (event) => {
      if (event.code === CLOSE_UNAUTHORIZED) {
        this.closedByCaller = true;
        return void this.emit("unauthorized");
      }
      this.emit("disconnected");
      if (!this.closedByCaller) this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.emit("error", "WebSocket error");
    };
  }

  private handleMessage(raw: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(raw));
    } catch {
      return void this.emit("error", "received malformed JSON from backend");
    }

    const result = serverMessageSchema.safeParse(json);
    if (!result.success) {
      return void this.emit("error", "received a message that failed schema validation");
    }

    const message = result.data;
    switch (message.type) {
      case "auth_ok":
        this.emit("authenticated");
        this.requestDevices();
        return;
      case "devices":
        return void this.emit("devices", message.pcs);
      case "signal":
        return void this.emit("signal", message.from, message.payload);
      case "error":
        return void this.emit("error", `backend error: ${message.message}`);
      case "pong":
        return;
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    setTimeout(() => {
      if (!this.closedByCaller) this.open();
    }, delay);
  }
}
