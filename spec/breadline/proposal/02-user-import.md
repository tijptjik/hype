# Breadline user import: phone-based identities

Tracking: [account support #189](https://github.com/tijptjik/hype/issues/189),
[migration importer #194](https://github.com/tijptjik/hype/issues/194),
[identity parent #179](https://github.com/tijptjik/hype/issues/179), and
[migration parent #180](https://github.com/tijptjik/hype/issues/180).

## Production user sync and organisation users (5 November 2026)

Refs #189 and #194. Implemented and locally verified on 5 November 2026; production data
import and zero-write replay are now verified; authenticated directory, provider claims
and enrolment acceptance remain pending. See the completed-import evidence below.
Tasktjik's HYPE and Breadline projects hold the requested verification tasks; the linked
GitHub issues remain the public delivery record. Earlier local acceptance below does not
establish production readiness. This design supersedes the earlier
insert-only/fresh-target limitation.

### HKFoodWorks hub sign-in enrolment

Refs #189. Forward migration `0195_hkfoodworks_hub_sign_in_users.sql` enables
organisation users and Hub Sign-in for HKFoodWorks. Future sign-ins through its assigned
hub add an independent organisation User grant through the existing sign-in flow;
existing Member/Owner roles and other enrolment rules are preserved. The migration
appends history for organisations already enrolled in revision tracking, invalidates
stale forms, and makes no changes when both switches are already enabled. It does not
backfill prior sign-ins. Migration preparation and tests do not establish that it has
been applied to local, preview, or production databases.

### Admin profile editing

Refs #189. `/admin/users/[username]` now uses a shared persisted audience predicate for
full settings reads, profile updates, and messaging settings. Explicit SuperAdmins edit
globally; organisation Owners and relevant organisation Hub Admins edit only that
organisation's users only when `permitUserDetailsEdit` is enabled. Migration
`0180_organisation_user_details_permission.sql` defaults existing and new organisations
to off. Migration `0181_hkfoodworks_user_details_permission.sql` explicitly grants
HKFoodWorks this permission as the reviewed exception, preserving existing revision
history and leaving every other organisation unchanged. Advanced → Organization
Permissions exposes the grant; only explicit SuperAdmins may change it. Profile saves
recheck the live permission alongside the same-organisation membership, so revocation
also blocks already-open editors. Organisation form saves persist the grant atomically
with the parent revision; default-off snapshots remain compatible with pre-permission
history. Other admin roles receive public profile data only. The editor covers
identity/contact details, account status, language, appearance, contribution/admin
display preferences, experimental flags, and separate messaging settings. Saves use
revision conflict checks and database identity uniqueness.

Avatar uploads share the single-image lifecycle with organisation, project and hub logos
(Refs #189). Migration `0206_image_upload_attachment.sql` records verified assets
independently of attachment. Upload callers choose `immediate` or `deferred`; the
profile editor uses deferred attachment and submits an image ID on Save. The server
binds that ID to the uploader and destination, resolves the delivery URL, and commits
attachment with the profile's revision and live audience guards.
Reset/replacement/departure cancel pending receipts; attached receipts cannot be
canceled or replayed over a newer selection. Pending receipts expire after the signed
upload window plus 24 hours. Subsequent single-image upload requests reclaim up to ten
expired own uploads or terminal cleanup receipts; successful profile Save also requests
cleanup of replaced avatars. Currently selected avatars and historical logos remain
protected. This is opportunistic cleanup, not a background schedule. Tombstones remain
to prevent resurrection. Existing external avatar URLs are preserved when unchanged.
Logo attachment retains its existing resource and immutable image history. Feature
galleries retain their revision workflow. Transaction evidence is in
`src/tests/single-image-upload.services.test.ts`; profile control and API checks are in
`src/tests/user-profile-visual.component.test.ts` and
`src/tests/admin-user-save.test.ts`.

An organisation Maintainer entitlement remains pending a role-model decision: the
current organisation roles are User, Member, and Owner. No Member-to-Maintainer
promotion is inferred. See
[Authorization Design](../../../docs/specs/Design-Spec-Authorization.md) and
`src/tests/admin-user-{profile,edit-scope,save}.test.ts` for the profile boundary.

### Production schema boundary

A read-only inspection of `hype-db-prod` on 4 November verified receipts for 0085, 0086,
0089, 0090, 0091 and 0159, the actual telephone unique index, nullable import telephone,
claim audit columns and source-user/volunteer crosswalk schema. Both
`breadlineImportUser` and `breadlineImportIdentity` contained zero rows. The existing
identity schema is sufficient for initial insertion; source deletion eligibility now
adds a minimal `active` flag to the historic crosswalk.

The full requirement does need one schema-only migration for organisation-user
enrolment, role provenance and source-active status. Sync state stays in `.local`. The
pre-rollout inspection found only Owner/Member staff roles and no organisation-user
policy. It also lacked receipts for 0109–0158 and 0164–0167; having receipt 0163 is not
evidence of a contiguous schema. Reconcile actual schema and migration dependencies
against the exact release before applying anything. Never bulk-apply this dirty
checkout's migrations as an import prerequisite.

Personal records, credentials, source snapshots, reviewed decisions, identity seeds,
generated data SQL, before-images and execution receipts stay in private ignored
storage. Version control holds only code, synthetic fixtures and schema changes. The
production data upload is an explicit operational import, never a data migration
committed to Git. Migration `0168_organisation_users.sql` adds `organisationUserPolicy`,
`organisationRole.grant`, `breadlineImportIdentity.active`, indexes and role triggers.
The former 0169 production cursor prototype is removed. Selectively apply this reviewed
migration and record its receipt; do not mark unrelated migrations as applied.

### Organisation users and enrolment

Use the existing organisation-role architecture: **user < member < owner**. Every
stronger role qualifies for user inclusion; **staff** explicitly means member/owner.
User-only membership grants no staff, dashboard, project or management rights and never
appears in staff overviews. The existing primary key remains one effective role per
organisation/person. The JSON `grant` column maps independent reasons to levels, e.g.
`{"manual":"owner","breadline:123":"user"}`. Triggers derive the strongest surviving
role and delete the row only after the final grant is removed. Staff replacement changes
only manual grants. Imports, trusted hub sign-ins, verified domain matches, card
onboarding and project provisioning retain distinct provenance.

An organisation currently has zero or one owning hub through `organisation.hubId`; this
is an existing relationship, not a restriction introduced by the policy table.

Split the top of the organisation Capabilities tab into two columns: Users on the left,
existing capability configuration on the right; retain **Capability I18n** below. Use
the Languages panel's bordered, divided rows and shared Switch component for **Enable
Users specific to this Organisation** and the independent rules with OR semantics. Users
settings belong to the main organisation form: its dirty tracking, Save, Reset and
Cancel apply to them. The policy and organisation edits share an atomic transaction and
check both observed revisions; there is no separate save action.

- **If the user signs in through the hub** — offered only when the organisation belongs
  to a hub; use the trusted server-resolved hub and a durable signed-in user.
- **If the user's email address ends with @{domain}** — offered only when the
  organisation belongs to a hub; derive the domain from that hub, require verified email
  and compare normalized exact domain boundaries. An unverified imported email must not
  confer membership through this rule. The domain is not editable here. Sign-in resolves
  the current hub domain, so hub reassignment/domain changes cannot continue matching an
  earlier domain. The existing nullable `emailDomain` column marks whether this rule is
  enabled; its saved value comes from the hub.
- **If the user triggers the onboarding step in the custom card** — store the policy
  with the explicit action in the Breadline feature card and idempotent server enrolment
  endpoint. Full live sign-in/provider acceptance remains a release gate.

The master switch prevents automatic enrolment when disabled. Disabling a rule does not
silently remove historical membership; explicit grant revocation follows the same
audited membership policy. Hub reassignment and domain changes must not continue
granting membership from stale policy. Concurrent matching rules upsert a single
membership and preserve every applicable grant.

Add a **Users** tab to the organisation page when enabled, reusing
`UserDirectory.svelte`, its controls and server-side paging/search/sort. Scope every
query, count and profile/contact projection to that organisation on the server. Place
Capabilities immediately after Users and use the existing Features header shortcut
instead of a duplicate Features tab. Define organisation-owner and scoped administrator
access explicitly rather than bypassing the current hub-admin directory guard. Keep the
existing global admin directory available; ordinary organisation users cannot enumerate
other users. The component stacks Users before Capabilities below its two-column
breakpoint. The existing admin shell blocks widths below 1200px; Firefox interaction was
verified at that supported minimum, not at phone width.

### Settings integration verification (5 November 2026)

The 5 November settings correction is verified locally: 98 focused tests pass, including
atomic policy/form rollback, policy revision conflicts and current-hub domain matching.
Firefox verifies the shared Save and Reset, persistence after reopening, the original
policy restored after the check, and the switch layout at 1450px and 1200px without
overflow or page errors. The full concurrent workspace check reports 114 errors outside
the changed files. These corrections need no new database migration and have not been
included in a new production deployment. Private screenshots/logs are retained under
`.local/breadline/role-rollout/user-settings-correction/`.

### Repeatable source reconciliation

The development refresh now requires this reconciliation after both fresh source exports
and schema preparation, before donor/dropoff import or installation. It uses the
production accepted-sync manifest's source state and reviewed decisions, copied to the
local target identity, with the durable local ID seed. The refresh records a successful
reconciliation receipt only after zero exceptions and a zero-write replay; manual
recovery must satisfy the same gate. See the
[development rebuild workflow](../../../docs/refactor-guides/Development-Database-Rebuild.md).

1. Plan against the last accepted local target state; consecutive runs do not pull HYPE
   production again. Pin a complete source snapshot, target identity, private decisions
   and durable per-target seed. Apply the established E.164 normalization, email
   fallback, reviewed email families, telephone overrides, exclusions, title-case
   profile cleanup and explicit existing-target adoption/merge decisions. Revalidate old
   decisions against current source values; do not regenerate the seed on conflict.
2. Match accepted identities by source user ID to their stable HYPE owner, retaining
   source volunteer IDs independently for future runs and collected values. A phone or
   email change must not produce a new HYPE identity or transfer history.
3. Add durable per-source fingerprints/checkpoints and before/after evidence for all
   relevant related records, including profile, volunteer, legacy membership and role
   records. Define a field-level source-owned/HYPE-owned mapping; ingest changed
   source-owned data, but preserve credentials, verified claims, HYPE roles and
   independent HYPE edits. Legacy roles are evidence, never staff grants. Stage related
   history that has no target model without claiming it was imported.
4. Plan creates, updates, related-record changes and removals explicitly. Unchanged
   input must produce a zero-write replay. Nonconflicting new users and new source
   identities for an accepted owner should reconcile without manual SQL. Actual owner
   collisions, ambiguous merges or conflicting credentials still require adjudication
   instead of reopening claim ownership.
5. Assign every retained imported user an HKFoodWorks Organisational User grant,
   idempotently, without changing staff roles. Preserve all many-to-one mappings.
6. Detect deletion only from a successfully completed full source snapshot or
   authoritative deletion feed, never from failed/partial pagination. The user-approved
   policy is to deactivate the deleted source identity, revoke its import grant, and
   remove active membership only when no surviving source identity or other enrolment
   reason supports it. Retain a tombstone and history join. Do not globally delete an
   independently used/claimed HYPE account. Restoration reactivates the same source
   identity and stable owner; shared owners retain membership until their last
   supporting grant is removed.
7. Implement a production apply command with an exact reviewed plan/input hash, target
   binding checks, stale-target preconditions, a single-writer guard, checkpointed
   bounded writes and restart-safe receipts. Use private backup and tested
   compensation/recovery; do not assume a multi-batch D1 import is one atomic
   transaction. Gate claim/enrolment traffic as needed to prevent ownership races.

The original `users.ts` planner remains an initial-import/rehearsal tool. The new
`sync-users.ts` reconciles accepted cohorts using `lib/user-sync.ts` and the existing
reviewed matching rules. It permits nonconflicting additions to a shared owner; actual
owner merges/splits, changed volunteer IDs, reuse of a retained volunteer ID by another
owner, and destination collisions stop the entire apply for review. No credentials or
claim ownership are reassigned.

### Messaging discovery and release verification

Exclude WhatsApp/Telegram phone discovery from user import. Existing bounded lookup
tooling is not evidence that probing is safe or that it caused a prior ban. Review
provider/account restriction notices and timestamped lookup activity privately,
distinguish rate limits from bans, and assess official supported discovery and
user-initiated linking before enabling any bulk lookup. No probe is needed to import or
identify an HKFoodWorks user, and this review must not block an import with discovery
disabled.

Implement schema/authz first, then enrolment and directory, then reconciliation and
production application. Rehearse against an isolated fresh production snapshot with the
reviewed Breadline source. Verify initial import; zero-write replay; new users; changed
profiles/phones/related records; deletion/restoration; shared identities; claimed users;
concurrent login/enrolment; stale-plan rejection; interruption/resume; and rollback.
Confirm complete source coverage or explicit reviewed exceptions, stable user/volunteer
joins for future run values, referential integrity, no leaked credentials/PII and no
automatic messaging calls.

Use `dev-check` for focused automated validation. Browser acceptance uses the existing
authenticated session, all enabled enrolment paths, organisation scoping, contact
permissions, paging and narrow Firefox layout. Only after these gates pass should
schema/application deployment and the separately reviewed private data import be
scheduled. Production write/deploy has not been performed by this implementation
exercise.

### Implemented ownership and operational commands

`breadlineImportIdentity` remains the stable source-user/source-volunteer crosswalk.
`breadlineUserSyncState` retains the completed source row plus related records and a
fingerprint; a source-only change updates this private state even where the future
run/collection model is not implemented. Counters and historic events are not
materialized as HYPE runs or summed into new totals.

The importer owns the source crosswalk, its telephone provenance, its per-source
membership grants and tombstones. For existing users it updates name, locale, image and
telephone only when the current value still equals the previous accepted source
projection and the account has not been claimed at runtime. An actual profile change
also updates `user.updatedAt`. Newly ambiguous source cohorts do not clear an
established claimed profile. Primary email, verification, credentials, runtime claims,
HYPE edits and staff roles remain HYPE-owned. On first adoption of an existing local
import, state and membership are established without rewriting its profile.

Local refresh verification on 6 November 2026 reconciled 14,314 source users against the
fresh HYPE production mirror: five new users, six existing name updates and 51 updated
existing source snapshots, with no removals, restorations or exceptions. The seven
reviewed exclusions remain. In total, 14,307 source identities map to 13,499 local HYPE
owners. All 14,302 prior source owners, 13,568 existing account rows and existing
organisation roles were preserved. Source evidence includes related records; these
counts do not establish imported HYPE run history. Installed replay has zero mutations,
exceptions and checkpoint changes. Private plans, before-images, read-back verification
and accepted local state are retained under
`.local/database-refresh-20261106/user-reconciliation/`. Production was unchanged.

Use an explicit complete source mirror, retained seed, decisions and accepted target
file. The default mirror may be older than the reviewed rebuild input; never choose it
just because its path is shorter. For production, bootstrap one private accepted
baseline from the reviewed initial destination and release schema; subsequent plans
reuse that file, with remote before-image checks instead of another production dump.

```sh
# Writes only a private plan and source backup; no target writes or network calls.
bun run breadline:users:sync \
  --state .local/breadline/target/sync-state.json \
  --database /private/accepted-target.sqlite \
  --mirror /private/complete-breadline.sqlite \
  --seed-file /private/identity-seed.json \
  --decisions /private/user-decisions.json \
  --organisation hkfoodworks --out /private/user-sync-plans

# Local rehearsal/application: the plan hash is printed by the planner.
bun run breadline:users:sync \
  --state .local/breadline/target/sync-state.json \
  --database /private/local-rehearsal.sqlite \
  --apply-plan /private/user-sync-plans/REVIEWED.plan.json \
  --expect-hash REVIEWED_SHA256

# Production only, after release/schema/rehearsal gates are satisfied.
bun run breadline:users:apply-production \
  --state .local/breadline/target/sync-state.json \
  --database /private/accepted-production.sqlite \
  --plan /private/user-sync-plans/REVIEWED.plan.json \
  --expect-hash REVIEWED_SHA256 --target production:EXACT_DATABASE_ID
```

The seed's target identity must match the chosen baseline; local and production seeds
are separate. Plans with exceptions cannot apply. Run heavy local rehearsals through
`dev-check`. Source backups, plans, local before-images and receipts are private
artifacts; keep them in ignored `.local/` or equivalent private storage.

Local target writes use one immediate SQLite transaction with an FK check. Source
payloads, fingerprints, accepted checkpoint and progress live in private `.local` JSON
files, written with temp-file/fsync/rename and restricted permissions. A local operator
lock serializes each target; retain it for inspection after a crash.

Production uses bounded atomic D1 batches. Every row must match either the exact
before-image or expected after-image; conflicts abort the whole batch. The operator
advances its local journal only after success. If a response is lost, retrying that
batch accepts already-applied rows without rewriting them. This is resumable, not
globally atomic. There are no production checkpoint, payload, cursor or auth-fence
tables and consecutive runs do not export HYPE production.

### Interrupted production application and recovery

Retain the hashed plan, local baseline, journal and production recovery point. Resume
the same command after resolving a transient failure; inspect a crashed local lock
before removing it. Do not plan another import against a partly applied target. A
conflicting production edit stops the batch for reviewed reconciliation rather than
overwriting independent HYPE changes. Keep the original plan and before-images for
compensation or controlled restore. Promote private source state only after remote
completion and local baseline application; guarded local replay recovers a crash between
the SQLite commit and private state promotion.

### Approved role-refactor verification (5 November 2026)

The actual local database was backed up and the conversion rehearsed first. 14,219
source payloads moved to private JSON; 14,219 Breadline reasons now occupy the existing
role architecture, preserving staff and all 13,419 HYPE identity owners. Old
membership/payload/cursor tables were removed locally. SQLite integrity and FKs pass.
Replay against the reviewed snapshot has zero mutations and zero exceptions. 40 importer
regression tests pass, including lost-response replay and conflict rollback. Grant
trigger tests pass with recursive triggers both enabled and disabled; stronger-role
inclusion and source revocation preserve independent roles. Production rollout
acceptance remains pending until recorded below. The retained production baseline yields
25 existing-account conflicts covering 29 reviewed HYPE accounts, including four
previously reviewed duplicate-account merges. The bulk import remains blocked until
guarded production adoption can verify current state. Automatic approval review rejected
both a fresh full database export and a credential-bearing equality comparison; neither
operation ran. A D1 Time Travel recovery bookmark was recorded without exporting
records. Schema/application rollout is independent of these blocked data operations.

### Local verification evidence (5 November 2026)

Using the retained complete 22 October source snapshot: 14,226 source rows, seven
reviewed exclusions, 14,219 retained source identities and 13,419 existing HYPE users.
The initial prototype added 14,219 source-state rows and 14,219 Breadline grants, with
no new user/account rows and no exceptions. The installed local database has 13,419
HKFoodWorks members, no FK errors, and a zero-mutation replan. Related source history
remains private evidence for later import, not completed event-history migration.

Earlier prototype validation passed 38 importer tests and 55 organisation/auth/directory
tests; those results do not establish acceptance of the approved role refactor. Tests
exercise initial/repeat sync, new and changed identities, related-only changes,
deletion/restoration, shared owners, local edits/claims, reviewed decisions, incomplete
mirrors, stale plans, rollback, and simulated D1 interruption/resume and writer
exclusion in the former prototype. Organisation/auth tests cover scoped permissions,
exact verified domains, independent grant retention, card onboarding and deleted-source
claims. Chromium and Firefox verify the enabled Users directory, 25-to-50-row paging,
search/reset and no page errors. Firefox was tested at the 1200px admin minimum; the
existing shell blocks interaction below that width. A temporary published local
hierarchy verifies card onboarding, one grant after reload and isolation of its
one-member directory; the fixture is removed afterward. This also caught and fixed core
routing without a hub database ID.

The current canonical app check reports 108 errors and 20 warnings across 52 files,
primarily conflicting Svelte `Snippet` identities; this checkout contains both Svelte
5.57.2 and 5.57.3. The earlier clean check does not supersede this failure. Resolve the
dependency/type-check baseline before release. The operational-script type check passes
separately.

These are local/synthetic results. Production initial reconciliation, live provider
sign-in enrolment, real D1 apply/restore and post-deploy replay remain unverified.
Production still needs the reviewed schema migrations and a separate private data
upload. WhatsApp/Telegram discovery is explicitly deferred and never called by sync.

## Reviewed existing-target adoption (23 October 2026)

This supersedes the original fresh-destination-only limitation below. Email equality
still cannot authorize adopting an existing HYPE user. The operator reviews each source
cohort and explicitly chooses its existing anchor; multiple target owners require
explicit merge approval. Private decisions and case evidence remain ignored.

`scripts/breadline/lib/target-adoption.ts` validates the case manifest hash and exact
source cohort, retains the anchor ID, and fences the source, target seed, source
decisions, complete affected rows, credentials and authorization. Application uses an
immediate SQLite transaction on an offline database, saves an exclusive full
before-image, and rejects stale execution. Rebuild-stage preparation independently
checks the reviewed snapshot's full users, accounts, passkeys, sessions, roles and
import ownership; content is fenced at the current pre-import stage because later
Feature import and development fixtures are absent at that point.

Foreign-key introspection and explicit unconstrained user-reference columns cover
content, attribution and history. Unknown embedded references stop a merge. Existing
credentials retain their provider identifiers and secret fields; portable source Google
identities may attach only to the approved owner. No source role is granted. Identical
membership rows coalesce, and an existing Organisation Owner remains Owner when combined
with Member. Other conflicting membership/content rows stop for review. Source names
remain unchanged in private crosswalks; new profile names use title case, with
explicitly reviewed names taking precedence for adopted accounts.

The normal planner accepts retained anchors only through persisted import ownership and
exact crosswalk replay, still enforcing phone ownership and archive/anonymous checks.
Private replay receipts and before-images permit exact verification and offline
rollback. This tool does not implement a live production write path.

Run the standalone rehearsal with three positional paths: review JSON, case JSONL, and a
new output directory. For normal development preparation, pass
`--identity-review /absolute/private/review.json` to `scripts/dev/rebuild.ts`; the
adjacent `cases.v1.jsonl` is mandatory. Use `--inputs` for the reviewed retained export.
Omitting `--apply` leaves the running development database untouched. Changed source
snapshots or reviewed identity/role state require renewed preparation and adjudication;
the identity seed must never be replaced to resolve a collision.

The reviewed 22 October checkpoint contains 14,226 source users: 14,219 now map, seven
remain explicitly excluded, and none remain unresolved. The isolated rehearsal adopts 25
cohorts (39 rows), absorbs four duplicate HYPE users and preserves all 25 anchors.
Independent comparison verifies 77,529 existing rows across 70 tables, including 3,323
reference changes, without unrelated content/credential changes. Normal rebuild
preparation with and without mocks also passes user/Feature replay, integrity and
foreign-key checks. The full development run verifies 26 fixture scenarios; its map
preparation now includes the task fixture namespace. Forty-nine focused
importer/adoption/rebuild tests and the standalone adoption TypeScript check pass. Local
installation is verified below; production rollout remains separate.

### Current-state-preserving local installation (23 October 2026)

After explicit installation approval, the temporary Google claim fixture was removed
with scoped restoration of its former profile/credentials and latent cohort. Test
sessions remain revoked. Newer local tasks, Location reviews and address revisions made
the older prepared export unsuitable for installation. Instead, a fresh backup of
current local state received the same reviewed adoption and name cleanup.

An independent comparison verified 105,483 existing rows across 75 tables, permitting
only approved ownership/attribution substitutions and duplicate membership coalescing.
All other user fields, including current preferences, were retained. The exact
application-state comparison passed again after stopping local writers; the guarded
installer retained Miniflare metadata and an immutable pre-install rollback backup.

Installed verification confirms all 25 anchors, 39 adopted source rows, four absorbed
duplicate users, 3,073 imported name cleanups, zero unresolved source rows and zero
inserts on normal replay. The temporary test eligibility is absent. Integrity and
foreign-key checks pass. Existing event/run tables are still not imported; this is local
identity acceptance only, with no production write or deployment.

### Manual Google claim acceptance (23 October 2026)

A real Google sign-in on the normal local database successfully claimed a pre-existing
latent user containing two Breadline source identities. Database verification confirmed
the retained user ID and generated username, verified primary email, claimed ownership,
one Google credential, one session, both unchanged source user/volunteer mappings and
zero inherited roles. The additional eligible test identity uses a negative source key
and `local-fixture` marker; it is not a real Breadline source row. The former local
login was removed and its attribution profile archived, preserving authored content.
Private before-images and a scoped restore tool remain outside Git.

For this manual OAuth check, use `bun run dev -- --port 5173` and the registered
`http://localhost:5173` origin. The ordinary configured port may differ; the OAuth
callback must match the provider registration. Use the normal app rather than an
automatic development-admin persona. Do not change provider registration or substitute
test credentials in production to make the local callback work.

The 13 production-handler claim integration tests also pass, including concurrent
first-winner, stale loser, rollback and explicit later linking. The manual sign-in
establishes the winning claim only; a second real Google candidate was not exercised.
Run history is not yet imported into this database, so neither its ownership migration
nor its UI display is accepted by this test. Restore the local fixture before installing
the real reviewed identity-adoption rebuild. No production account was modified.

## Phone-based latent users: replacement design (18 October 2026)

Refs #189, #194. The user planner now groups by normalized phone and supports
single-identity auto-claiming. The destination will be reset: reconciliation of
previously imported HYPE users is outside this implementation. Local preparation and the
phone-completion update have been applied only to local D1; production and the source
mirror are unchanged. Old email-based plans must be regenerated. The first-login claim
workflow is now integrated with verified social sign-in and one-time email sign-in
links; apply migration 0090 with the reset schema.

### Identity and ownership

A HYPE `user` is the persistent person/history identity. An `account` is a linked
authentication credential. One user can have several explicitly linked credentials.
Import one user per structurally valid normalized E.164 phone. Without a usable phone,
group by exact normalized email or a reviewed email family instead, storing NULL
telephone and preserving all user/volunteer mappings. Both grouping paths have these two
outcomes:

| Source identities within a phone group                                               | Import result                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Exactly one distinct normalized email and at most one distinct nonblank trimmed name | Auto-claimed: retain that email/name and import portable Google credentials           |
| Multiple emails, multiple names, or no email                                         | Latent: NULL primary email/name/image, false email verification, no login credentials |

Repeated rows and casing/whitespace variants of the same email do not create additional
identities. Names are trimmed but otherwise compared exactly; missing names do not
introduce another identity. A name alone cannot establish a claim. Imported profile
names are title-cased after the claim decision (Refs #189, #194), including letters
after hyphens and apostrophes. Uncased scripts remain unchanged. Private source names
and exact replay comparisons retain their original casing; this presentation cleanup
does not resolve ambiguous identities or overwrite existing HYPE profiles on replay.
Reviewed target adoptions and account merges remain a separate guarded workflow.
Auto-claiming assigns the unambiguous legacy identity; it does not itself prove mailbox
ownership. `emailVerified` retains the previous verified-Google evidence rule.
Facebook/unknown subjects are retained as private source evidence, not turned into
invented provider accounts. Auto-claimed users without portable credentials need the
normal verified-email recovery/sign-in flow.

Both classes use `isAnonymous=false` and `isArchived=false`. Do not reuse the guest
marker: guests can have usable sessions, whereas latent users have no credential or
session created by the import. No placeholder email is generated.

### Schema and private provenance

`migrations/0085_breadline_users.sql` adds nullable `user.telephone`.
`0086_username_display_case.sql` adds display casing and case-insensitive username
uniqueness. `0089_breadline_phone_identity.sql` adds:

- A unique index on `user.telephone`; multiple NULLs remain possible for users awaiting
  phone completion.
- `breadlineImportUser`: unique user and imported phone, `claimed`/`unclaimed` state,
  and `claimedEmail` (NULL while unclaimed). Import auto-claims are distinguishable from
  verified-email state on `user`; no login timestamp is invented.
- `breadlineImportIdentity`: every retained source user/volunteer ID, normalized source
  email, trimmed name and original provider subject, mapped to its HYPE user. These
  records supply history ownership and first-login eligibility.

These tables are private migration evidence, not public profile or session fields.
Migration `0091_breadline_email_identity.sql` makes the imported phone nullable without
changing user IDs, source mappings or claim audit fields. The Drizzle definitions and
rehearsal include it. The migration intentionally fails on duplicate existing phones
rather than merging or deleting existing users; apply it as part of the planned database
reset. Phone uniqueness constrains users, not the number of credentials on `account`.

### Normalization and review boundaries

The shared `src/lib/utils/telephone.ts` normalizer strips whitespace before parsing HK
national numbers, `+852`, bare `852`, international `00` prefixes and other
international numbers into E.164. All HK numbers require exactly eight national digits;
other countries use the library's structural length checks. Extensions and unparseable
inputs fail validation. Allocation-range warnings remain separate from structural
validity and do not establish reachability or phone ownership.

Missing or malformed phones can inherit the sole known valid phone for an exact
normalized email or explicitly reviewed email family. Otherwise a usable email preserves
the user with NULL telephone; unrelated NULL phones never form a shared identity.
Missing both a valid phone and usable email still requires review. Existing crosswalks
retain their history owner when a malformed imported phone is cleared.

Emails are trimmed and lowercased without rewriting dots, plus-addresses or provider
aliases. Invalid emails/timestamps, one email or Google subject spanning multiple
phones, and one volunteer spanning multiple phones are quarantined with every source ID
retained. Existing destination identities colliding by phone, email or Google subject
block the group; this importer does not consolidate established HYPE users.

Reviewed exclusions still come from private `.local/breadline/user-decisions.json` (or
`--decisions path`) and preserve explicit excluded source user/volunteer entries. A
volunteer shared by an excluded and retained source identity blocks the retained group.
Prior explicit email-merge rules must agree with phone grouping; they cannot choose a
winning email in an ambiguous group or combine different phones. Real addresses and
private decisions must remain outside Git and public issue bodies.

### Stable IDs, profiles and history

User IDs are opaque 12-character HMAC-derived IDs keyed by normalized phone and a
private durable per-target seed. Keep
`.local/breadline/users/<target>/identity-seed.json` across retries. Plan model
`phone-v2` rejects legacy plan artifacts at SQL rendering and rehearsal. Username
generation still uses the shared positive-adjective whitelist and `AdjectiveRunner00`
display spelling, with a lowercase canonical username and case-insensitive collision
retries. Existing username migrations and reviewed HYPE renames remain independent of
this import.

For auto-claimed groups, choose the latest Google profile, otherwise latest source
profile, for locale/image. Creation/modification dates span the group. Default
preferences remain database defaults. Old tokens, sessions, passwords and NGO links are
not imported.

Every contributing source user and volunteer maps to the same HYPE user. Future claims,
runs and collection imports must use that crosswalk and exclusions, preserve source
event IDs, and deduplicate repeated extraction/join rows rather than distinct source
events. Do not sum legacy counters into reconciled event totals. The broader
event/schedule/property schema remains inactive under `drafts/`; this stage imports
identity/provenance, not run or collection event records.

Repeat planning recognizes only an existing seeded user with its persisted import
ownership and identical source identity cohort. It creates no new rows, never reopens a
claim or attaches losing credentials, and permits the owner's primary email to have
changed after claiming. A changed source cohort is quarantined for review rather than
silently altering accepted eligibility. Target IDs and history crosswalks remain stable
while the source grouping and seed are unchanged.

### First verified login for latent users

`src/lib/auth/breadline-claim.server.ts` integrates with Better Auth's validated
user-creation flow and the production Drizzle adapter. Verified OAuth profiles resolve
private email eligibility and retain the latent user ID. User creation is deferred; a
single guarded D1 batch assigns ownership, fills the primary verified email/profile, and
inserts only the proven provider credential. The batch's request nonce gates every
write. Constraint failures roll back the entire claim. A losing stale request cannot
update the profile or attach an account; a retry by the winning provider uses Better
Auth's ordinary persisted account lookup. Sessions are issued after commit.

The sign-in panel also offers **Email me a sign-in link**. Better Auth stores a hashed,
15-minute, single-use token and verifies mailbox control before claiming the latent
user. This supports providers without a verified-email assertion. An unverified social
login cannot claim and receives instructions to use the email link. A typed password
signup for an eligible email sends a sign-in link while returning Better Auth's opaque
signup response, so it neither reserves the email nor strands the user. Normal
sign-in-link requests do not disclose private candidate names or eligibility.

Migration `0090_breadline_claim_audit.sql` adds `claimedAt` and a private batch nonce
`claimKey`. Import auto-claims retain NULL audit timestamps until any future separate
login-activity tracking; they are not fabricated login events. Pending proof lives only
in request-local context, never a cross-request identity map or client field.

Remaining candidate emails cannot access the imported user after claiming. They may
create separate ordinary HYPE accounts without its history. The claimed owner can
explicitly link another social identity using the existing authenticated linking flow.
Email/phone edits, unlinking and repeat imports do not reopen eligibility. Profile email
changes cannot reserve an unclaimed import's email.

Session creation and cached-session/authenticated-request checks deny unclaimed and
archived users. The claim batch checks archive state again to reject stale proofs.
Existing history rows and source crosswalks retain their user ID throughout claiming.
Consolidation of a separately established HYPE user remains outside the reset/import
scope; the claim flow does not transfer another user's credentials, roles or activity.

`src/tests/breadline-claim.integration.test.ts` exercises the production auth factory,
Drizzle adapter and actual SQLite constraints behind a D1-compatible atomic batch. It
covers verified/unverified social login, first-winner concurrency, rollback/retry,
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
or insert users. For an offline destination use
`--target-snapshot /private/hype.sqlite`; that snapshot must contain the current
ownership/crosswalk tables.

Artifacts are `plan.json`, `target-identities.json`, and `review.sql` containing
user/account/ownership/crosswalk inserts. Rehearse with:

```sh
bun run breadline:users:test --plan .local/breadline/users/local/<run>
bun run breadline:db:test
```

Rehearsal executes the actual review SQL against the real Drizzle schema in disposable
memory and checks all four table counts, foreign keys and SQLite integrity. The command
does not accept `--apply`. Execute no stale SQL: applying still needs a fresh
destination check, backup, atomic batches and post-write reconciliation. The general
conversion stage registry remains empty; this change does not enable remote imports or
prove live OAuth.

## Phone audit correction and local rebuild (19 October 2026)

Refs #189, #194. The source is exclusively `breadline__public__users` from the private
Breadline mirror, checkpoint 2026-10-16 15:18:18 UTC. Source rows total 14,186. There
are 2,746 NULL phones, including seven reviewed exclusions: the earlier “2,739
missing/invalid” count was entirely missing phones. No supplied nonblank phone is
unparseable under the existing possible-number policy. Fifteen supplied numbers fail
full `isValid()` validation and remain explicit private warnings; these are separate
from the missing-phone count and are not claims of reachability/ownership.

The earlier ten “cross-phone conflict” rows were a planner bug: NULL identity phones had
been inserted into phone sets as synthetic distinct keys. Six groups had only one real
phone. Exact-email/reviewed-merge recovery now maps eleven additional missing-phone rows
and admits the ten falsely blocked valid-phone rows. Genuine multiple-number conflicts
still fail closed. The completion policy below supersedes the former quarantine of
missing/invalid phones.

The initial corrected local import created 10,667 Breadline users (9,965 auto-claimed
and 702 latent), persists 11,451 source-user mappings, retains seven reviewed
exclusions, and initially quarantined 2,728 rows with no resolvable phone (superseded
below). A repeat plan against the installed database produces zero new
users/accounts/crosswalk inserts and identical exceptions. These counts exclude local
fixtures and development personas.

### Email fallback and mandatory phone completion (19 October 2026)

Refs #189, #194. Of the fifteen allocation-validation warnings, four HK values have six,
seven or nine national digits after whitespace removal. They are now rejected as phones.
Eleven other values remain structurally possible allocation warnings. Five of these
fifteen source identities have eight run rows and 88 recorded collected pieces in total;
source user/volunteer mappings are preserved independently of phone acceptance.
Historical event application remains deferred.

The updated source plan maps all 14,179 retained rows to 13,386 Breadline users (12,678
auto-claimed, 708 latent), with seven reviewed exclusions and zero exceptions. There are
2,723 imported users awaiting a phone, including formerly missing-phone email
identities. Fresh preparation and incremental local application both prove
repeatability; the incremental update preserves existing user IDs, credentials and
sessions while clearing only four malformed phones. Source totals exclude fixtures,
reserved dev personas and anonymous browsing sessions.

After any durable-account login on the Breadline hub, `handleBreadlinePhone` reads the
current persisted phone before page/data/API/remote access. Missing/invalid phones
redirect navigation and SvelteKit data loads to `/account/phone`; direct API and remote
calls receive `403 BREADLINE_PHONE_REQUIRED`. Auth/sign-out, policies, static assets and
completion remain reachable. Guests and other hubs keep their existing access policy.
Client-side sign-in also navigates to completion. Neither cookie caches nor a stale
valid session phone bypass the server check.

The same-origin completion action accepts only the session owner's phone, applies the
shared normalizer and preserves the user's identity/history. The unique phone index
arbitrates collisions: a phone on another account returns recoverable feedback, never an
automatic merge or history transfer. This is a structural contact check; SMS
verification is not introduced. Auth profile updates cannot write telephone through
Better Auth's additional-fields input. The form is localized in all three supported
languages.

### Reviewed telephone overrides

Refs #189, #194. Private `user-decisions.json` accepts optional `telephoneOverrides`
entries with `sourceUserId`, `expectedTelephone` and `telephone` (NULL or a canonical
corrected number). A NULL override suppresses phone inference for that source row,
retains its normalized email and all source/volunteer mappings, and requires phone
completion after login. The original source remains unchanged. An expected-source
comparison ignores whitespace but fails closed if the stored number changes, so a later
source correction cannot be silently erased by an obsolete decision. Invalid correction
formats and duplicate source IDs are rejected before planning.

The reviewed correction set covers four single-email identities from the five-user
run-history audit. The explicitly retained fifth phone is not overridden. Personal
names, contacts and the exact correction set stay in the private decision file. A later
supplied correction can replace NULL with a validated canonical number.

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
pre-rebuild backup. Twenty-nine missing historical publisher/contributor references were
retained as archived, credential-free profiles with NULL email/phone; original
credentials were not restored or linked to imported accounts. Thirty-one pre-existing
orphan translation rows cannot satisfy the current schema's feature FK and remain
preserved in the private recovery receipt/source backup instead of inventing features.
The repair transaction proves unchanged pre-existing identities and exact application
row restoration, apart from those isolated orphan translations. Foreign keys and
integrity pass. See `scripts/breadline/restore-local-application.py` and its regression
tests; no remote database or source mirror was modified.

The source identity plan and optional private `.local/breadline/local-users.json`
fixture plan are imported separately. Local fixtures contain a canonical phone and at
least one distinct eligible email. Stable negative source keys, NULL volunteer IDs and
the `local-fixture` subject marker distinguish them from real Breadline rows; fixture
rows never contribute to source counts or history mappings. An email named “admin” does
not grant an admin role. Fixtures remain unclaimed without credentials.

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
`scripts/breadline/local-bootstrap.test.ts` cover phone recovery/conflicts, local
fixture isolation/idempotence and the complete source/migration/bootstrap chain.

## TODO: donor and group account treatment

Tracking: [user import #194](https://github.com/tijptjik/hype/issues/194),
[account support #189](https://github.com/tijptjik/hype/issues/189).

- [ ] Decide and implement import handling for the legacy donor/group accounts below.
  Distinguish shared service identities from individual users assigned the `group` role;
  do not exclude all users with that role. Preserve history and selection ownership, and
  record decisions in the offline crosswalk before applying imports.
- [ ] Review the four accounts sharing pseudonym Person A under the phone-group policy.
  Two share a phone number; their emails and Google subjects differ, so they form a
  latent group rather than an automatically claimed user. Confirm shared/service-number
  exceptions before applying.
- [ ] Add import tests for the agreed treatment of shared identities, individual group
  accounts, and associated history/drop-off selections.

The identifiers below are legacy `users.id` values (not OAuth `users.uid` subjects).
Names and email addresses are pseudonymized; email labels use the reserved
`example.invalid` domain and do not reveal original address fragments. Real names,
emails, phone numbers and OAuth subjects remain in the private local source export.
Counts reflect the 2026-10-16 15:18 UTC source snapshot and represent stored records,
not necessarily completed runs or unique attendance days.

| Legacy user ID | Role  | Pseudonym             | Anonymized email              | Run records | Drop-off selections | Review classification                                    |
| -------------- | ----- | --------------------- | ----------------------------- | ----------: | ------------------: | -------------------------------------------------------- |
| 6              | donor | Shared Donor Identity | donor-service@example.invalid |           0 |                   0 | Hard-coded shared donor identity                         |
| 6828           | group | Shared Group Identity | group-service@example.invalid |           0 |                   0 | Hard-coded shared group identity                         |
| 82573          | group | Person A              | person-a-1@example.invalid    |          11 |                  24 | Individual-looking Google account; retain pending review |
| 85354          | group | Person A              | person-a-2@example.invalid    |           0 |                   0 | Individual-looking Google account; retain pending review |
| 85486          | group | Person A              | person-a-3@example.invalid    |           8 |                  14 | Individual-looking Google account; retain pending review |
| 92110          | group | Person A              | person-a-4@example.invalid    |           0 |                   3 | Individual-looking Google account; retain pending review |
| 109097         | group | Person B              | person-b@example.invalid      |           3 |                   8 | Individual-looking Google account; retain pending review |

Legacy auth code explicitly uses user 6 for donor tokens and user 6828 for group link
tokens, carrying the actual donor/leader in token claims. The other accounts are
identified by their assigned role, not by hard-coded service use. No account has been
excluded or merged as a result of this TODO.

## Hype user directory

Related account work: [#189](https://github.com/tijptjik/hype/issues/189).

The `/admin/users` directory and its sidebar link are available to administrators of the
active hub and core administrators. Both the server page guard and the directory variant
of `searchUsers` enforce this policy. Organisation/project owners retain the existing
member-picker search without access to the extra directory fields.

The list loads 25 users per page, with server-side search across name, username, email
and attribution. Rows show avatar, name, case-preserving username, attribution, locale,
archive status and join date, with permission-filtered contacts. HYPE/core HubAdmin and
explicit SuperAdmin can see all email addresses and phone numbers. Other HubAdmins await
hub-specific interaction/onboarding rules for email access. Telephone is additionally
available to explicit `manageVolunteers` or `manageDropOffs` holders for users in a
shared, non-archived project in the active hub. Email verification metadata is omitted.
The shared admin header and control bar provide server-side sorting by name, email, join
date or update date, plus tri-state archived, has-email and has-phone filters. Presence
filters treat blank values as missing and apply before paging/counting. The initial view
excludes archived users. Settled rows and empty results remain mounted during
replacement queries; keyed FLIP and fades animate result changes. No account
identifiers, tokens or legacy import metadata are returned.

### Admin user profiles

`/admin/users/{username}` resolves canonical usernames case-insensitively. The user
directory and admin attribution cards link to it. Profile reads reuse the user-search
entitlement: authenticated hub administrators, organisation/project owners and
explicitly assigned volunteer/drop-off managers may open profiles; ordinary members and
guests cannot.

The `getAdminUserProfile` remote chooses fields on the server. Active-hub/core
administrators and super administrators receive the directory's non-contact fields.
Contact fields follow the same core/SuperAdmin and scoped management-capability rules as
the listing. Eligible managers receive details for targets whose phone they may read;
other eligible viewers receive only username/display username, avatar, attribution and
contribution summaries. Non-directory viewers cannot read archived profiles. No provider
accounts, tokens, preferences or experimental settings are returned. This is a read-only
view and introduces no additional profile-editing or role-assignment permissions.

Contributions reuse the existing hub-scoped public profile query and shared feature and
photo sections, with links into admin feature pages. They cover published map
features/photos and associated submission/report counters, not Breadline run history,
which remains a later event-import stage. See `src/tests/admin-user-profile.test.ts` for
field-projection, role, archive-filter and username-lookup checks.

### Selective role-schema rollout (5 November 2026)

Migration 0168 was rehearsed against the retained production baseline, then applied
selectively to `hype-db-prod` with its own receipt. Production verification preserves
all 23 existing staff assignments (14 owners, nine members) with manual grants;
foreign-key errors are zero. The five former membership/source-state/cursor tables are
absent. There are still zero Breadline crosswalk rows in production. No unrelated
pending migrations were marked as applied. A private Time Travel bookmark precedes the
schema change. Application deployment and data import have separate receipts.

Do not roll the application back to pre-hierarchy code once user-level production roles
exist: older any-role checks may treat them as staff. Prefer a forward fix, or a
reviewed coordinated recovery of schema/data and application. During this stage before
the data import, production roles remain member/owner and enrolment rules are off.

### Selective application rollout (5 November 2026)

Worker version `24b3a028-3812-49e3-84e7-0fe1836402d5` is deployed at 100%. The isolated
release starts from the exact previously deployed source and includes 43 selected
changed paths. Unrelated working-tree changes and pending migrations were excluded.
Existing routes, service bindings, variables and secrets were retained. The four public
domains return HTTP 200 HTML after deployment; this is public-route health evidence, not
authenticated production UI acceptance.

HKFoodWorks Users is enabled in production with all automatic enrolment rules off.
Read-back verification confirms 14 owners and nine members, matching manual grants, zero
foreign-key violations, zero Breadline crosswalk rows, only the 0168 receipt from this
rollout and no obsolete membership/payload/checkpoint/cursor tables. The production user
data import has not run.

Validation: 40 importer tests, 83 focused runtime tests and 13 isolated-release tests
pass. Operational importer TypeScript checks, the production build and Wrangler dry run
pass. The isolated full app check has the same 11 errors and 19 warnings as the
unchanged deployed baseline, with no added diagnostics. Local Firefox verifies 13,419
users, 25-to-50-row pagination, search/reset and no page errors or horizontal overflow
at the supported 1200px admin width. The browser connector was unavailable for
authenticated production verification.

Private deployment, schema, HTTP, recovery and validation receipts plus selected source
hashes are retained in `.local/breadline/role-rollout/`. Source changes remain
uncommitted; these receipts identify the actual deployed artifact independently.

Remaining import gates are updated by the latest-source and comparison evidence below.
Production apply/recovery, authenticated directory and claim verification, and
zero-write replay remain unverified. Messaging discovery remains excluded.

### Latest source, approved comparison and settings deployment (5 November 2026)

The user authorized the private equality comparison and required a fresh Breadline
export first. The full source export completed before comparison: 15 tables, 155,030
rows, 14,309 users and 68,326 runs; SQLite integrity is `ok`. The consistent source
snapshot is dated `2026-11-04T18:19:10.139Z`. The database, manifest, reviewed plan and
receipts remain ignored under `.local/breadline/production-rollout-20261105/`. No source
records or credential-bearing comparison SQL enter version control.

The read-only comparison of 29 reviewed production accounts returned only mismatch
counts. One user differs in preferences and updated timestamp; one account row and one
session row each have a removed and added ID. Passkeys, organisation/project/hub roles
and Breadline ownership/crosswalks match. The before-state is stale, so no reviewed
merges or import writes were applied. The fresh-source plan retains the same 25 reviewed
conflict cohorts. Reconcile current account/session identity and user-field drift, then
implement/rehearse guarded remote adoption (including independent role-grant coalescing)
before generating a zero-exception import plan. The comparison no longer awaits
permission; a full HYPE production export was not performed and is not required for
consecutive sync runs.

The settings correction is deployed at 100% as Worker
`2604d0ad-2af5-4428-989b-18f0bc795337`, superseding `24b3a028`. Users settings now share
the main form's Save/Reset/Cancel and atomic policy revision guard; email matching uses
the current owning hub domain. Shared Switch rows, **Capability I18n**, and **Users →
Capabilities** replace the separate save and duplicate Features tab. This isolated
release contains 23 changed source files relative to the previous release and requires
no additional migration. Existing bindings/secrets/domains and current enrolment choices
were preserved.

Validation: 30 isolated release tests, production build and Wrangler dry run pass. The
full isolated check matches the prior release's 11 errors and 19 warnings. Local Firefox
Save/Reset/persistence was verified at 1450px and 1200px, with no page errors or
overflow, and original local settings restored. Production health and public routes
pass; unauthenticated admin routes redirect to sign-in. Post-deploy queries confirm 14
owners, nine members, no user-level roles or Breadline identities, and zero foreign-key
errors. Authenticated production UI and live provider acceptance remain unverified.
Production policy choices changed since the previous receipt; this deployment preserved
them rather than resetting them.

The thread changes are now four atomic local commits on `codex/breadline-users-189-194`,
isolated from the concurrent checkout and not pushed. The assembled series passes 83
runtime tests and 36 importer tests. Full Svelte checking has exactly the same 40 errors
and 20 warnings as its unmodified Git base under the same dependencies, with no new
diagnostics. This Git-base comparison is separate from the deployed release comparison
above. A committed-path audit covers 61 scoped paths and excludes all private data
artifacts.

### Guarded production identity reconciliation (5 November 2026)

Refs #189 and #194. This supersedes the earlier status that no reviewed adoption had
run. Fresh, scoped projections cover 30 existing accounts and their ownership
references; passwords, tokens and passkey public keys are omitted. The local rehearsal
uses the exact deployed schema. Independent organisation grants coalesce at their
strongest levels. The remote writer changes only reviewed columns, retaining current
opaque credentials and sessions in place. Schema, complete before/after scopes and
undeclared embedded references are guarded inside one atomic D1 batch.
Cloudflare-protected `_cf_` storage is excluded from application reference scans; its
schema remains guarded. Derived cache counters coalesce after reference triggers run and
before absorbed users are removed.

One initial application failed on the protected internal-table scan and rolled back
entirely. After correction and read-only production SQL validation, 24 reviewed cohorts
were applied in one 145-statement transaction. Four duplicate account roots were
absorbed; 24 Breadline owners and 34 historic source mappings now exist. Production has
1,701 users, including 16 with reviewed phone values. All 14 owner and nine member roles
remain, with zero foreign-key errors. The complete after-state replay succeeds with zero
writes. Private before-images, the recovery bookmark, source evidence, hashed plan and
production receipts are retained under `.local/breadline/reconcile-20261105/`.

The accepted local baseline is promoted from the verified atomic rehearsal. Planning
against the fresh source now leaves one conflicting cohort that combines two independent
accounts, including administrator/content ownership. Its saved merge decision awaits
explicit clarification; neither account has been changed. The remaining bulk plan
contains 13,468 new users and is not applied while that conflict remains. Organisation
user grants and full import/claim/directory acceptance remain pending. Do not interpret
the successful adoption replay as proof of full-import recovery or live provider flows.

Wrangler remote bindings run under Node; the Bun parent retains SQLite baseline handling
and the local operator lock. A pure shared contract keeps Bun SQLite out of the Node
bundle. Remote progress and completion receipts remain local, with baseline promotion
only after confirmed remote completion. Validation: 60 focused importer/adoption tests,
scoped TypeScript checks, exact-schema SQL rehearsal, Node operator bundles, production
preflight and post-application replay pass. No further schema or application deployment
was needed for this operational reconciliation.

### Distinct-person correction and completed user import (5 November 2026)

Refs #189 and #194. The user explicitly rejected the remaining cross-person merge. The
shared source phone was not evidence of a shared identity. The saved review is
superseded by two separate adoption cohorts, retaining each existing account and its own
source-user/volunteer mappings. The ambiguous phone remains unassigned to either
account, with the original value preserved privately. Existing credentials, roles,
profiles and content did not move between these accounts. Adoption now obtains its
effective phone from the normal planner so reviewed phone corrections cannot be
discarded during application; a regression test covers distinct people sharing a source
phone.

Before bulk application, a minimal live identity/provider-subject/role index reconciled
128 newer accounts, one removed anonymous account and a changed username in the retained
initial baseline. It included five additional staff assignments. No passwords or session
tokens were fetched, and no full production database export was needed. This initial
reconciliation does not introduce recurring production pulls into consecutive syncs.

The zero-exception production import is complete: **13,468 new users**, **13,494
HKFoodWorks users** including existing stronger roles, and **14,302 active historic
source identities** from 14,309 source rows with seven reviewed exclusions. Production
contains 15,169 total users and 10,767 populated phone values. There are 13,492
user-level organisation roles; all 14 owner and nine member assignments and their
independent grants remain. The bulk plan inserts new accounts and adds source grants; it
does not rewrite existing HYPE profiles or credentials.

Read-back compared all 67,397 runtime mutations plus the 39 previously adopted history
mappings: zero mismatches, zero foreign-key errors and zero duplicate provider subjects.
The operator resumed the same immutable plan from its durable local cursor after a
controlled interruption. Batches now contain 100 row changes/200 guarded statements,
verified on D1 and tested against an older smaller-batch cursor with an unacknowledged
batch. This proves interruption/resume; it does not claim a Time Travel restore was
performed. A fresh recovery bookmark and before-images are retained privately.

The accepted local baseline and source state were promoted only after remote completion.
Replanning the same source produces zero mutations, zero exceptions and no checkpoint
change; running that repeat plan through the production operator records zero runtime
mutations. `.local/breadline/users/production/accepted-sync.json` points to the current
private decisions, baseline, state, seed and receipts. The superseded review and source
snapshot remain retained as evidence. Source payloads and progress stay outside Git and
outside production bookkeeping tables.

Validation: 62 focused tests and scoped TypeScript checks pass. No additional schema
migration or application deployment was required. Authenticated production directory,
live provider claims and enrolment acceptance remain open: the browser access host was
unavailable. Data import completion does not close those broader release checks, and
WhatsApp/Telegram discovery remains disabled.

### Reviewed single-email profile resolution (5 November 2026)

Refs #189 and #194. Seven groups were already consolidated into seven stable HYPE IDs,
but two distinct source name strings kept each profile unclaimed despite one shared
email. Private `profileResolutions` now record an exact source-ID cohort, its sole
normalized email and an explicitly reviewed canonical name. The planner rejects changed
cohorts/emails. This does not broaden automatic matching for multi-email groups.

The guarded sync resolves existing unclaimed profiles in place, restores their primary
email and reviewed name, preserves existing photos or uses the selected source photo,
and attaches only eligible portable Google identities. It does not manufacture a
first-login timestamp. Independent profile edits remain protected on subsequent syncs.
Raw source names and historic identity mappings remain intact.

Both production and the primary local database applied **seven profile updates, seven
import-ownership updates and six portable Google account inserts**. Exact read-back has
zero mismatches; the fourteen source mappings and existing role grants are unchanged.
There were no user inserts/deletions, history transfers, phone changes or additional
schema migrations. Total users remain 15,169 production / 15,012 local; phone-bearing
users remain 10,767 / 10,700. Unclaimed counts drop from 719 to 712 production and from
712 to 705 local. The remaining production groups have multiple candidate emails and are
not resolved by these seven explicit decisions.

Six source photo URLs were restored: five return HTTP 200 images, one returns HTTP 400.
The seventh profile has no photo in either source record. URL checks are not rendered
browser verification; those two missing/broken photos remain unresolved.

Validation: 64 focused importer/adoption tests and scoped TypeScript pass. Exact-schema
rehearsal and both post-application repeat plans produce zero mutations, exceptions and
checkpoint changes; FK errors and duplicate provider subjects are zero. Private plans,
source evidence, decisions and receipts remain ignored under `.local`. The production
accepted-sync manifest and local decisions now retain these resolutions for future runs.
Authenticated production UI, live provider and enrolment checks remain open.

### Incremental production user sync (6 November 2026)

Refs #189 and #194. The same complete Breadline snapshot used by the local refresh
(`2026-11-06T05:04:30.690Z`) is now reconciled into `hype-db-prod`, using its own
retained production seed, reviewed decisions and accepted baseline. The zero-exception
plan adds five users and updates six existing profile names and their historic source
name projections. Five portable Google accounts, five import-ownership rows, five
source-user/volunteer mappings and five source membership grants accompany the new
users: **37 runtime row changes** in total. Private accepted source state advances for
51 existing snapshots and five new source users. There are no removals, restorations,
account merges or ownership transfers; the seven reviewed exclusions remain.

One new user's generated Runner username was occupied by an existing production account.
The sync planner now retries the shared deterministic generator against existing and
reserved usernames, preserving the new user's stable ID and every existing owner's
username. A regression test covers successive occupied candidates, stable identity,
existing-row preservation and zero-write replay. No application deployment or schema
migration was needed; the fix runs in the local importer.

The isolated exact-schema rehearsal compared 79 tables, preserving 126,892 unaffected
rows; the five new organisation grants produced exactly five expected feature-count
cache invalidations. Integrity and foreign keys pass. Production preflight matched all
37 before-images with no new identity collisions. A fresh D1 recovery bookmark precedes
application. Production read-back at `2026-11-06T07:09:49.014Z` matches all 37
after-images, with zero foreign-key violations and duplicate provider subjects. There
are **14,307 active source identities**, **13,499 distinct imported owners** and 15,187
total production users. All current 16 owner and nine member assignments remain.

Validation: 48 focused importer tests pass. Both rehearsal and post-application repeat
plans have zero mutations, exceptions or checkpoint changes; the production operator
also recorded a zero-mutation repeat receipt. The accepted production manifest now
points to the new baseline, source state, decisions and verification receipts under
`.local/breadline/production-sync-20261106/`. Raw source, plans, before-images and
recovery details remain private. This completes the incremental database sync; broader
authenticated UI, live-provider and enrolment acceptance stays open. Repository changes
are committed separately from the database application; no push or application
deployment is included.
