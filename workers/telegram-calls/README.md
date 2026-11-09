# Telegram call WebSocket gateway

Public upgrade-only gateway for Hype's organisation-owned Telegram call service.
`GET /calls/<account-do-id>` accepts the `hype.telegram.v1` and `token.<capability>`
subprotocols. The account Durable Object consumes the single-use capability and checks
its origin and viewer lease. Cookies and Authorization headers are not forwarded. There
is no account-management or message-sending HTTP API here.

The `CALLS` service binding targets the matching Telegram bridge's `CallGateway`
entrypoint in every environment. Deploy that bridge before this gateway. Hype uses
`TELEGRAM_CALLS_URL` with this Worker's `/calls` base path.

From this directory:

```sh
bun run types
bun run check
bun run build
bun x wrangler dev --env='' --local --port 8795
```

`build` is a deployment dry run. No credentials are required by this gateway; Telegram
API credentials belong to the private bridge. Runtime gateway and capability tests live
in `../telegram/tests/calls-socket.test.ts`.
