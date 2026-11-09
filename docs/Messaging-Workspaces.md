# Messaging workspaces

HYPE owns the hosted messaging services. TjikOS owns the independent `whatsover` desktop
CLI. Neither repository imports application code or build products from the other. Each
Rust product pins the upstream protocol library independently.

The application data model is documented in
[Messaging preferences and recipient identities](Messaging-Identity-Model.md).

| Workspace                         | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `workers/whatsapp`                | Private WhatsApp account Durable Objects        |
| `workers/whatsapp-calls`          | Capability-gated browser call gateway           |
| `workers/whatsapp-relay`          | Private native relay container gateway          |
| `workers/telegram`                | Private Telegram account Durable Objects        |
| `workers/telegram-calls`          | Telegram browser call gateway                   |
| `workers/messaging-notifications` | Scoped push subscriptions and delivery          |
| `packages/messaging-bridge`       | Hosted message contracts and account utilities  |
| `packages/whatsapp-engine`        | Hosted Rust/WASM adapters and generated factory |
| `packages/whatsapp-relay-native`  | Native relay container source                   |

## Build and validation

Install workspace dependencies with `bun install`. Rust/WASM requires the
`wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.130. The relay image build
requires Docker or Podman; the supplied wrapper selects Podman when Docker is absent.
WhatsApp checks and tests preserve the local Dotjik `dev-check` lock wrapper (install
that command on development hosts); isolated CI runs directly. From the repository root:

```sh
bun run build:workers
bun run check:workers
bun run test:workers
bunx turbo run build --filter=@hype/whatsapp
```

`test:workers` runs the Bun launcher checks before the workspace test tasks. The web
application's Vitest configuration excludes the hosted worker suites, the shared
messaging bridge's Bun tests, and the Bun launcher tests so each suite runs through its
own runner.

Turbo follows workspace dependencies: the WhatsApp engine builds before its worker is
checked or bundled. Runtime tests use synthetic fixtures and local workerd instances.
Worker builds are dry runs, never deployments. Build/test caching is disabled initially
because generated WASM qualification variants and container builds have external
toolchain inputs. Cargo still uses its own cache. Run the normal WhatsApp build after
its qualification tests before deploying.

The web application stays at the repository root for this migration. Its `dev`, `build`,
`check` and `test:run` commands retain their existing meaning. `build:all` builds the
workspace workers and then the web application. Existing workers without a package
manifest keep their existing root scripts; adoption of those workers and relocation of
the web app to `apps/web` are separate changes.

## Local sessions and credentials

`bun run dev:messaging` starts the six messaging workers. Start the HYPE web app
separately with its normal local/persona command. The launch helper binds only loopback,
explicitly selects local environments, and uses distinct inspector ports. Account and
relay state must live outside the checkout.

For an existing login, set `WHATSAPP_STATE_DIR`, `TELEGRAM_STATE_DIR`, and
`WHATSAPP_RELAY_STATE_DIR` to the exact private directories used before the move. For
deliberately new accounts, `HYPE_MESSAGING_STATE_DIR` provides a parent under which each
worker gets its own directory. No session directories or credentials are copied,
renamed, reset or created by the repository migration.

Supply Telegram API credentials through the inherited environment or set
`HYPE_MESSAGING_ENV_FILE` to an existing private environment file outside the checkout.
Turbo passes these only to development tasks. Notification development continues to use
HYPE's `.wrangler/state` so membership checks see the same local D1 database as the
application.

Inspect a launch without connecting an account:

```sh
bun scripts/messaging/dev-worker.ts whatsapp --dry-run
```

## Deployment compatibility

Source workspaces and package names use `whatsapp-*`. Existing Cloudflare names such as
`hype-whatsover-prod`, Durable Object class names, migration tags, service bindings,
ticket protocols and relay environment variable names remain stable. They identify
deployed resources and persisted sessions, not product ownership. Renaming those
requires a separate reviewed runtime migration. This source move performs no deployment,
schema migration, account registration or message send.

Deploy the private relay first when changing its internal endpoints, then the account
provider and matching call gateways in the chosen environment. Release HYPE's web
application separately. Keep each worker's configuration and credentials
environment-scoped.
