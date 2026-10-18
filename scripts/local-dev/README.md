# Local development URLs

The local Caddy router gives each app a stable browser URL while the processes use separate loopback ports. `.localhost` resolves to loopback without an `/etc/hosts` edit; `.local` is reserved for mDNS on this machine.

| Browser URL                    | Process                 | Loopback port |
| ------------------------------ | ----------------------- | ------------- |
| <http://hype.localhost>        | Hype Vite               | 5175          |
| <http://assets.hype.localhost> | Hype asset Worker       | 8790          |
| <http://atlas.localhost>       | SaanSeoi Atlas app      | 5173          |
| <http://api.atlas.localhost>   | SaanSeoi Atlas API      | 8787          |
| <http://harbour.localhost>     | SaanSeoi Harbour API    | 8788          |
| <http://basemaps.localhost>    | SaanSeoi basemap viewer | 5174          |

The basemap tile Worker is a separate service. The viewer still uses its configured tile origin, which defaults to the published tile service.

## Router setup

The router is installed on this workstation as a Caddy system service. To install it on another Fedora machine:

```bash
sudo dnf install caddy
sudo install -m 0644 scripts/local-dev/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
```

After editing the repository Caddyfile, copy it again and reload:

```bash
sudo install -m 0644 scripts/local-dev/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Start Hype with `bun run dev:local` and its asset Worker with `bun run dev:asset-service:simulated` from this repository. Start SaanSeoi with `bun run dev` from `../saanseoi`. Direct loopback ports remain useful for diagnostics. Set `ORIGIN` before starting the Atlas app when testing through another origin, such as the tailnet URL.

## OAuth and passkeys

Better Auth derives callbacks from the incoming hostname. Register the new redirect URIs with each provider before using social sign-in:

| App   | Provider callbacks                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hype  | `http://hype.localhost/api/auth/callback/google`, `http://hype.localhost/api/auth/callback/facebook`                                                      |
| Atlas | `http://atlas.localhost/api/auth/callback/google`, `http://atlas.localhost/api/auth/callback/facebook`, `http://atlas.localhost/api/auth/callback/github` |

Provider consoles may reject HTTP redirect URIs whose host is not exactly `localhost`. If so, use a trusted local HTTPS certificate and a verified development subdomain of `hype.hk` or `saanseoi.hk` for that provider. Re-register passkeys for the new hostname because a passkey is bound to the hostname where it was created.

To undo the workstation router, run `sudo systemctl disable --now caddy` and restore the saved `/etc/caddy/Caddyfile.before-hype-local-dev` if it exists.
