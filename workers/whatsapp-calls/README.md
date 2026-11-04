# Whatsover browser voice gateway

Public WebSocket upgrades only, forwarding to the private `VoiceGateway`
entrypoint of `hype-whatsover-prod`. It has no account RPC methods, databases,
WhatsApp credentials or native relay access.

Hype authenticates the administrator and mints a ticket through its existing
private binding. The account Durable Object stores only the SHA-256 ticket hash,
expires it after 30 seconds and consumes it once, matching the exact browser
Origin. The browser sends `whatsover.v1` and `token.<ticket>` as subprotocols;
the response selects only `whatsover.v1`. Never put tickets in URLs or logs.

Path: `/voice/<opaque account DO ID>`. Tickets cannot access any other account.
Only the authenticated Hype server can issue them. Cookies and arbitrary client
headers are not forwarded. A disconnected browser ends its call, and concurrent
voice sockets for the same account are rejected.

Deployed gateway origin: `https://hype-whatsover-voice-prod.hypehk.workers.dev`.

Deploy the primary bridge first (including its named entrypoint), then this
gateway. Set Hype's server-side voice gateway URL to the resulting HTTPS origin.
The primary bridge and native relay remain private.

Hype's browser microphone, playback and call controls use this ticket protocol.
Synthetic tests cover the browser audio pipeline; an authorized live WhatsApp
call is still required to qualify interoperability.
