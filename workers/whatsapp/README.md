# HYPE WhatsApp worker

Private Cloudflare Worker service with one SQLite Durable Object per linked WhatsApp
account. The protocol engine is Rust compiled to WebAssembly. Messaging runs in the
Worker; audio/video calls additionally use the private, on-demand native relay container
described below.

Each object owns a separate WASM instance, JS handle table, and async task queue. The
generated static factory prevents account I/O from sharing wasm-bindgen's usual module
singleton. The WASM module itself is compiled once by Cloudflare. The instance
initializer installs SDK wall and monotonic clocks before use; Workers clocks advance at
I/O boundaries. HTTP adapters use `redirect: "manual"` and check status themselves
because Workers rejects `redirect: "error"`.

Hype passes its server deployment stage to `start(account, stage)`. Each account
persists that stage for reconnects and advertises a desktop companion named `HYPE` in
production, or `HYPE {stage}` elsewhere (for example `HYPE preview`). The SDK sends this
identity only during pairing. An existing linked device must be re-linked for WhatsApp
to show the new name; updating the service alone does not rename or unlink an existing
device.

## Build and test

Install Rust with the `wasm32-unknown-unknown` target, Bun, and `wasm-bindgen-cli`
version 0.2.130 (matching Cargo.lock). Then:

```sh
bun install
bunx turbo run check --filter=@hype/whatsapp
bunx turbo run test --filter=@hype/whatsapp
# Restore the normal WASM variant after qualification tests.
bunx turbo run build --filter=@hype/whatsapp
```

Tests build a `qualification` variant containing synthetic storage contract checks.
`build` rebuilds the production variant, removes those test exports, and performs a
Wrangler dry-run. Always build before deployment.

The independent desktop client is TjikOS `whatsover`. Hosted engine details are in
`packages/whatsapp-engine/README.md`.

## Private service API

There is no public HTTP API: `workers_dev` and preview URLs are disabled, and `fetch`
returns 404. An authorized Hype server uses a service binding:

```toml
[[services]]
binding = "WHATSOVER"
service = "hype-whatsover-prod"
```

RPC methods are `start(account)`, `stop(account)`, `status(account)`,
`send(account, { requestId, to, text, replyTo?, reaction?, attachmentId? })`,
`inbox(account, after, limit)`, `outbox(account, limit)`, `result(account, requestId)`,
`profile(account, jid)`, `upload(account, options, bytes)`, and
`media(account, chat, target)`. `probe()` checks SDK clocks, Rust timers, and
randomness. `diagnostics(account)` returns bounded SDK source locations and allowlisted
error categories, without log text or secrets. Hype must authorize the user before
calling them and derive the account ID on the server. Never expose this binding through
an unguarded generic RPC proxy.

Starting an account enables a recovery alarm; stopping disables it without unlinking the
device. Outgoing WhatsApp WebSockets cannot hibernate, so an enabled 24/7 account uses
active Durable Object duration. No connection starts on deploy.

## Native archive state

`archive(account, chat, archived)` sends the SDK's authenticated `regular_low` app-state
archive/unarchive action. Native `ArchiveUpdate` events are persisted through the
synchronous Rust-to-SQLite host callback. Verified phone/LID mappings propagate the same
state to both identities, including mappings received later. Each connected session
rebuilds the archive projection once from native app state; failed rebuilds retry, and
later native-client changes follow the same event path.
`snapshot(account, messageAfter, archiveAfter)` exposes up to 100 archive changes on an
independent cursor. Public HTTP continues to return 404.

## Storage and failure behavior

The Rust backend implements the SDK's Signal, app-state, protocol, device, and
message-secret traits against DO SQLite. Related changes use one synchronous transaction
followed by `storage.sync()`. Read/modify/write sequences do not yield until the whole
batch has been submitted. Pending inbound records use bounded reads, exact-byte
revisions, and conditional replacement/deletion.

The inbox commits decrypted messages before ACK. The send journal records intent before
I/O, rejects conflicting request IDs, and preserves uncertain outcomes after eviction.
Session credentials are held only in DO storage. Local tests use synthetic fixtures; any
live local runtime state must use a private directory outside this repository.

The send surface supports text, stored-message replies, reaction updates/removal,
images, WebP stickers, and Ogg Opus voice notes. Reply targets are resolved by
account/chat/sender/message ID; callers cannot supply arbitrary quote bodies.
Idempotency covers the recipient, text, quote, reaction, and opaque attachment ID.
Successful sends are also journaled as local conversation entries.

Media uploads are encrypted by the SDK. Only the opaque staged ID and display metadata
reach Hype; CDN URLs and cryptographic keys stay in private DO storage. Staged
descriptors expire after 24 hours. Uploads/downloads are capped at 8 MiB, stickers at
512 KiB, and voice recordings at 10 minutes. Worker HTTP bodies have a 16 MiB hard cap
before entering WASM. The SDK buffered download path decrypts in place; its synchronous
streaming DownloadLimits are intentionally not advertised for Fetch. Declared sizes are
checked before download and verified bytes are checked afterward. Media operations
serialize per account to bound memory. View-once content is neither downloaded nor
quoted.

Inbox projections backfill existing private payloads without exposing protocol
credentials. Unknown payloads retain their sequence as unsupported so polling continues.
Profile lookup combines contact-sync names, push names, group subjects, usernames, and
SDK-provided PN/LID aliases. Thumbnail fetches accept only HTTPS WhatsApp/CDN hosts,
reject redirects, and cap bodies at 128 KiB. Missing/private photos stay null. Display
profiles are cached for an hour; contact-sync updates invalidate affected aliases.
Contact display updates are drained during status polls, alarms, and clean shutdown;
unlike inbound message content, an update just before an abrupt process loss is not
guaranteed durable.

Deployment and local runtime tests do not by themselves prove WhatsApp operation on
Cloudflare. Final qualification requires QR linking, an approved send, an incoming
reply, and recovery after a service restart, through Hype's admin UI.

An unlinked handshake has reached `PairingQrCode` on the deployed service and on the
native CLI. This confirms that Cloudflare can open the WhatsApp connection and complete
the initial handshake; it does not yet prove linked message delivery. The deployed
service also passed an unlinked stop/start check: it produced a new pairing reference
while preserving the device's Noise key, identity key, and advertising secret in SQLite.
The check compared those values only in memory, sent no messages, and stopped the
qualification account afterward. Linked-session recovery still requires pairing and the
end-to-end checks above.

## Voice and video call implementation boundary

The browser, account bridge and native relay implement direct calls. The pinned SDK
documents `voip-control`, portable `voip-mlow`/`voip-encoded`, and `voip-relay-native`.
See [SDK voice calls](https://whatsapp-rust.jlucaso.com/guides/voip-calls). Its
`RelayTransportProvider` can supply a packet channel independently of account
storage/signaling. `RelayMediaChannelFactory::new(address, runtime)` supplies the native
UDP/DTLS/SCTP channel, so a private, on-demand native relay can keep account credentials
in the existing Durable Object.

A direct browser RTCPeerConnection is not yet qualified: the native implementation skips
remote DTLS certificate verification, and `RelayEndpointParams` carries ICE credentials
but no remote certificate fingerprint. Browsers cannot apply that skip. Do not ship a
Call control claiming working audio based only on SDK API availability. The bounded
authenticated relay channel is implemented in `packages/whatsapp-relay-native`, with its
private on-demand container service in `workers/whatsapp-relay`. `src/relay.ts` and the
engine's `wasm/relay.rs` implement the host and Rust transport seams, including
migration, bounded receive queues, loss accounting and cleanup. Synthetic workerd tests
exercise packets through the actual WASM trait. The account lifecycle installs
`configureRelay` with the private relay binding. The WASM call controller exposes
start/answer, PCM input, PCM/Opus output, mute, reject and remote termination.
Generation checks prevent late cleanup from clearing a newer call. Incoming offers are
bounded and creator-checked.

The account's browser voice channel uses single-use, origin-bound tickets and durable
attempt IDs to prevent automatic redials. It limits frames and commands, ends calls on
missed heartbeats/disconnect, and drains pending WASM borrows before shutdown. A
separate upgrade-only gateway lives in `workers/whatsapp-calls`; account RPC and the
native relay stay private.

The bridge prewarms the native relay when a new messaging/call view opens on a connected
account, or when the existing call-state poll first observes a new incoming offer (the
current UI polls every three seconds). If the account is still connecting, view
prewarming waits for a connected snapshot. Viewer heartbeats and repeated snapshots of
the same offer do not refresh the relay. Startup runs in the background, coalesces
concurrent requests, and is limited to one attempt per 30 seconds per live account
object. It only checks container health: no call signalling, media connection,
microphone or camera is started. Failures do not block the UI; actual call setup still
performs its normal startup check. The relay retains its existing 60-second inactivity
timeout. Deploy the relay's private prewarm endpoint before the updated account bridge.

Hype now supplies browser microphone/playback and visible start/answer/decline, mute and
hang-up controls. Its AudioWorklet produces 960-sample, 16 kHz PCM frames; playback
accepts PCM and WebCodecs Opus with bounded queues. Local mute gates microphone tracks
immediately. Cancellation/navigation release media and close the account voice socket. A
browser without the required audio APIs reports the failure instead of leaving an
inaudible call running.

Synthetic Chromium checks exercise capture, PCM and Opus playback, microphone cleanup,
and all five themes at desktop/mobile widths. These checks do not prove interoperability
with an official WhatsApp client: a separately authorized live call is still required
for each media mode before claiming end-to-end interoperability. The relay's fixed STUN
probe qualifies UDP egress without any WhatsApp traffic; it is not proof of a working
WhatsApp call. Keep credentials and signaling in the account DO. Do not expose the
relay's WebSocket or token to the browser.

Cloudflare's default deferred code update can retain the previous account-object code
for five minutes while its WhatsApp socket is active. A successful Worker upload does
not establish that an existing account has adopted the new methods. Verify
`callSnapshot` and connection recovery after that grace period. The existing one-minute
recovery alarm resumes the paired session after reset.

Video-from-start calls use the SDK's H.264 source/sink for outgoing and incoming direct
calls. The browser encodes Constrained Baseline Annex-B at 640x360/15fps, keeps camera
permission tied to explicit video start/answer actions, and provides local preview,
remote video, camera-off, microphone mute and hang-up. Voice-only calls do not open the
camera. Mid-call audio-to-video upgrades and group video are not implemented.

For video calls, browser PCM is prefixed with byte 0. Video packets in either direction
are byte 2, a keyframe flag, quarter-turn orientation, a big-endian u32 90kHz capture
timestamp, and one Annex-B access unit (maximum 512 KiB). Byte 3 requests a new local
keyframe; byte 4 plus a boolean reports peer camera state. Browser `keyframe` commands
request a peer keyframe; `video-ack` bounds the bridge to four outstanding video frames.
Video queues and codec queues are bounded; decoder loss asks for recovery. Existing
voice-only PCM framing remains compatible. Media is ephemeral and is not stored in the
DO.

Synthetic browser loopback verifies actual H.264 encode/decode, camera-off and resume,
audio alongside video, cleanup, and all five themes at mobile/desktop widths. These
checks do not yet prove live phone video interoperability.

## GIF picker integration

Hype can copy compatible media from an organisation's Telegram library into this account
using the existing private `upload` RPC. `animated: true` on an MP4 video sets
WhatsApp's native GIF-playback flag; message projections preserve it for looping
previews. WebP stickers retain the existing 512 KiB limit. Telegram TGS and WebM
stickers require conversion and are excluded from WhatsApp results. Source/destination
authorisation and catalogue caching belong to Hype; this Worker receives only bounded
file bytes and retains its existing immutable send journal.

The browser sends on an explicit picker selection, displays an optimistic message and
reconciles its checkmark with the returned receipt. Uncertain sends are not retried
automatically. `tests/gif-playback.test.ts` verifies the normal WASM projection for GIFs
and ordinary videos.
