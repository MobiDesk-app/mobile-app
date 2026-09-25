import { RTCPeerConnection, RTCIceCandidate } from "react-native-webrtc";
import type { MediaStream } from "react-native-webrtc";
import { MiniEmitter } from "./miniEmitter";
import { isSignalPayload } from "./protocol/signalPayload";
import type { SignalPayload, IceCandidateInit } from "./protocol/signalPayload";
import type { InputEvent } from "./protocol/inputEvent";
import { fileResponseSchema } from "./protocol/fileProtocol";
import type { FileRequest, FileResponse } from "./protocol/fileProtocol";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// react-native-webrtc@124's published `lib/typescript` build is missing its
// `vendor/event-target-shim` types (present in `src/`, absent from the
// compiled output), which breaks the type of `addEventListener` on
// RTCPeerConnection/RTCDataChannel and drops RTCDataChannel from the
// package's public type exports entirely — even though both exist and work
// fine at runtime. `RtcAny` documents every cast below as working around
// that specific upstream packaging bug, not as "we don't know the type".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RtcAny = any;
type DataChannel = ReturnType<RTCPeerConnection["createDataChannel"]>;

interface WebRtcSessionEvents {
  remoteStream: [stream: MediaStream];
  connectionStateChange: [state: string];
  fileResponse: [response: FileResponse];
  fileChunk: [data: Uint8Array];
  error: [message: string];
}

export interface WebRtcSessionOptions {
  targetDeviceId: string;
  sendSignal: (target: string, payload: SignalPayload) => void;
}

/**
 * The phone is always the *offerer* (mirrors agent/electron/renderer/
 * capture.ts's doc comment that the agent only ever answers). Owns one
 * RTCPeerConnection plus the "input" and "files" data channels, created up
 * front so they're negotiated in the same offer as the video track.
 */
export class WebRtcSession extends MiniEmitter<WebRtcSessionEvents> {
  private pc: RTCPeerConnection;
  readonly inputChannel: DataChannel;
  readonly filesChannel: DataChannel;

  constructor(private readonly options: WebRtcSessionOptions) {
    super();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.inputChannel = this.pc.createDataChannel("input");
    this.filesChannel = this.pc.createDataChannel("files");

    (this.pc as RtcAny).addEventListener("icecandidate", (event: RtcAny) => {
      if (!event.candidate) return;
      const c = event.candidate.toJSON();
      this.sendSignal({
        kind: "ice-candidate",
        candidate: { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null },
      });
    });

    (this.pc as RtcAny).addEventListener("track", (event: RtcAny) => {
      const stream = event.streams[0];
      if (stream) this.emit("remoteStream", stream);
    });

    (this.pc as RtcAny).addEventListener("connectionstatechange", () => {
      this.emit("connectionStateChange", this.pc.connectionState);
    });

    (this.filesChannel as RtcAny).addEventListener("message", (event: RtcAny) => {
      if (typeof event.data === "string") {
        this.handleFileControlMessage(event.data);
      } else {
        this.emit("fileChunk", new Uint8Array(event.data as ArrayBuffer));
      }
    });
  }

  /** Starts the handshake: creates and sends an offer targeting the PC. */
  async connect(): Promise<void> {
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ kind: "offer", sdp: offer.sdp ?? "" });
  }

  /** Feed this from the signaling client's `signal` event for this session's target. */
  async handleIncomingSignal(payload: unknown): Promise<void> {
    if (!isSignalPayload(payload)) {
      this.emit("error", "received a signal with an unrecognized payload");
      return;
    }
    if (payload.kind === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
    } else if (payload.kind === "ice-candidate") {
      await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate as IceCandidateInit));
    }
    // "offer" is never expected here — the phone always initiates.
  }

  sendInput(event: InputEvent): void {
    if (this.inputChannel.readyState !== "open") return;
    this.inputChannel.send(JSON.stringify(event));
  }

  sendFileRequest(request: FileRequest): void {
    if (this.filesChannel.readyState !== "open") return;
    this.filesChannel.send(JSON.stringify(request));
  }

  close(): void {
    this.pc.close();
  }

  private sendSignal(payload: SignalPayload): void {
    this.options.sendSignal(this.options.targetDeviceId, payload);
  }

  private handleFileControlMessage(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return void this.emit("error", "received malformed file-response JSON");
    }
    const result = fileResponseSchema.safeParse(json);
    if (!result.success) {
      return void this.emit("error", "received a file response that failed validation");
    }
    this.emit("fileResponse", result.data);
  }
}
