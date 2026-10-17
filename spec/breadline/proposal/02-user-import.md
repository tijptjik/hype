# Breadline user import: isolated first stage

Tracking: [account support #189](https://github.com/tijptjik/hype/issues/189),
[migration importer #194](https://github.com/tijptjik/hype/issues/194),
[identity parent #179](https://github.com/tijptjik/hype/issues/179), and
[migration parent #180](https://github.com/tijptjik/hype/issues/180).

## Scope and schema

The Breadline telephone migration is `migrations/0085_breadline_users.sql`:

```sql
ALTER TABLE user ADD telephone text;
```

Hype already has the required `user` and `account` tables, including unique email,
username and `(providerId, accountId)` constraints. No new identity, checkpoint or
legacy-ID columns/tables are needed. Migration `0086_username_display_case.sql` adds `displayUsername` and a unique
index on `lower(username)`. User-provided capitalization is preserved for display;
canonical usernames and URLs are lowercase. Breadline names use `AdjectiveRunner00`
for display and its lowercase equivalent for matching. Both Breadline runner names
and Hype generated usernames use the explicit 1,064-entry neutral-to-positive
whitelist in `src/lib/utils/username-adjectives.ts`, not the upstream package
adjectives. HYPE names use `PositiveAdjectiveAnimal00`; dictionary filtering keeps
the full name, including both digits, within 32 characters. Migration
`0087_refresh_generated_usernames_merge_user.sql` freezes the reviewed legacy HYPE
cohort by ID and old spelling, preserves unmatched custom names and guests, applies
three requested display-name overrides, and consolidates one duplicate identity.
Legacy random-name provenance is inferred from exact old dictionary membership;
there is no historical user-choice flag. Subsequent custom edits skip the guarded
renames. The merge transfers login accounts, sessions, contributions and roles,
combines saved-state flags, keeps primary layer preferences, and invalidates count
caches. Unexpected overlapping roles or a missing destination abort the migration.
Existing imported runner names and other user-chosen usernames are not renamed. Seeded output depends on the
whitelist order, so regenerate any unexecuted import plan after changing it.
Existing case collisions
block the migration for review rather than merging users.

The broader event/schedule/property/leaderboard proposal is retained under `drafts/`
as reference material. It is excluded from the active Drizzle schema and migrations.
`bun run scripts/breadline/generate-migration.ts` now generates only the nullable
telephone addition, without connecting to a database or reading credentials.

## Reviewed merge and exclusion decisions

Refs #189, #194. The user planner supports explicitly reviewed cross-email merges
and exclusions through a private JSON file. By default it reads
`.local/breadline/user-decisions.json` when present; `--decisions path` selects an
explicit file and fails if it is missing. Copy this file alongside the private
identity seed when moving the import workflow to another machine. Real addresses
must stay out of Git and public issue bodies.

```json
{
  "version": 1,
  "merges": [{
    "targetEmail": "primary@example.invalid",
    "sourceEmails": ["previous@example.invalid"]
  }],
  "excludeEmails": ["discard@example.invalid"]
}
```

Rules are normalized and validated before use. Overlapping rules, chains, cycles,
and exclusions of merge members are rejected. Merges preserve every source user
and volunteer ID in `mapping`, with one canonical destination for subsequent run,
drop-off and other history imports. Existing canonical profiles are retained;
new profiles prefer the canonical source identity. A missing canonical identity
or an unrelated provider owner blocks the group. An alias's provider account does
not verify an otherwise unverified canonical destination.

Exclusions create explicit `excluded` entries containing source user and volunteer
IDs and `reviewed_exclusion`; they create no users, login accounts or history
mappings. Future history stages must honor these exclusions. Shared volunteers
between excluded and retained identities block the retained group for review.
The source database and mirror are never edited by these decisions.

The private plan embeds the exact decisions and lists `targetChanges` for existing
Hype identities needing consolidation or removal, including Hype-only aliases.
The planner does not execute those changes. While any remain, `review.sql` contains
only a blocking comment and rehearsal refuses to claim success. Reconcile the
selected destination explicitly and replan before rendering executable insert SQL.
Tests in `scripts/breadline/user-decisions.test.ts` cover crosswalk preservation,
profile selection, exclusion, destination conflicts and replanning after a merge.
This supports review planning; the event/history apply stages remain unimplemented.

## Prepare a review plan

```sh
bun run breadline:users:plan --target local
bun run breadline:users:plan --target production
```

The command reads only destination identity columns through explicitly targeted
Wrangler SELECTs, backs up the existing local Breadline mirror, and writes a private
plan. It does not refresh the source, apply the schema, or insert any users. The source
snapshot checkpoints are recorded in the manifest so an old mirror is not mistaken
for a current extraction. `--mirror path` selects another mirror.

For a fully offline rehearsal, supply a SQLite copy of the destination:

```sh
bun run breadline:users:plan --target local --target-snapshot /private/hype.sqlite
```

An offline snapshot is operator-selected and is recorded as such, not asserted to be
a verified current copy of that target. Local and production state is separated by
configured D1 database ID and target name.

Artifacts under `.local/breadline/users/<target>/` are ignored by Git and private:

- `identity-seed.json`: durable random seed for stable opaque generated IDs. Back it
  up and retain it across retries; changing it can change IDs for unimported users.
- `<run>/plan.json`: proposed inserts, source user/volunteer crosswalk, warnings,
  unresolved cases, counts, source checkpoint and target identity fingerprint.
- `<run>/target-identities.json`: destination matching evidence; no tokens/sessions.
- `<run>/review.sql`: proposed user/account INSERTs for review only.

The command deliberately does not accept `--apply`. Review SQL must not be executed
blindly: the apply stage still needs a fresh identity check, backup, atomic batches,
post-write reconciliation and a reviewed first-login recovery path. Replanning after
successful inserts recognizes existing users/accounts; replaying a stale SQL file is
not the retry mechanism. No acceptance claim of production import is made here.

## Mapping

| Source | Hype mapping |
| --- | --- |
| `users.id`, `volunteer_id` | Offline crosswalk to the canonical Hype user; needed for later history import |
| `email` | Trim and lowercase; do not rewrite dots, plus-addresses or provider aliases |
| 21-digit `uid` | Legacy Google subject → `account(providerId='google', accountId=uid)` |
| `Facebook_*` or unclassified `uid` | Keep source evidence offline; no unusable Facebook or guessed provider account |
| `name` | Trim into `user.name`; blank becomes NULL |
| `telephone` | Parse with libphonenumber-js into E.164; HK default for national numbers, international prefixes retained canonically; impossible/unparseable or extension-bearing numbers become NULL with offline warnings; possible numbers in unrecognized ranges are preserved and flagged |
| `locale` | Normalize `zh`, HK/TW/Hant forms to `zh-hant`; CN/SG/Hans forms to `zh-hans`; otherwise `en` |
| `picture` | `user.image`, blank becomes NULL; no asset download in this stage |
| `created_at` | UTC milliseconds in `createdAt`; earliest timestamp in a same-email group |
| `last_updated_at` | UTC milliseconds in `updatedAt`; latest in the group, falling back to creation when absent |
| New user/account IDs | Stable opaque 12-character IDs derived from the private per-target seed |
| Username | `AdjectiveRunner00` display spelling from the shared adjective dictionary; lowercase canonical username, seeded for repeatability, retry on case-insensitive collision |
| Verification/lifecycle | Trust the legacy verified-Google login path for `emailVerified`; no evidence means false. `isAnonymous=false`, `isArchived=false` |
| Preferences/experimental fields | Existing database defaults |
| Old tokens, sessions, passwords, welcome flag, NGO links | Not imported |

The archived Breadline code at commit `61f6499` establishes the Google creation
path: `app/api/auth.py:post_callback` accepts only `userinfo.email_verified`, then
`app/db.py:User.create_or_get_user` stores Google's `sub` and `email`. That source
creation path provides verified-email evidence for Google users, including users
who never completed welcome. There is no persisted last-login field or login-history
table in the export. The importer classifies 21-digit subjects as the legacy Google
identities under this source contract; it does not infer verification from completed
runs, welcome flags or email presence alone. A same-email group is verified when
at least one contributing Google identity supplies that evidence. Facebook/unknown
identities without this evidence remain unverified, and missing email is never verified.
Live OAuth compatibility still needs testing before applying.

Phones are parsed with the pinned full metadata package. Hong Kong national numbers,
`+852`, bare `852` and international `00` prefixes normalize to E.164. Numbers that cannot be parsed, have impossible lengths or include extensions are
not guessed; the original stays in the source backup and the plan records a review
warning. Structurally possible numbers are preserved even when the library does not
recognize their assigned range, with a separate offline warning. Neither validation
mode proves reachability or ownership; suspected placeholders need human review. Existing Hype profiles remain unchanged.

Same normalized email groups become one Hype user. For new users, profile fields come
from the most recently updated Google row, otherwise the latest source row. Creation
and modification dates span the entire group. Every contributing source user and
volunteer remains in the offline crosswalk, preserving the ability to attach all runs.

Destination matches consider both email and Google subject. They must identify one
Hype user. Existing profiles, verification state, names, usernames, phone numbers and
preferences are not overwritten. New Google accounts may be added to an existing
verified-email match. Matching an already attached Google subject also preserves its
current target user even when the legacy email is stale.

Explicit unresolved cases include conflicting target matches, duplicate target emails,
a source volunteer or Google subject spanning different source emails, archived/guest
target users, an unverified email-only target match, invalid email/timestamps and
identity collisions. Their source IDs remain in the offline exception report; they
are never silently dropped. Missing email and nonportable login IDs are recovery
warnings, not reasons to discard a user.

Project volunteer-role assignment, onboarding/phone validation, first-login recovery,
run history, schedules and quantities are separate stages. This stage prepares only
user/account records and the crosswalk needed by those later stages.

## Verification

`bun run breadline:db:test` covers stable IDs, same-email Facebook/Google grouping,
Facebook-only/unknown users, destination matches, conflicts, invalid timestamps,
SQLite insert quoting and foreign keys, and recognition of already imported rows.
The migration test proves existing rows survive and no extra tables are created.
Live OAuth and production writes remain unverified and pending review.

To rehearse all planned rows against the actual Drizzle user/account schema in an
in-memory SQLite database, without touching Hype:

```sh
bun run breadline:users:test --plan .local/breadline/users/local/<run>
```

The receipt checks insert counts, foreign keys and SQLite integrity. This validates
the proposed rows and constraints; it does not simulate OAuth or production D1 writes.

## TODO: donor and group account treatment

Tracking: [user import #194](https://github.com/tijptjik/hype/issues/194),
[account support #189](https://github.com/tijptjik/hype/issues/189).

- [ ] Decide and implement import handling for the legacy donor/group accounts below.
  Distinguish shared service identities from individual users assigned the `group`
  role; do not exclude all users with that role. Preserve history and selection
  ownership, and record decisions in the offline crosswalk before applying imports.
- [ ] Review the four accounts sharing pseudonym Person A without automatically
  merging them by name or phone. Two share a phone number; their emails and Google
  subjects differ. Resolve any merges using confirmed ownership.
- [ ] Add import tests for the agreed treatment of shared identities, individual
  group accounts, and associated history/drop-off selections.

The identifiers below are legacy `users.id` values (not OAuth `users.uid` subjects).
Names and email addresses are pseudonymized; email labels use the reserved
`example.invalid` domain and do not reveal original address fragments. Real names,
emails, phone numbers and OAuth subjects remain in the private local source export.
Counts reflect the 2026-10-16 15:18 UTC source snapshot and represent stored records,
not necessarily completed runs or unique attendance days.

| Legacy user ID | Role | Pseudonym | Anonymized email | Run records | Drop-off selections | Review classification |
| --- | --- | --- | --- | ---: | ---: | --- |
| 6 | donor | Shared Donor Identity | donor-service@example.invalid | 0 | 0 | Hard-coded shared donor identity |
| 6828 | group | Shared Group Identity | group-service@example.invalid | 0 | 0 | Hard-coded shared group identity |
| 82573 | group | Person A | person-a-1@example.invalid | 11 | 24 | Individual-looking Google account; retain pending review |
| 85354 | group | Person A | person-a-2@example.invalid | 0 | 0 | Individual-looking Google account; retain pending review |
| 85486 | group | Person A | person-a-3@example.invalid | 8 | 14 | Individual-looking Google account; retain pending review |
| 92110 | group | Person A | person-a-4@example.invalid | 0 | 3 | Individual-looking Google account; retain pending review |
| 109097 | group | Person B | person-b@example.invalid | 3 | 8 | Individual-looking Google account; retain pending review |

Legacy auth code explicitly uses user 6 for donor tokens and user 6828 for group
link tokens, carrying the actual donor/leader in token claims. The other accounts
are identified by their assigned role, not by hard-coded service use. No account
has been excluded or merged as a result of this TODO.

## Hype user directory

Related account work: [#189](https://github.com/tijptjik/hype/issues/189).

The `/admin/users` directory and its sidebar link are available to administrators of the
active hub and core administrators. Both the server page guard and the directory
variant of `searchUsers` enforce this policy. Organisation/project owners retain
the existing member-picker search without access to the extra directory fields.

The list loads 25 users per page, with server-side search across name, username,
email and attribution. Rows show avatar, name, case-preserving username, email,
attribution, telephone, locale, verification, archive status and join date.
The shared admin header and control bar provide server-side sorting by name, email,
join date or update date, plus a tri-state archived filter. The initial view
excludes archived users.
No account identifiers, tokens or legacy import metadata are returned.

### Admin user profiles

`/admin/users/{username}` resolves canonical usernames case-insensitively. The
user directory and admin attribution cards link to it. Profile reads reuse the
user-search entitlement: authenticated hub administrators and organisation/project
owners may open profiles; ordinary members and guests cannot.

The `getAdminUserProfile` remote chooses fields on the server. Active-hub/core
administrators and super administrators receive the directory's name, email,
telephone, locale, verification, archive state and join date. Other eligible admins
receive only username/display username, avatar, attribution and contribution
summaries; they cannot read archived profiles. No provider accounts, tokens,
preferences or experimental settings are returned. This is a read-only view and
introduces no additional profile-editing or role-assignment permissions.

Contributions reuse the existing hub-scoped public profile query and shared feature
and photo sections, with links into admin feature pages. They cover published map
features/photos and associated submission/report counters, not Breadline run history,
which remains a later event-import stage. See `src/tests/admin-user-profile.test.ts`
for field-projection, role, archive-filter and username-lookup checks.
