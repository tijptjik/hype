# Shared SaanSeoi routing

Refs [EXT-1 #213](https://github.com/tijptjik/hype/issues/213).

SaanSeoi owns production graph generation, public downloads, retention and hosted
Valhalla. Hype owns the navigation UI, location permission, guest/user session checks,
per-user/IP limits and journey normalisation.

| Hype target | Private service |
| --- | --- |
| Production | `ss-routing-prod` |
| Preview | `ss-routing-preview` |
| Local development | Existing isolated routing benchmark |

`ROUTING_SERVICE` uses a Cloudflare service binding. Hype's server sends
`X-Routing-Client: hype` and its environment-specific `ROUTING_TOKEN`; neither value
is browser configuration. SaanSeoi checks that token against its private app-client
registry and applies a client quota. Hype retains its 30/minute user/IP limit.

For an app already bound to the matching shared service, its credential can be
configured after provisioning in the SaanSeoi checkout:

```sh
bun run routing:configure:preview
bun run routing:configure:prod
```

The scripts read Hype's token from the operator-held sibling
`.local/routing/clients-{production|preview}.json` registry. `--clients PATH` supports
another checkout location. They upload only the app secret over stdin, without
printing it, and do not publish the main app. For an initial cutover, deploy the
matching token with `wrangler deploy --secrets-file` so the service binding and
credential change in the same app version. API deployment credentials are loaded by
the existing Wrangler wrapper. App code/service-binding changes require the normal
Hype release deployment from an intended release checkout.

The shared service uses the latest compatible GBA graph for HK, Macao and GBA, while
Hype's initial UI still validates Hong Kong endpoints only. Valhalla and GraphHopper
packages are downloadable for each region, but only Valhalla is hosted. Engine graph
paths, memory/threads and release selection are service settings; endpoints, costing
and permitted preferences are request settings. The service keeps on-demand startup
and 120-second idle shutdown; there is no Hype keepalive or dedicated warm engine.

Production releases and rollback are documented in SaanSeoi's
`docs/datasets/families/routing.md`. The experimental native/WASM workers under
`workers/routing-benchmark` remain separate. The earlier Hype-named production
preparation Workers are not shared production targets and are retained idle until
consumer cutover is confirmed; benchmark `/stop` does not control shared engines.
