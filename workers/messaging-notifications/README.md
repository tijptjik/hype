# Messaging notifications

The HYPE inbox offers explicit browser notification opt-in for each organisation. Alerts continue while the page is closed, using a push-only service worker. Visible alerts contain a generic HYPE message and no sender names, message text, attachments or account identifiers. Clicking opens the organisation inbox; HYPE still authorizes access there.

For local development, start the WhatsApp and Telegram bridges and the usual HYPE server, then run from the HYPE root:

```sh
bun run dev:messaging-notifications
```

This uses port 8796, the `MESSAGING_NOTIFICATIONS` binding in `wrangler.local.toml`, and the same local D1 state as HYPE. Do not use a separate persistence directory: role and recipient checks must read HYPE's existing database. No background subscriptions are created automatically; click **Enable notifications** to opt in. Permission denial is shown in the inbox and can be changed in browser settings. Browser and OS push support is required; delivery after the browser itself exits depends on its background settings.

Each organisation has a Durable Object holding browser endpoints, encrypted-push key material, replay cursors and per-message deduplication. VAPID keys are generated once inside a private key object and survive restarts; only the public key is exposed through HYPE. Never copy subscription data or the private key into source or logs.

While subscriptions are active, an alarm checks the bridges every 30 seconds and renews their existing viewer leases. This deliberately keeps the organisation accounts connected in the background. Without a subscription or an active viewer, the ordinary bridge lease timeout applies. Membership, relevant hub/core admin rights, archived/anonymous state and verified HYPE recipient identity are checked again during polling. Subscriptions expire after 30 days and renew when the inbox is opened. Disabling alerts affects the current browser's subscription for that organisation.

The focused inbox sends a short suppression heartbeat, avoiding desktop alerts while the user is viewing it. Losing focus or leaving the inbox clears suppression; the heartbeat expires if the browser disappears unexpectedly. Read, outgoing, deleted and protocol-only messages do not trigger alerts. New subscriptions do not alert for old history. Replayed edits and receipts retain the same native message identity and do not repeat alerts. Temporary push failures retry without delaying successful subscribers; invalid/expired endpoints are removed. Delivery deduplication cannot make the external push HTTP request exactly once across a crash, so the service worker also replaces the existing notification for each account.

Only local configuration is included. Production rollout requires a production D1 binding, private bridge service bindings, and a `MESSAGING_NOTIFICATIONS` service binding on HYPE, followed by explicit deployment of the worker and app. No production deployment is performed by the development command.

Validation:

```sh
bun x vitest run workers/messaging-notifications/notifications.test.ts
bun x tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck workers/messaging-notifications/index.ts
bun x wrangler deploy --dry-run --config workers/messaging-notifications/wrangler.jsonc
```

Tests use isolated SQLite, generated synthetic browser keys and a mocked push transport. They cover organisation isolation, authorization and revocation, unread filtering, focus suppression, deduplication and retry handling. Real cross-device delivery still needs a user-enabled subscription in the target browser.
