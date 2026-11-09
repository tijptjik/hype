# Hype Telegram bridge

A private Cloudflare Worker with one SQLite Durable Object per organisation-owned
messaging account. The implementation uses TypeScript, mtcute and a statically bundled
crypto WASM module. It connects to Telegram over MTProto WebSockets; it is not a
Telegram bot and does not require a persistent Linux host.

Hype selects the account only after checking organisation membership or scoped
administration. The bridge never accepts browser credentials or browser-supplied
organisation ownership. Public HTTP requests return 404; Hype uses a private service
binding named `TELEGRAM`.

## State and connection lifetime

D1 stores organisation accounts, user preferences and verified recipient identities,
conversation/message projections, and audited send intents. The account Durable Object
stores Telegram protocol/session data, a replay journal, attachments, and outbox
deduplication. Session credentials never enter D1 or browser responses.

Each inbox/configuration tab renews a lease. Operators share one platform session.
Leases expire after 75 seconds, with a 30-second idle grace period. Suspension retains
the login. A subsequent viewer resumes enabled accounts and catches up. No-viewer
accounts do not process notifications or automated replies in real time. Explicit
Disconnect disables the account for every operator. SDK requests have a 30-second
deadline. Stop and idle expiry cancel pending requests before draining background
history and disposing the SDK, so a stalled login or send cannot indefinitely hold the
account online. Interrupted sends remain uncertain instead of being retried
automatically.

Initial connection enumerates native inbox and archive folders in bounded pages, and
imports up to 30 recent dialogs and 30 messages per dialog. Live message, edit, deletion
and reaction updates enter the durable replay journal. Saved D1 history remains readable
when a provider bridge is unavailable. The shared chat UI can load older Telegram
messages in pages of 30. Native message-ID cursors are separate from the incoming-event
replay cursor. Independent history imports do not acknowledge intervening live events,
and stale pages cannot overwrite newer edits or resurrect deleted messages. “Find more
conversations” discovers further dialogs, including archived chats, without changing the
selected chat or live replay cursor. Access hashes remain inside the SDK; public
pagination anchors contain only peer IDs, message IDs and timestamps.

## Native archive state

`archive(account, chat, archived)` uses Telegram's native folder mutation. Live
`updateFolderPeers` updates and initial dialog discovery enter a durable archive
journal. `snapshot(account, messageAfter, archiveAfter)` replays at most 100 folder
states independently of message history. Hype confirms the native result before saving
it, and changes in other Telegram clients are reflected on the next poll.

## Local development

Install from the TjikOS workspace root with `bun install`. Use a private persistence
directory outside the repository for real session data. Supply `TELEGRAM_API_ID` and
`TELEGRAM_API_HASH` from a secure environment outside the checkout; never put
credentials or account captures in source files.

From this app directory, run the local worker explicitly:

```sh
bun x wrangler dev --env='' --local --port 8794 --persist-to /secure/local/hype-telegram
```

For calls, also run `bun x wrangler dev --env='' --local --port 8795` from
`workers/telegram-calls`. Hype's local `TELEGRAM_CALLS_URL` is
`ws://127.0.0.1:8795/calls`. This public upgrade-only gateway connects to the private
bridge's `CallGateway` entrypoint; it cannot register accounts or send messages. Its
local service binding never points at production.

Hype's local `TELEGRAM` binding points to `hype-telegram-local` with `remote=false`. Its
WhatsApp binding likewise points to `hype-whatsover-local`; the WhatsApp apps have
explicit `local` and `preview` environments. Local development does not use the
production messaging bridge.

Open the organisation's Messaging tab to register/sign in. Telegram supports QR,
phone-code and two-step-verification password challenges. The account belongs to the
organisation; the registering operator is retained only for attribution. The shared chat
model requires an explicit organisation-bound transport. Legacy administrator-owned
WhatsApp endpoints return a migration error before accessing any provider. Their old
linked-device data is retained, but is not automatically assigned to an organisation
from an operator's memberships. Link the intended organisation account explicitly;
copying existing sessions would require an explicit account-to-organisation mapping.

## Validation and release

```sh
bun run types
bun run check
bun run test
bun run build
```

Tests run in workerd with synthetic credentials and mocked network transport. They cover
SDK storage across eviction, MTProto crypto and WebSocket handshake, account isolation,
replay ordering, deletion tombstones, reactions, and ambiguous sends. They also cover
older-history cursors, real SDK cancellation on Stop/idle expiry, and independent
call-crypto vectors (DH, directional AES-CTR, tampering and replay). `build` performs a
Wrangler deployment dry run; it does not deploy.

The preview and production Worker names are `hype-telegram-preview` and
`hype-telegram-prod`. Configure both required secrets separately in the intended
environment before deploying it. Deployment order is the private bridge, matching call
gateway (`hype-telegram-calls-preview` or `hype-telegram-calls-prod`), then the Hype
release that consumes their binding and URL. Apply the reviewed D1 migration in that
same Hype environment. The bridge and call gateway were deployed to production on
2026-11-04. A scoped Hype messaging release and migrations 0160–0163 were deployed on
2026-11-04. Hype production version `235bfef8-c035-4ecd-b613-4aae60dce727` binds
`TELEGRAM` to `hype-telegram-prod`; its four existing custom domains and secret bindings
were verified after deployment. The release was built from production sources, with
unrelated local application changes excluded.

## GIF and sticker catalogue

The private service exposes `searchMedia`, `stickerPacks`, `catalogItem`, `catalogMedia`
and `stageMedia` for a connected organisation account. GIF search uses Telegram's
configured inline bot; empty queries show saved GIFs where available. Sticker search
uses native `messages.searchStickers` keyword/emoji search; empty queries show recent
stickers. Provider continuation offsets are preserved for pagination. Installed packs
use `messages.getAllStickers`; a public pack short name loads up to 200 members with
`messages.getStickerSet`. Hype caches pages and previews on the device.
`compatibleWith: "whatsapp"` filters results to MP4 GIFs and WebP stickers of at most
512 KiB for Hype’s authorised copy into the same organisation’s WhatsApp account.

The account Durable Object retains private document/file references and returns opaque
UUIDs to Hype. Search results expire after 15 minutes; explicitly staged attachments
survive object eviction for 24 hours and use the existing immutable send journal. The
staging RPC never sends a message. Hype now follows the operator’s selection immediately
with an immutable send and displays an optimistic preview. Acknowledged selections are
released; uncertain selections remain available until expiry. The browser can preview
MP4/GIF, WebP, TGS and WebM; previews are bounded to 8 MiB. Downloads allow two
concurrent previews per account, separately from the mutation queue, so preview loading
does not block sending. External GIF downloads accept only HTTPS Tenor/Giphy CDN URLs
from the configured bot, without redirects.

`tests/catalog.test.ts` covers native search, pagination, account isolation, selection
durability, expiry, download limits and provider-reference privacy. Live local checks
have also retrieved GIFs and all supported sticker formats, downloaded previews, decoded
a real TGS animation and staged selections. Message sending remains subject to the live
qualification described below.

## Voice and video calls

The private bridge implements phone call RPCs, incoming ringing receipts, ephemeral DH
commitment/fingerprint verification, authenticated replay-protected AES-CTR signalling,
gzip and SCTP. It advertises Telegram library versions 13.0.0 and 12.0.0 (V3 framing)
only. Unknown DH groups and unsupported signalling transports fail closed. Account
access hashes and shared keys never reach the browser.

One operator owns a call. The browser obtains a single-use 30-second capability bound to
its origin and active viewer lease, and sends it in a WebSocket subprotocol, never in a
URL. Other operators can view shared call state and decline unanswered calls, but cannot
control the owner's media. Socket loss, lease expiry, explicit disconnect, or hangup
releases the call. Setup is limited to 90 seconds and call duration to two hours. A
submitted attempt is never automatically retried.

Hype uses native WebRTC with Opus/VP8. Telegram's independent send-only channel
negotiations are translated to stable browser SDP sections; peer fields are validated
before SDP construction. Media travels through browser WebRTC, directly or through
Telegram-provided standard TURN endpoints. Telegram's private native reflector protocol
is not implemented. When Telegram forbids P2P, the browser is configured relay-only.
Mute, camera gating, remote playback, and cancellation release the relevant browser
resources.

In the Hype checkout, `bun scripts/dev/check-telegram-media.ts` runs reproducible
voice-only and video browser loopbacks using synthetic capture devices and no Telegram
connection. It checks bidirectional received RTP, decoded video frames, mute/camera
controls, and media teardown. Hype's `telegram-calls.test.ts` covers malformed peer
fields, the native SSRC answer contract, relay policy, late permission/ticket
cancellation, and socket backpressure. Add `--relay` to also qualify both media modes
through real local UDP and TCP TURN allocations with P2P disabled. This needs Go 1.24+
and builds the pinned Pion TURN fixture in a temporary directory. Listeners, relay
allocations and permitted peers are restricted to loopback; credentials are generated
for each run and are not printed. The check verifies that the selected local and remote
ICE candidates are relays, confirms the UDP/TCP relay transport, and stops the fixture
on exit. Add `--native-fields` to emit Telegram's native video codec `channels: 0`
sentinel at the signalling boundary. `--relay --native-fields` has passed all six local
voice/video cases across direct, UDP TURN and TCP TURN connections. The fixture checks
native field compatibility; it does not connect to a native Telegram client. Bridge
tests also cover authenticated uncompressed JSON signalling, which native tgcalls
accepts alongside gzip, and reject tampered packets before parsing.

**Authenticated live qualification remains outstanding.** The production bridge
completed a real Telegram QR handshake on 2026-11-04 through an authenticated remote
service binding. The QR became available on the second one-second poll; explicit Stop
returned in approximately 1.1 seconds and cleared it. These timings include the remote
development proxy and are not browser latency measurements. A second run verified that
two viewers shared the pending QR session, a separate account saw no QR or connection,
and leaving both viewers cleared the QR and suspended the session by the 33.3-second
poll (the configured grace is 30 seconds). No account was signed in and no message or
call was sent in those checks. The subsequent production phone sign-in request reached
the code challenge. Authenticated delivery and native-call qualification remain pending.

Synthetic tests and build dry runs do not prove interoperability with released Telegram
clients. Before general use, qualify sign-in, catch-up, attachments, incoming/outgoing
voice and video against native clients, relay-only connectivity, simultaneous operators,
and reconnection using explicitly approved test accounts and recipients. No real
messages or calls have been sent during implementation.
