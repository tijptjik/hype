# Local relationship review fixture

Refs #194; [Places and Features](../../spec/breadline/proposal/01-places-features.md).

Run
`python3 scripts/locations/seed-relationship-review.py --database <local SQLite path>`.
The script accepts only an existing database under this checkout's `.wrangler/state`. It
inserts an independent `relationship-demo-` namespace in one transaction and leaves
existing records unchanged. Re-running after a successful seed is a no-op.

Open these records on the local application:

- `/admin/locations/relationship-demo-building#relationships`: physical membership,
  current/former/unconfirmed occupants, address choices, and replacement history.
- `/admin/locations/relationship-demo-shop#relationships`: operating-period editor,
  former and current premises, address ordering, and a merge event.

All 13 Locations are named with a **TEST** prefix. Their asserted history is fictional.
The fixtures include superseded assertions so version history differs from the current
view. Browser validation may append additional synthetic events within this namespace.

Use the header's Edit control to reveal relationship actions. These commands persist
individually and preserve immutable history; the Profile Save action is separate. The
lineage editor searches named Locations, and an empty Before selection means the current
record. Operating-period dates accept a year, month, or complete date.

Validation: `dev-check bun scripts/visual-checks/location-relationship-review-check.ts`
against the dedicated local admin server (default port 4176).
