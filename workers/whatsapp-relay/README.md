# Private Whatsover media relay service

Runs `packages/whatsapp-relay-native` on demand in a Cloudflare Container, controlled
by a SQLite Durable Object through `ctx.container`. There are no public routes,
workers.dev URLs, browser credentials, or WhatsApp session files in this service.

Each account gets an independent relay instance. The DO generates and stores its
own authentication token and injects it only into the container environment and
the internal WebSocket upgrade. The container idles out after 60 seconds; the
native relay also bounds every session to two hours and closes idle clients.
WhatsApp account keys and call signaling stay in `hype-whatsover-prod`.

Private interface:

- Service-binding `fetch`: `POST https://relay.internal/<account>/prewarm`
  starts the account's container and waits for its health check, returning 204.
  It opens no media socket and sends no WhatsApp traffic. Concurrent startup and
  call requests share readiness; the normal 60-second inactivity timeout remains.
- Service-binding `fetch`: `GET https://relay.internal/<account>` with
  `Upgrade: websocket`. Once upgraded, use the native relay protocol documented
  in `packages/whatsapp-relay-native/README.md`.
- RPC `probe()`: starts the isolated `qualification` instance and runs a fixed,
  bounded STUN probe. Returns only `{ udpReachable: boolean }`. It sends no
  WhatsApp traffic. A success proves UDP egress, not WhatsApp interoperability.

Use `bun run types`, `bun run check`, and `bun run build` before deployment.
`bun run build` performs a Wrangler dry run including the native image build.
On this desktop, set `WRANGLER_DOCKER_BIN` to the absolute path of
`scripts/podman-docker.sh`; it translates Docker's no-provenance/local-load flags
and stdin Dockerfile to Podman's equivalent local build. It uses `skopeo` to
resolve the uploaded digest: Podman's local digest can differ after compression.
Standard Docker needs no wrapper. The Docker build context is restricted to the relay's source and
Cargo manifests by `.dockerignore`.

Deploy with `wrangler deploy` after qualification. Do not claim voice support
until the portable call engine, authenticated browser audio, and authorized live
interoperability have also been verified.
