# Home Relay — Mobile App

The React Native (Expo) app: shows your PCs, lets you view and control one
PC's screen, and browse/download its files. Talks to the same
[backend](../backend) and [agent](../agent) built earlier in this project —
nothing on the server side changed for this app to exist.

## What's built

- **Devices screen** (`src/app/index.tsx`) — connects to the backend's
  signaling WebSocket, lists every PC that's ever reported in (online/offline
  status, LAN device count, last-seen time), tap one to connect.
- **Remote screen** (`src/app/remote/[deviceId].tsx`) — renders the PC's live
  screen via `RTCView`, and a touch surface over the video maps drag gestures
  to mouse move/down/up events sent over the `input` data channel (see
  "How touch becomes mouse input" below).
- **Files screen** (`src/app/files/[deviceId].tsx`) — browses the PC's
  filesystem starting from drives/quick-access folders, drills into
  directories, and downloads a tapped file straight to the device with a
  progress indicator, then offers to share/save it via the OS share sheet.

## Architecture

```
src/
  app/                        expo-router routes (file-based) — per this
                               project's AGENTS.md convention, routes live
                               here, everything else lives outside app/
    _layout.tsx                 root Stack navigator, wraps everything in
                                 RelayProvider
    index.tsx                    devices list
    remote/[deviceId].tsx         screen view + touch-to-mouse control
    files/[deviceId].tsx          file browser + download

  lib/
    config.ts                   reads EXPO_PUBLIC_* env vars, fails loudly
                                 if missing rather than silently using a
                                 wrong default
    miniEmitter.ts                tiny typed pub-sub standing in for Node's
                                 EventEmitter (not polyfilled in RN by
                                 default) — mirrors the event-based API the
                                 agent's SignalingClient already uses
    signalingClient.ts            mirrors agent/src/signaling/signalingClient.ts:
                                 same auth handshake, same schema-validated
                                 inbound messages, same reconnect-with-backoff.
                                 Difference: role "app", and this side also
                                 requests/receives the device list
    webrtcSession.ts               owns one RTCPeerConnection plus the "input"
                                 and "files" data channels. The phone is
                                 always the *offerer* — mirrors the agent's
                                 own doc comment that it's always the
                                 *answerer*
    fileDownloader.ts              streams a download's chunks straight to
                                 disk via expo-file-system's FileHandle,
                                 instead of buffering the whole file in
                                 memory — same reasoning as the agent's
                                 downloadManager.ts on the other end
    relayContext.tsx               the app-wide React Context: owns the one
                                 long-lived SignalingClient and the current
                                 WebRtcSession, and turns the data channels'
                                 event stream into promise-based
                                 `listFiles()`/`downloadFile()` calls the
                                 Files screen can just `await`
    protocol/
      messages.ts                  mirrors backend/src/types/messages.ts
                                 from the app's side (adds `devices`/
                                 `get_devices`, absent from the agent's copy)
      signalPayload.ts              mirrors agent/src/rtc/signalPayload.ts
                                 exactly — this is the cross-network contract
      inputEvent.ts                 mirrors agent/src/rtc/inputEvent.ts's
                                 shape (plain type here — the agent is the
                                 one validating these, since that's the real
                                 trust boundary)
      fileProtocol.ts                mirrors agent/src/rtc/fileProtocol.ts;
                                 requests are a plain type (we send them),
                                 responses are zod-validated (we receive them
                                 off the data channel — a real boundary)
```

### Why it's split this way

- **The protocol files are hand-mirrored, not shared via a package.** Three
  separate git repos (backend, agent, mobile-app) each define their own copy
  of the wire shapes. That's a real cost — a protocol change means editing
  up to three places — accepted here because a shared npm package/workspace
  across independently-deployed repos is more infrastructure than a
  single-user MVP warrants. Each copy says in a comment which file it
  mirrors.
- **`relayContext.tsx` turns an event stream into promises.** The data
  channel protocol is inherently event-based (a `list-result` arrives some
  time after a `list` request, with no direct call/return relationship in
  the language). Wrapping that in `listFiles(path): Promise<FileEntry[]>`
  means the Files screen just writes `await listFiles(path)` instead of
  managing subscriptions itself — the request/response correlation by
  `requestId` happens once, in one place.
- **Downloads write straight to a `FileHandle`, chunk by chunk.** Buffering
  a whole file in JS memory before writing it would defeat the point of the
  agent's own chunked, backpressured streaming (see agent/README.md). Only
  one download runs at a time here too, matching the agent's own limit.
- **`react-native-webrtc`'s published types are broken for this version**
  (124.0.8): its `lib/typescript` build is missing the compiled
  `vendor/event-target-shim` folder that its own `.d.ts` files import from,
  which breaks `addEventListener`'s type and drops `RTCDataChannel` from the
  package's public exports — even though both exist and work fine at
  runtime (confirmed by reading `src/RTCPeerConnection.ts` directly). Every
  workaround for this is isolated to `webrtcSession.ts` with a comment
  explaining it's a packaging bug, not "we don't know the type."

## Known limitations

- **Single active connection.** Connecting to a second PC (or a second
  phone connecting to the same PC) replaces rather than coexists — matches
  the agent's own single-viewer limitation.
- **Keyboard input isn't wired into the UI yet.** The protocol
  (`keydown`/`keyup`) and the agent's handling of it both exist; this app
  doesn't have an on-screen keyboard trigger yet — see agent/README.md's
  "What's next" for the key-name mapping this will need.
- **`react-native-webrtc` is flagged "untested on New Architecture"** by
  React Native Directory (`expo-doctor` surfaces this). Expo SDK 57 / RN
  0.86 default to the New Architecture. It's expected to work — react-native-
  webrtc 124.x is a recent release with new-architecture support — but this
  hasn't been confirmed against a real build in this environment (see
  "What wasn't verified" below).
- **Shared-token auth, same as the backend.** `EXPO_PUBLIC_*` env vars are
  inlined into the JS bundle at build time — not secret once built, which is
  consistent with (not worse than) the backend's own MVP auth model.

## Run it

This app uses `react-native-webrtc`, which has native code — it cannot run
in plain Expo Go. It needs a custom **development build**.

```bash
npm install
cp .env.example .env   # fill in your PC's LAN IP and the shared AUTH_TOKEN
```

**Android** (buildable directly from Windows with Android Studio installed):
```bash
npx expo run:android
```
This generates the native `android/` project (Continuous Native Generation —
never edit that folder by hand; configure native behavior via `app.json`
and config plugins instead) and installs a development build on a connected
device or emulator. After the first build, `npx expo start` reconnects to
it for fast-refresh development.

**iOS** (via EAS Build's cloud service, since this machine has no Mac):
```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios
```
Needs a free Expo account and, for a real device (not the simulator), an
Apple Developer account for provisioning. See
[Expo's EAS Build docs](https://docs.expo.dev/build/introduction/) for the
full walkthrough — this project doesn't need anything beyond the default
setup `eas build:configure` generates.

Type-check: `npm run typecheck`

## Verified so far

- **`npx tsc --noEmit`** passes cleanly across every screen and lib file —
  including working around `react-native-webrtc`'s broken published types
  without suppressing real errors elsewhere.
- **`npx expo-doctor`** — 20/21 checks pass; the one flag is the
  New-Architecture compatibility note above, not a config error.
- **`npx expo export --platform android`** — a real Metro bundle build (not
  just a syntax check): resolved every import across all three protocol
  mirrors, `relayContext.tsx`, and every screen; `expo-router` correctly
  discovered all three routes; produced a working `.hbc` bundle.

## What wasn't verified (and why)

Actually connecting this app to the real backend and agent — seeing live
video render in `RTCView`, dragging to move the real mouse, downloading a
real file — needs a physical Android/iOS device or an emulator with Google
Play services (for the dev client) and a WebRTC-capable runtime. Neither is
available in this environment. Everything server-side of this app (backend
signaling, the agent's screen capture, input injection, and file transfer)
**was** verified end-to-end against real running processes — see
`backend/README.md` and `agent/README.md`'s "Verified so far" sections — so
what's unverified here is specifically the on-device React Native runtime
behavior, not the protocol or backend/agent logic this app depends on.

**Before relying on this app**, run it on a real device via
`npx expo run:android` and walk through: does the device list populate, does
the video render and respond to drag, does a small file download and match
its original. If anything breaks, the mismatch is most likely in
`webrtcSession.ts`'s workarounds for react-native-webrtc's type/runtime
quirks — start there.

## What's next

- On-device verification (above).
- An on-screen keyboard trigger wired to `sendInput({ type: "keydown"/"keyup", ... })`.
- A proper per-install device id (`config.ts`'s `deviceId` is currently a
  hardcoded `"phone-1"`).
