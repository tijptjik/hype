# Breadline user import: phone-based identities

Tracking: [account support #189](https://github.com/tijptjik/hype/issues/189),
[migration importer #194](https://github.com/tijptjik/hype/issues/194),
[identity parent #179](https://github.com/tijptjik/hype/issues/179), and
[migration parent #180](https://github.com/tijptjik/hype/issues/180).

## Phone-based latent users: replacement design (18 October 2026)

Refs #189, #194. The user planner now groups by normalized phone and supports
single-identity auto-claiming. The destination will be reset: reconciliation of
previously imported HYPE users is outside this implementation. Local preparation and the phone-completion update have been applied only to local D1;
production and the source mirror are unchanged. Old email-based plans must be regenerated.
The first-login claim workflow is now integrated with verified social sign-in and
one-time email sign-in links; apply migration 0090 with the reset schema.

### Identity and ownership

A HYPE `user` is the persistent person/history identity. An `account` is a linked
authentication credential. One user can have several explicitly linked credentials.
Import one user per structurally valid normalized E.164 phone. Without a usable
phone, group by exact normalized email or a reviewed email family instead, storing
NULL telephone and preserving all user/volunteer mappings. Both grouping paths have
these two outcomes:

| Source identities within a phone group | Import result |
| --- | --- |
| Exactly one distinct normalized email and at most one distinct nonblank trimmed name | Auto-claimed: retain that email/name and import portable Google credentials |
| Multiple emails, multiple names, or no email | Latent: NULL primary email/name/image, false email verification, no login credentials |

Repeated rows and casing/whitespace variants of the same email do not create
additional identities. Names are trimmed but otherwise compared exactly; missing
names do not introduce another identity. A name alone cannot establish a claim.
Auto-claiming assigns the unambiguous legacy identity; it does not itself prove
mailbox ownership. `emailVerified` retains the previous verified-Google evidence
rule. Facebook/unknown subjects are retained as private source evidence, not turned
into invented provider accounts. Auto-claimed users without portable credentials
need the normal verified-email recovery/sign-in flow.

Both classes use `isAnonymous=false` and `isArchived=false`. Do not reuse the guest
marker: guests can have usable sessions, whereas latent users have no credential
or session created by the import. No placeholder email is generated.

### Schema and private provenance

`migrations/0085_breadline_users.sql` adds nullable `user.telephone`.
`0086_username_display_case.sql` adds display casing and case-insensitive username
uniqueness. `0089_breadline_phone_identity.sql` adds:

- A unique index on `user.telephone`; multiple NULLs remain possible for users awaiting phone completion.
- `breadlineImportUser`: unique user and imported phone, `claimed`/`unclaimed` state,
  and `claimedEmail` (NULL while unclaimed). Import auto-claims are distinguishable
  from verified-email state on `user`; no login timestamp is invented.
- `breadlineImportIdentity`: every retained source user/volunteer ID, normalized
  source email, trimmed name and original provider subject, mapped to its HYPE user.
  These records supply history ownership and first-login eligibility.

These tables are private migration evidence, not public profile or session fields.
Migration `0091_breadline_email_identity.sql` makes the imported phone nullable
without changing user IDs, source mappings or claim audit fields. The Drizzle
definitions and rehearsal include it. The migration intentionally
fails on duplicate existing phones rather than merging or deleting existing users;
apply it as part of the planned database reset. Phone uniqueness constrains users,
not the number of credentials on `account`.

### Normalization and review boundaries

The shared `src/lib/utils/telephone.ts` normalizer strips whitespace before parsing
HK national numbers, `+852`, bare `852`, international `00` prefixes and other
international numbers into E.164. All HK numbers require exactly eight national
digits; other countries use the library's structural length checks. Extensions and
unparseable inputs fail validation. Allocation-range warnings remain separate from
structural validity and do not establish reachability or phone ownership.

Missing or malformed phones can inherit the sole known valid phone for an exact
normalized email or explicitly reviewed email family. Otherwise a usable email
preserves the user with NULL telephone; unrelated NULL phones never form a shared
identity. Missing both a valid phone and usable email still requires review. Existing
crosswalks retain their history owner when a malformed imported phone is cleared.

Emails are trimmed and lowercased without rewriting dots, plus-addresses or provider
aliases. Invalid emails/timestamps, one email or Google subject spanning multiple
phones, and one volunteer spanning multiple phones are quarantined with every source
ID retained. Existing destination identities colliding by phone, email or Google
subject block the group; this importer does not consolidate established HYPE users.

Reviewed exclusions still come from private `.local/breadline/user-decisions.json`
(or `--decisions path`) and preserve explicit excluded source user/volunteer entries.
A volunteer shared by an excluded and retained source identity blocks the retained
group. Prior explicit email-merge rules must agree with phone grouping; they cannot
choose a winning email in an ambiguous group or combine different phones.
Real addresses and private decisions must remain outside Git and public issue bodies.

### Stable IDs, profiles and history

User IDs are opaque 12-character HMAC-derived IDs keyed by normalized phone and a
private durable per-target seed. Keep `.local/breadline/users/<target>/identity-seed.json`
across retries. Plan model `phone-v2` rejects legacy plan artifacts at SQL rendering
and rehearsal. Username generation still uses the shared positive-adjective whitelist
and `AdjectiveRunner00` display spelling, with a lowercase canonical username and
case-insensitive collision retries. Existing username migrations and reviewed HYPE
renames remain independent of this import.

For auto-claimed groups, choose the latest Google profile, otherwise latest source
profile, for locale/image. Creation/modification dates span the group. Default
preferences remain database defaults. Old tokens, sessions, passwords and NGO links
are not imported.

Every contributing source user and volunteer maps to the same HYPE user. Future
claims, runs and collection imports must use that crosswalk and exclusions, preserve
source event IDs, and deduplicate repeated extraction/join rows rather than distinct
source events. Do not sum legacy counters into reconciled event totals. The broader
event/schedule/property schema remains inactive under `drafts/`; this stage imports
identity/provenance, not run or collection event records.

Repeat planning recognizes only an existing seeded user with its persisted import
ownership and identical source identity cohort. It creates no new rows, never
reopens a claim or attaches losing credentials, and permits the owner's primary
email to have changed after claiming. A changed source cohort is quarantined for
review rather than silently altering accepted eligibility. Target IDs and history
crosswalks remain stable while the source grouping and seed are unchanged.

### First verified login for latent users

`src/lib/auth/breadline-claim.server.ts` integrates with Better Auth's validated
user-creation flow and the production Drizzle adapter. Verified OAuth profiles resolve
private email eligibility and retain the latent user ID. User creation is deferred;
a single guarded D1 batch assigns ownership, fills the primary verified email/profile,
and inserts only the proven provider credential. The batch's request nonce gates
every write. Constraint failures roll back the entire claim. A losing stale request
cannot update the profile or attach an account; a retry by the winning provider uses
Better Auth's ordinary persisted account lookup. Sessions are issued after commit.

The sign-in panel also offers **Email me a sign-in link**. Better Auth stores a hashed,
15-minute, single-use token and verifies mailbox control before claiming the latent
user. This supports providers without a verified-email assertion. An unverified
social login cannot claim and receives instructions to use the email link. A typed
password signup for an eligible email sends a sign-in link while returning Better
Auth's opaque signup response, so it neither reserves the email nor strands the user.
Normal sign-in-link requests do not disclose private candidate names or eligibility.

Migration `0090_breadline_claim_audit.sql` adds `claimedAt` and a private batch nonce
`claimKey`. Import auto-claims retain NULL audit timestamps until any future separate
login-activity tracking; they are not fabricated login events. Pending proof lives
only in request-local context, never a cross-request identity map or client field.

Remaining candidate emails cannot access the imported user after claiming. They may
create separate ordinary HYPE accounts without its history. The claimed owner can
explicitly link another social identity using the existing authenticated linking
flow. Email/phone edits, unlinking and repeat imports do not reopen eligibility.
Profile email changes cannot reserve an unclaimed import's email.

Session creation and cached-session/authenticated-request checks deny unclaimed and
archived users. The claim batch checks archive state again to reject stale proofs.
Existing history rows and source crosswalks retain their user ID throughout claiming.
Consolidation of a separately established HYPE user remains outside the reset/import
scope; the claim flow does not transfer another user's credentials, roles or activity.

`src/tests/breadline-claim.integration.test.ts` exercises the production auth factory,
Drizzle adapter and actual SQLite constraints behind a D1-compatible atomic batch.
It covers verified/unverified social login, first-winner concurrency, rollback/retry,
losing aliases, explicit owner linking, email-link redemption/replay/expiry, profile
reservation, archive state and cached-session denial. Provider verification and email
transport are stubbed only at the external boundaries; no live OAuth or email delivery
acceptance is claimed by these tests.

## Prepare and rehearse a review plan

After the reset schema includes migrations 0089 and 0090:

```sh
bun run breadline:users:plan --target local
bun run breadline:users:plan --target production
```

The planner reads only explicitly targeted identity/ownership columns, backs up the
local source mirror, records source checkpoints, and writes private artifacts under
`.local/breadline/users/<target>/<run>/`. It does not refresh the source, apply schema,
or insert users. For an offline destination use `--target-snapshot /private/hype.sqlite`;
that snapshot must contain the current ownership/crosswalk tables.

Artifacts are `plan.json`, `target-identities.json`, and `review.sql` containing
user/account/ownership/crosswalk inserts. Rehearse with:

```sh
bun run breadline:users:test --plan .local/breadline/users/local/<run>
bun run breadline:db:test
```

Rehearsal executes the actual review SQL against the real Drizzle schema in disposable
memory and checks all four table counts, foreign keys and SQLite integrity. The command does not accept `--apply`.
Execute no stale SQL: applying still needs a fresh destination check, backup,
atomic batches and post-write reconciliation. The general conversion stage registry
remains empty; this change does not enable remote imports or prove live OAuth.

## Phone audit correction and local rebuild (19 October 2026)

Refs #189, #194. The source is exclusively `breadline__public__users` from the private
Breadline mirror, checkpoint 2026-10-16 15:18:18 UTC. Source rows total 14,186.
There are 2,746 NULL phones, including seven reviewed exclusions: the earlier
“2,739 missing/invalid” count was entirely missing phones. No supplied nonblank phone
is unparseable under the existing possible-number policy. Fifteen supplied numbers
fail full `isValid()` validation and remain explicit private warnings; these are
separate from the missing-phone count and are not claims of reachability/ownership.

The earlier ten “cross-phone conflict” rows were a planner bug: NULL identity phones
had been inserted into phone sets as synthetic distinct keys. Six groups had only one
real phone. Exact-email/reviewed-merge recovery now maps eleven additional missing-phone
rows and admits the ten falsely blocked valid-phone rows. Genuine multiple-number
conflicts still fail closed. The completion policy below supersedes the former
quarantine of missing/invalid phones.

The initial corrected local import created 10,667 Breadline users (9,965 auto-claimed and
702 latent), persists 11,451 source-user mappings, retains seven reviewed exclusions,
and initially quarantined 2,728 rows with no resolvable phone (superseded below). A repeat plan against the installed
database produces zero new users/accounts/crosswalk inserts and identical exceptions.
These counts exclude local fixtures and development personas.

### Email fallback and mandatory phone completion (19 October 2026)

Refs #189, #194. Of the fifteen allocation-validation warnings, four HK values have
six, seven or nine national digits after whitespace removal. They are now rejected
as phones. Eleven other values remain structurally possible allocation warnings.
Five of these fifteen source identities have eight run rows and 88 recorded collected
pieces in total; source user/volunteer mappings are preserved independently of phone
acceptance. Historical event application remains deferred.

The updated source plan maps all 14,179 retained rows to 13,386 Breadline users
(12,678 auto-claimed, 708 latent), with seven reviewed exclusions and zero exceptions.
There are 2,723 imported users awaiting a phone, including formerly missing-phone
email identities. Fresh preparation and incremental local application both prove
repeatability; the incremental update preserves existing user IDs, credentials and
sessions while clearing only four malformed phones. Source totals exclude fixtures,
reserved dev personas and anonymous browsing sessions.

After any durable-account login on the Breadline hub, `handleBreadlinePhone` reads
the current persisted phone before page/data/API/remote access. Missing/invalid phones
redirect navigation and SvelteKit data loads to `/account/phone`; direct API and
remote calls receive `403 BREADLINE_PHONE_REQUIRED`. Auth/sign-out, policies, static
assets and completion remain reachable. Guests and other hubs keep their existing
access policy. Client-side sign-in also navigates to completion. Neither cookie
caches nor a stale valid session phone bypass the server check.

The same-origin completion action accepts only the session owner's phone, applies
the shared normalizer and preserves the user's identity/history. The unique phone
index arbitrates collisions: a phone on another account returns recoverable feedback,
never an automatic merge or history transfer. This is a structural contact check;
SMS verification is not introduced. Auth profile updates cannot write telephone
through Better Auth's additional-fields input. The form is localized in all three
supported languages.

### Reviewed telephone overrides

Refs #189, #194. Private `user-decisions.json` accepts optional `telephoneOverrides`
entries with `sourceUserId`, `expectedTelephone` and `telephone` (NULL or a canonical
corrected number). A NULL override suppresses phone inference for that source row,
retains its normalized email and all source/volunteer mappings, and requires phone
completion after login. The original source remains unchanged. An expected-source
comparison ignores whitespace but fails closed if the stored number changes, so a
later source correction cannot be silently erased by an obsolete decision. Invalid
correction formats and duplicate source IDs are rejected before planning.

The reviewed correction set covers four single-email identities from the five-user
run-history audit. The explicitly retained fifth phone is not overridden. Personal
names, contacts and the exact correction set stay in the private decision file. A
later supplied correction can replace NULL with a validated canonical number.

### Reproducible fresh local preparation

`scripts/breadline/prepare-local.ts` builds a disposable database from the versioned
pre-0003 schema in `scripts/breadline/bootstrap/`, replays all 93 current migrations
with input hashes and a real migration ledger, and seeds minimal core/HK Ghost Signs/
Breadline configuration. It uses the existing reserved development personas for local
administration, then removes the temporary user required by historical seed migrations.
Old SQL sample users, tokens, passwords and content are not restored. The shared map
catalog sync supplies current styles and the Breadline project selects Day Runner.

Local installation now requires `--application-snapshot <reviewed-local.sqlite>`.
Without it, minimal bootstrap seeds are available only for disposable rehearsals;
`--apply` fails before installation. After identity import, the application snapshot
restores organisations, projects, layers, their translations, publication/archive
states, hub links, features, images, properties and tasks. Existing imported users,
credentials, sessions and private crosswalks are proven unchanged. Current map styles
are retained with their scopes reconciled to the restored hub IDs.

The original 19 October minimal install incorrectly replaced the pre-existing local
application dataset and used mismatched hub IDs. Local recovery restored eight
organisations, seven projects, sixteen layers and 1,830 features from the verified
pre-rebuild backup. Twenty-nine missing historical publisher/contributor references
were retained as archived, credential-free profiles with NULL email/phone; original
credentials were not restored or linked to imported accounts. Thirty-one pre-existing
orphan translation rows cannot satisfy the current schema's feature FK and remain
preserved in the private recovery receipt/source backup instead of inventing features.
The repair transaction proves unchanged pre-existing identities and exact application
row restoration, apart from those isolated orphan translations. Foreign keys and
integrity pass. See `scripts/breadline/restore-local-application.py` and its regression
tests; no remote database or source mirror was modified.

The source identity plan and optional private `.local/breadline/local-users.json`
fixture plan are imported separately. Local fixtures contain a canonical phone and
at least one distinct eligible email. Stable negative source keys, NULL volunteer
IDs and the `local-fixture` subject marker distinguish them from real Breadline rows;
fixture rows never contribute to source counts or history mappings. An email named
“admin” does not grant an admin role. Fixtures remain unclaimed without credentials.

```sh
# Build/rehearse privately without touching the active database.
bun run breadline:local:prepare
# Install only to the explicitly selected local Miniflare SQLite file.
bun run breadline:local:prepare --apply --database-file /absolute/path/to/local-state/<id>.sqlite
```

The command validates the local D1 binding and destination namespace, backs up the
source mirror, retains the durable local ID seed, and writes private source/fixture
plans, review SQL, input hashes, checkpoints and receipts under
`.local/breadline/local-rebuilds/`. It checks coverage, both import replans, SQLite
integrity and foreign keys before applying. SQLite's online-backup API backs up the
previous local database and installs the prepared database while preserving Miniflare
engine metadata; it never deletes live WAL/SHM files. There is no remote target or
source refresh. A local installation was completed and verified through Wrangler;
production and live OAuth/email delivery are not acceptance claims of this workflow.

Tests: `scripts/breadline/users.test.ts`, `scripts/breadline/local-users.test.ts`, and
`scripts/breadline/local-bootstrap.test.ts` cover phone recovery/conflicts, local fixture
isolation/idempotence and the complete source/migration/bootstrap chain.

## TODO: donor and group account treatment

Tracking: [user import #194](https://github.com/tijptjik/hype/issues/194),
[account support #189](https://github.com/tijptjik/hype/issues/189).

- [ ] Decide and implement import handling for the legacy donor/group accounts below.
  Distinguish shared service identities from individual users assigned the `group`
  role; do not exclude all users with that role. Preserve history and selection
  ownership, and record decisions in the offline crosswalk before applying imports.
- [ ] Review the four accounts sharing pseudonym Person A under the phone-group
  policy. Two share a phone number; their emails and Google
  subjects differ, so they form a latent group rather than an automatically claimed
  user. Confirm shared/service-number exceptions before applying.
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
