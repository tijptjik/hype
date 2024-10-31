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

## Schema

The schema is defined in `src/lib/db/schema.ts`.

The relationship between organisations, projects, layers and filters is hierarchical. Properties are defined on projects, and values are defined on properties. The qualitative properties are shown to the users in a features info panel, the categorical properties are shown in a filter panel. Layers control which filters are available to the user when that particular layer is visible.

```
org:HKSTREETNAMES
   project:Odonym
       layer:people
           filter:type
           filter:gender
           filter:nationality
           info:name
           ~desc
       layer:religion
           filter:type
           ~desc
       layer:places
            filter:type (e.g. city, province, country, river)
            filter:country
            info:place
            ~desc
       layer:industry
            filter:type
            filter:company
            ~desc
    project:Language
        filter:lang_origin
        info:lang_family
        layer:meaning
            ~desc
        layer:misc
            ~desc
        layer:mixed
            ~desc
        layer:sound
            ~desc
        layer:N/A
            ~desc
    project:Age
        info:year
        layer:year_bin_1860
        layer:year_bin_1880
        layer:year_bin_1900
        layer:year_bin_1910
        layer:year_bin_1920
        layer:year_bin_1930
        layer:year_bin_1940
        layer:year_bin_1950
        layer:year_bin_1960
        layer:year_bin_1970
        layer:year_bin_1980
        layer:year_bin_1990
        layer:year_bin_2000
        layer:year_bin_2010
        layer:year_bin_2020
        layer:year_bin_2030
```