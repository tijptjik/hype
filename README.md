# ghostsigns

Cultural Journeys through Hong Kong

## Developing

First install dependencies with `bun install`.

### Networking

**Mullvad** : Note that some commands are sensitive to Mullvad VPN being installed. As it uses split tunneling to ignore the VPN routing for the development commands, whereas the regular internet connectivity can be routed through the VPN. Sadly Hong Kong is excluded from many AI tools, hence it's an essential part of the setup.

### Expose App

Set `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` environment variables, and make sure ngrok is available with `docker pull ngrok/ngrok`, then run

```sh
mullvad-exclude docker run --net=host -it -e NGROK_AUTHTOKEN=$NGROK_AUTHTOKEN ngrok/ngrok:latest http --domain=$NGROK_DOMAIN 5173
```

Then in another shell run

```bash
bun run dev

# or start the server and open the app in a new browser tab
bun run dev -- --open
```

## Building

To create a production version of your app:

```bash
bun run build
```

You can preview the production build with `bun run preview`.

## Database Management

### Migration

#### Generate Migration

```shell
bun run db:generate <DESCRIPTION>
```

#### Run Migration

Migrate `local` database to the latest migration

```shell
bun run db:migrate:local
```

Migrate `production` database on `cloudflare` to the latest migration

```shell
bun run db:migrate:cf:prod
```

Migrate `staging` database on `cloudflare` to the latest migration

```shell
bun run db:migrate:cf:preview
```