# ghostsigns
Cultural Journeys through Hong Kong

## Developing

Once you've installed dependencies with `bun install` start a development server:

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