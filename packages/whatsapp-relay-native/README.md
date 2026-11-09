# Whatsover voice relay

The native portion of the WhatsApp voice transport. It connects the pinned SDK's
UDP/DTLS/SCTP DataChannel to a private WebSocket owned by the account Worker. It does
not pair a WhatsApp account, handle call signaling, hold call keys, decode audio, or
persist packets. Browser PCM and call control belong in the authenticated Hype/Worker
path; neither is implemented by this package.

`cargo test --manifest-path packages/whatsapp-relay-native/Cargo.toml --locked` runs
synthetic WebSocket tests; no WhatsApp messages or calls are sent.

Set `WHATSOVER_RELAY_TOKEN` to 32–128 cryptographically random URL-safe characters
outside the repository. Run
`cargo run --manifest-path packages/whatsapp-relay-native/Cargo.toml --locked`. The
default listen address is `127.0.0.1:8080`; the container overrides it to
`0.0.0.0:8080`. Deploy it only behind a private service binding, with no public route.
Do not put its token in browser code or URLs. The container has no volume requirement.

## Private wire protocol

1. Upgrade `GET /relay` with `Authorization: Bearer <token>`.
2. Within five seconds send `{"endpoint":"<literal public IP>:<port>"}`. The endpoint
   comes from the authenticated SDK, never a user-supplied URL.
3. Wait for `{"state":"connected"}`. A failed native handshake may return
   `{"state":"failed"}` before closing. Malformed input closes immediately.
4. Send/receive binary opaque relay packets. `{"dropped":N}` reports native inbound
   loss. Send text `ping` at least every ten seconds; receive `pong`.
5. Close the socket to release the native channel. Reconnecting uses a new socket and a
   new SDK-supplied endpoint. The Worker must end the call on transport loss.

Limits: two simultaneous sockets per process (to permit relay handover), 64 KiB per
packet, 2,000 packets and 4 MiB per second in each direction, a 30-second native
handshake timeout, a 20-second client idle timeout, a two-hour lifetime, and five-second
I/O deadlines. Invalid or excessive client traffic terminates the channel. Excess relay
traffic is dropped. Local/private/reserved IP ranges, mapped IPv4 and transition IPv6
addresses are refused before any dial.

`GET /health` returns only `ready`. No headers, endpoints or packets are logged.

This transport alone does not establish voice-call support. Cloudflare UDP egress, the
Worker portable engine, browser audio and authorized live interoperability must all be
verified before exposing a working Call control.
