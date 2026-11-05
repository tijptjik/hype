# Product usage analytics

Hype follows SaanSeoi's `libs/core/src/productUsage.ts` and Atlas app analytics
collector: a versioned, allowlisted event contract, a same-origin browser endpoint,
best-effort Worker writes, and separate datasets for local, preview and production.
Cloudflare Web Analytics continues to measure ordinary traffic.

## Events

| Event                         | Recorded when                                                                | Entity ID                                              |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `feature.view`                | A feature becomes the selected card in the public map, including deep links  | Feature                                                |
| `layer.activate`              | A layer enters the public map's active selection                             | Layer                                                  |
| `project.filter`              | A project enters the public map's project filters                            | Project                                                |
| `organisation.click`          | An organisation's primary row action is clicked in the public resource panel | Organisation                                           |
| `contribution.edit`           | A non-draft feature form successfully saves                                  | Feature                                                |
| `contribution.new_feature`    | An admin feature is created, or a public new-feature task is submitted       | Feature for admin creation; task for public submission |
| `contribution.missing_report` | A missing-report task is submitted                                           | Task                                                   |
| `contribution.photos`         | A photo task is submitted                                                    | Task                                                   |

Initial defaults and restored layer/project selections count as activations. Reordering,
query refreshes, and unchanged selections do not. Closing and reopening a feature counts
again. “Feature visit” means viewing its card, not the user's physical-visit bookmark.
Organisation pin actions are filters, not primary row clicks.

Contribution events follow successful database writes. Draft creation, draft edits,
failed validation, stale-write conflicts, already-finalised task retries, and subsequent
moderation do not create new contribution events. Edit counts represent saved forms,
including repeated saves; they do not count individual changed fields, imports, location
maintenance, or publication/archive commands. Events are best effort and sampled; use
persisted features/tasks for exact audit or all-time contribution accounting.

## Contract and privacy

| Analytics Engine column | Value                            |
| ----------------------- | -------------------------------- |
| `index1`                | Event name (one sampling index)  |
| `blob1`                 | `v1`                             |
| `blob2`                 | Event name                       |
| `blob3`                 | `client` or `server`             |
| `blob4`                 | Request's server-resolved hub ID |
| `blob5`                 | Resource/contribution ID         |
| `double1`               | `1`                              |

No user identity, email, IP, user-agent, report text, URL, or query string is stored.
The collector accepts at most 1 KiB of JSON and only the four client event types;
clients cannot submit contribution counts or select a hub. Browser events are untrusted
interaction telemetry, not billing or audit evidence. Analytics failures never change
the result of the user's action.

## Configuration and rollout

Only the production Worker binds `PRODUCT_USAGE` to `hype_product_usage_production`.
Local and preview environments have no write binding; the writer also checks
`ENVIRONMENT === 'production'` before accepting an event. Development and preview
interactions therefore cannot pollute production usage.

`PRODUCT_USAGE_DATASET` points to `hype_product_usage_production` in every environment.
The **Analytics → Usage** tab always shows production's 30-day event totals and top 100
event/resource combinations, including when opened locally or in preview. Global
rankings require a super admin or core-hub admin; organisation/project prisms do not
narrow this global view. The same read-only token is installed locally and in both
deployed environments.

Reading requires `CLOUDFLARE_ACCOUNT_ID` and the server-only `PRODUCT_USAGE_READ_TOKEN`
secret with **Account Analytics Read** permission on that account. Writing uses the
binding and needs no API token. A missing read configuration is shown explicitly.
Deploying the configured Worker and writing its first event creates the dataset; an
absent dataset/query failure is not reported as zero usage.

Deployment and remote migration application are separate release actions. Deploy the
writer/collector and verify an event in the intended environment before removing the old
table. Export legacy login counters if they need retention, then apply
`0170_remove_user_activity.sql`. The application no longer reads or writes that table,
so the code can run before the drop. Rolling back to older code after the drop requires
restoring the table. Historical migrations/bootstrap fixtures remain unchanged so the
upgrade chain remains valid. No historic login counters are imported as product events.

Cloudflare retains Analytics Engine data for three months. There is no daily D1 rollup
in this implementation; unlike SaanSeoi's API-access accounting, this stream is product
interaction telemetry. Add a separate aggregate retention pipeline if longer history is
needed.

## Queries

Totals must weight samples and must not be derived from the limited resource ranking:

```sql
SELECT blob2 AS event, SUM(_sample_interval * double1) AS count
FROM hype_product_usage_production
WHERE blob1 = 'v1' AND timestamp >= NOW() - INTERVAL '30' DAY
GROUP BY blob2
ORDER BY count DESC
```

For per-hub feature popularity, filter `blob4` using the resolved hub ID and group by
`blob5`. The SQL API is server-only; never expose its token in browser requests.

References:
[Cloudflare setup](https://developers.cloudflare.com/analytics/analytics-engine/get-started/),
[limits and retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/).
