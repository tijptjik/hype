# Messaging availability backfill

Search reads HYPE users and fresh availability from D1 immediately. The UI checks both platforms for uncached users independently with up to three concurrent requests. A result is scoped to the organisation account, its external identity, the user and the exact saved phone. A changed number or linked account invalidates it. Positive results expire after seven days; negative and privacy-unresolved results after one day; temporary failures after one minute. Verified manual identities remain authoritative.

First apply the messaging migrations up to `migrations/0166_messaging_discovered_phone_format.sql` using the normal migration workflow. The backfill uses the separate identifiers and verified aliases introduced in `0165_user_messaging_identifiers.sql`; see [the identity model](../../docs/Messaging-Identity-Model.md). No credentials belong in this directory.

The backfill currently supports **local D1 and local bridges only**. Start the local WhatsApp/Telegram bridges, then run from the HYPE checkout:

```sh
bun scripts/messaging/backfill-phone-lookups.ts --organisation hkfoodworks --database /absolute/path/to/local.sqlite --limit 50
```

This defaults to a dry run. Add `--apply` to check and persist the bounded batch. It checks both WhatsApp and Telegram independently, skips pending manual claims, valid verified identities and fresh cache entries, waits 500 ms between checks, and stops on a temporary provider failure. Native ID claims, verified aliases and existing conversation owners prevent cross-user discovery. Rerun to continue. Limits are 1–500 per invocation. Output contains aggregate counts only.

The script only writes `messagingPhoneLookup`; it does not send messages, create conversations, import contacts, or write verified identity associations. Telegram resolution can be limited by privacy settings. A cached registration check establishes availability, not ownership. Conversation opening still enforces identity uniqueness and recipient association.

## GIFs, stickers and offline packs

Open a conversation in `/admin/messaging` and use **GIFs** or **Stickers** in the
composer. Tapping a result sends that media immediately and preserves the current
text/file draft. The View Transition API moves its preview into an optimistic
message; reduced-motion and older browsers use an immediate update. The checkmark
shows progress, acknowledgement, or an uncertain/failed outcome. Preparation
failures can be retried. Once delivery may have been attempted, **Check status**
refreshes the receipt without resending.

Search accepts words and emoji with pagination. Empty searches show saved GIFs and
recent stickers. The pack strip lists the Telegram account's installed packs.
**Save offline** downloads a pack's previews for offline browsing in an already
loaded messaging screen. Sending still requires connectivity. Search pages,
pack names and preview bytes persist in IndexedDB, scoped to the signed-in user
and organisation account, for up to 30 days within a 1 GB shared disk budget.
Cleanup reads only age and size metadata, without loading preview bytes into memory.
Closing the picker retains its results and previews. The footer shows this
account's cached MB beside a clear-cache icon. Clearing saved content keeps visible
previews usable without downloading them again; **Save offline** can save them again.
Unavailable/quota-limited browser storage falls back to memory.

Telegram supports MP4/GIF, WebP, animated TGS and WebM. WhatsApp uses the same
organisation's connected Telegram library, filtering to MP4 GIFs and WebP stickers
that WhatsApp accepts. TGS/WebM conversion is not provided. Compatible files are
copied server-side into the destination WhatsApp account, with native GIF playback
enabled. Both source and destination accounts are authorised; no Telegram access
hashes or download URLs enter the browser. WhatsApp lookup needs that organisation's
Telegram account connected. Local file uploads remain available on both platforms.

Local Hype binds `hype-telegram-local` and `hype-whatsover-local` from the TjikOS
checkout. Update both bridge apps with their documented local build/runtime
workflow before releasing Hype. Search references expire after 15 minutes; older
cached selections refresh their source reference before sending. Server previews
are capped at 8 MiB, with two concurrent Telegram downloads per account; visible
browser tiles use at most four transfers and pause animations outside the viewport.

Focused checks:

```sh
bunx vitest run src/tests/messaging-media-picker.test.ts src/tests/messaging.integration.test.ts src/tests/telegram-sticker.test.ts src/tests/whatsover-console.test.ts
```

`scripts/visual-checks/messaging-media-check.ts` exercises the actual composer and
timeline with synthetic media in Chromium and Firefox at desktop and phone widths:
skeletons, cache reuse, View Transition capture, immediate send, receipt
reconciliation, pack downloads and offline previews after reloading the screen.
No real provider messages are sent by this check.
