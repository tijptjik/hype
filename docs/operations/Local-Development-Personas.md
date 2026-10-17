# Local development personas

After restoring the production mirror and applying local migrations, stop any Hype dev server using that local D1 state, then run:

```sh
bun run dev:agent --port 4173
# Or use an ordinary account with no hub, organisation, or project roles:
bun run dev:agent user --port 4173
```

Open `http://127.0.0.1:4173/`. The launcher idempotently seeds both reserved accounts into local D1 before starting Vite. The default `admin` account has a persisted admin assignment on the `core` hub, which the existing role model treats as super-admin. The `user` account has no role assignments. The seed refuses identity collisions and refuses an ordinary account that has acquired roles. Existing mirrored people are never used as development identities.

The first document navigation issues a session through Better Auth's internal adapter and cookie writer, then redirects to the requested path. The retry reaches the early hub hook with a real signed session cookie; SSR, remote functions, and client session queries use ordinary authentication and role enrichment. An amber indicator shows `Local development: Admin` or `Local development: Ordinary user`. Signing out clears the session; the next document navigation signs the configured persona in again. Restart with `user` or `admin` to switch personas.

The launcher does not restore, reset, or migrate the database. Rerun it after each mirror restore. No passwords or provider accounts are seeded, and the reserved email addresses use `.invalid`.

## Guards and cookies

- Explicit launcher mode is required. Ordinary `bun run dev` has no automatic login endpoint.
- Vite validates `wrangler.local.toml`: `DB` must be the nonremote `hype-db-local` binding and the configured runtime environment must be `local`.
- Named `CLOUDFLARE_ENV` values and static builds are rejected. Production builds compile the persona setting to `null`.
- Runtime requests also require `ENVIRONMENT=local` and matching URL/Host authorities on `localhost`, `127.0.0.1`, `[::1]`, or `hype.localhost`. Foreign-origin sign-in and cross-site automatic bootstrap are rejected.
- Sessions use isolated `hype-dev-agent-admin` and `hype-dev-agent-user` cookie prefixes, so an admin cookie is never accepted by the ordinary-persona server. Loopback HTTP uses HttpOnly, SameSite=Lax cookies; HTTPS keeps Secure. Ordinary embedded-session cookie settings remain in effect outside persona mode.
- All R2 bindings use the local adapter configuration. The account preparation proxy explicitly disables remote bindings.

Only one app server should use a persisted D1 state directory at a time. For independent verification, `HYPE_DEV_STATE=/absolute/path/to/state bun run dev:agent --port 4173` selects the same custom persistence root for seeding and the app adapter. Prepare a WAL-safe snapshot of the local mirror there first: the root contains `d1/miniflare-D1DatabaseObject/`, rather than an additional `v3/` directory. A fresh empty directory fails until the local schema and core hub exist. Treat snapshots of production mirrors as private data.

## Validation

`bunx vitest run src/tests/auth-dev-persona.test.ts src/tests/auth.config.test.ts src/tests/auth-origin.test.ts` covers persisted session issuance and role enrichment for both personas, idempotent seeding, identity collisions, ordinary-persona role contamination, runtime environment gating, exact local authorities, explicit mode, and foreign origins.
