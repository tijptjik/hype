# Hub subdomains

A hub's `code` selects `<code>.hype.hk` in production and
`<code>.preview.hype.hk` in preview. Hub saves register that hostname using
Cloudflare's [Worker custom-domain API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/),
which supplies DNS, Worker routing and certificates. Arbitrary external `domain`
values still require separate operator setup; this integration only provisions
names under the owned `hype.hk` zone.

## Configuration

Set the dedicated `HUB_DOMAINS_API_TOKEN` Worker secret in each deployed app.
It needs DNS Read for the hype.hk zone and Workers Scripts Write for the app's
account. `HUB_DOMAINS_ZONE_ID` is configured in `wrangler.toml`; the existing
`CLOUDFLARE_ACCOUNT_ID` binding identifies the account. Local saves skip
Cloudflare. Missing configuration or Cloudflare failures prevent a hosted hub
save, with a field error, rather than publishing an unreachable new hostname.

The operator inventory/deployment commands accept `HUB_DOMAINS_API_TOKEN`,
falling back to `CLOUDFLARE_API_TOKEN`. Inventory also needs Zone Read to discover
the zone unless `HUB_DOMAINS_ZONE_ID` is supplied, and Workers Scripts Read to
include custom-domain assignments.

## Reserved names

Refresh the public-safe reservation snapshot with:

```sh
bun --env-file=.dev.vars.production scripts/cloud/refresh-hub-domain-reservations.ts
```

The script reads every DNS page and account Worker domain, saves only reserved
labels and retrieval metadata, and leaves the previous file untouched if a read
fails. Nested owner names reserve the entire first-level namespace. Existing hub
names are included, but an unchanged code remains editable. New codes must use
2–24 lowercase letters, digits or interior hyphens. The existing application
reserved-word policy also continues to apply.

**Inventory status:** refreshed successfully on 2026-10-20 using the dedicated
hub-domain token: 34 DNS records and 26 account Worker custom domains produced
22 reserved labels. The snapshot includes baseline platform names and every
occupied first-level hype.hk namespace found in those records.

The dedicated secret is installed on both deployed Workers. Runtime checks found
the production account ID already installed, but preview lacked it; preview now
has an explicit account ID variable in `wrangler.toml`. Both environments receive
the zone ID from the same config. The integration and these configuration changes
still require an application deployment before automatic registration is active.

On 2026-10-20 the production D1 hub inventory was reconciled with Cloudflare.
`mappinghk.hype.hk` was registered on `hype-prod`; all four production hub hosts
(`hype.hk`, `breadline.hype.hk`, `hkghostsigns.hype.hk`, `mappinghk.hype.hk`)
were then verified against live Worker domain assignments. The new hostname is
also declared in the production routes to preserve it on deployment.

## Save and deployment behavior

Authorization, uniqueness and stale-write checks precede registration. Before
creating a custom domain, the service checks current domain ownership and DNS;
it never deliberately overwrites another Worker's assignment or existing DNS.
Matching assignments are idempotent. DNS/API failures block the database write.

Cloudflare and D1 cannot share a transaction. If registration succeeds but a later
database write fails, the unused domain remains pointed at Hype's unknown-hub
404; retrying can reuse it. Renames and archival do not delete DNS records. Old
hostnames cease resolving a hub through the existing code lookup; domain cleanup
is an explicit operator task. Certificate issuance may finish after registration.

Use `bun run deploy:prod` / `bun run deploy:preview`. The deployment wrapper merges
all current custom domains assigned to the target Worker into an ephemeral config,
because Wrangler replaces the domain set. It refuses to deploy if inventory fails.
Avoid changing hub codes during deployment: the Cloudflare API does not offer an
atomic snapshot-and-deploy operation. Direct `wrangler deploy` bypasses preservation.

## Verification

`bunx vitest run src/tests/hub-domain-registration.test.ts src/tests/hub-domain.test.ts`
covers reservation extraction, DNS syntax and pagination, local isolation,
configuration/API failure, ownership and DNS conflicts, repeat saves, preview
isolation, existing routing and deployment preservation. Live provisioning requires
the dedicated secret and a deployment; no DNS records were mutated during implementation.
