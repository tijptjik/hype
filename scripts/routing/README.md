# Shared routing setup

Refs [EXT-1 #213](https://github.com/tijptjik/hype/issues/213), parent
[#186](https://github.com/tijptjik/hype/issues/186), and the
[technical domain](../../spec/breadline/proposal/09-enhancements.md).

Hype uses SaanSeoi's private hosted routing services:

| Hype target                   | Service              |
| ----------------------------- | -------------------- |
| Local development and preview | `ss-routing-preview` |
| Production                    | `ss-routing-prod`    |

Configure the matching server credential from SaanSeoi's private client registry:

```sh
bun run routing:configure:local
bun run routing:configure:preview
bun run routing:configure:prod
```

Local setup updates the ignored `.dev.vars`; restart Vite afterwards. Remote setup
uploads only the app secret and does not deploy Hype. The `--clients PATH` option
selects another private client registry. Credentials remain server-only.

See [shared routing operations](../../docs/operations/Feature-Routing.md) for the
service contract, quotas and deployment workflow. Graph generation, downloads,
retention and compute deployments are owned by the SaanSeoi repository.

Historical runtime measurements remain under `docs/benchmarks`. The retired
benchmark Workers, deployment configurations and experiment runners are removed.
