# Continue Without an Account

## Status

Proposed implementation specification.

## Summary

HYPE should open directly into the application without requiring a login or showing a
landing page. On the first application visit, the system automatically creates a
Better Auth anonymous user and session. Returning visitors continue with the anonymous
user identified by their Better Auth session cookie.

The product must describe this state as **continuing without an account**, not as
anonymous use. HYPE stores the user's preferences and activity in D1, but the user has
not yet associated that data with a durable login method.

Users can browse the application, configure it, and save places without an account.
When they attempt an operation that requires durable identity, attribution, moderation,
or privileged authorization, HYPE prompts them to **Upgrade account**. Upgrading
links an email/password or social login to the existing server data.

## Product Decisions

- Normal application visits create an anonymous Better Auth session automatically.
- There is no login landing page or pre-application account-choice screen.
- User-facing copy says **Guest account** and **Upgrade account**.
- The term `anonymous` is reserved for internal Better Auth, database, and authorization
  implementation details.
- Preferences, default layers, wishlist entries, and visited-place state are stored in
  D1 against the anonymous user ID.
- localStorage is not the primary persistence mechanism for this feature.
- The secure Better Auth cookie is the only credential that reconnects a browser to its
  anonymous user. Authentication tokens must never be placed in localStorage.
- Clearing cookies or remaining inactive beyond the retention window may make anonymous
  data unreachable. This is acceptable and must be communicated in reminders.
- Contributions, uploads, subscriptions, the user's own profile, cross-device access,
  and administration require an upgraded account.
- Published application content remains readable by users without an account.

## Terminology

| Internal term     | User-facing term        | Meaning                                                           |
| ----------------- | ----------------------- | ----------------------------------------------------------------- |
| Anonymous user    | Guest account user      | Better Auth user with `isAnonymous === true`                      |
| Registered user   | Account user            | Better Auth user with at least one durable login method           |
| Link account      | Upgrade account         | Associate anonymous data with email/password or a social provider |
| Anonymous session | Current browser session | Secure cookie granting access to the temporary server-side user   |

The UI must not claim that use is untracked or anonymous. Privacy and settings copy must
state that HYPE stores activity under a temporary identifier until it is upgraded or
deleted by retention cleanup.

## Capability Matrix

| Capability                              | Without an account            | With an account                  |
| --------------------------------------- | ----------------------------- | -------------------------------- |
| Browse maps and published resources     | Allowed                       | Allowed                          |
| Open shared feature links               | Allowed                       | Allowed                          |
| Search and filter                       | Allowed                       | Allowed                          |
| Change language and display preferences | Persist in D1                 | Persist in D1                    |
| Select default layers                   | Persist in `userLayer`        | Persist in `userLayer`           |
| Wishlist places                         | Persist in `userFeature`      | Persist in `userFeature`         |
| Mark places as visited                  | Persist in `userFeature`      | Persist in `userFeature`         |
| See settings and wishlist               | Allowed with upgrade reminder | Allowed                          |
| Access own profile or edit identity     | Upgrade prompt                | Allowed                          |
| Add a place or submit a report          | Upgrade prompt                | Allowed subject to authorization |
| Upload photos                           | Upgrade prompt                | Allowed subject to authorization |
| Subscribe to a hub newsletter           | Upgrade prompt                | Allowed with account email       |
| Synchronize across browsers/devices     | Upgrade prompt                | Allowed by signing in            |
| Access `/admin/**`                      | Login/upgrade prompt          | Allowed subject to roles         |

Public contributor profiles may remain readable where existing privacy and authorization
rules permit them. The account requirement applies to the current user's own profile and
profile-management surface.

## Session Bootstrap

### Existing session

1. Better Auth reads the session cookie.
2. If the session belongs to an anonymous user, the application opens normally with
   guest authorization.
3. If the session belongs to an upgraded user, the application opens with that user's
   roles and account capabilities.

### No session

On a normal application route, the root client shell must:

1. Wait for `useSession()` to finish its initial lookup.
2. If no session exists, call `signIn.anonymous()` automatically.
3. Wait for the anonymous session to become visible to `useSession()`.
4. Initialize `AppCtx` with the resulting user ID.
5. Load the requested route without asking the user to make an authentication choice.

The bootstrap may show the existing neutral loading shell, but it must not show a login
landing page. It must avoid calling authenticated remote queries before the anonymous
session exists.

The original URL and query parameters must be retained, including direct feature links.
The bootstrap must have a bounded retry policy and show a recoverable error if anonymous
session creation fails.

### Routes that do not create anonymous users

Infrastructure endpoints, asset requests, health checks, current landing page, headless rendering routes, and
auth callbacks must not create anonymous users.

An unauthenticated direct visit to an admin route should show or redirect to an account
login prompt with a validated return URL. It does not need to create an anonymous user
first. A direct contribution/profile route may use the normal anonymous app session, but
must show the upgrade prompt before loading or mutating account-only data.

### Logout

Logging out of an upgraded account removes its session and returns the user directly to
a modified version of the current landing page. The application offers logins with 3 socials and email and password or continuing as a guest, which is a new anonymous user/session as part of normal bootstrap.

## Better Auth Configuration

The server already includes the Better Auth `anonymous` plugin and `user.isAnonymous`.
The implementation must complete and correct that integration:

- Add `anonymousClient()` to `src/lib/auth/client.ts`.
- Use `signIn.anonymous()` during application bootstrap.
- Keep the anonymous user on the normal session lifecycle.
- Do not expose anonymous-user deletion as a routine client action.
- Remove `disableDeleteAnonymousUser: true` unless a replacement cleanup flow explicitly
  requires it. Better Auth should normally delete the source anonymous user after a
  successful link.
- Replace the current `onLinkAccount` behavior. Merely changing `isAnonymous` on the
  source user does not associate its related data with `newUser`.
- Skip role-loading database work for anonymous users where possible; their role set is
  always empty.

The application must never treat the existence of a session as proof of an account.
Account checks use `user.isAnonymous !== true` in addition to requiring a valid session.

## Authorization and Remote Functions

The shared authenticated remote wrapper may continue requiring a Better Auth session,
because normal app visitors will receive one automatically. Authorization must still
distinguish anonymous sessions from upgraded sessions.

### Read policy

Anonymous users may list and read only records that are:

```text
isPublished = true
isArchived = false
```

The existing feature and layer authorization already largely models this behavior.
Organisation, project, property, and other hierarchy reads must be updated so published
feature hydration is possible for anonymous sessions. Query construction must enforce
published/non-archived state server-side regardless of client-supplied conditions.

Anonymous users must not gain access to unpublished or archived resources through admin
metadata, prisms, direct IDs, relation hydration, alternate response profiles, or cached
queries.

### Write policy

Commands and forms for the following operations must reject anonymous users with a
machine-readable account-required error:

- Contributions and task creation/finalization
- Feature creation or editing
- Image upload authorization, persistence, replacement, and deletion
- Hub subscription and terms state that requires an email identity
- Profile, username, attribution, and account identity changes
- Organisation, project, layer, property, hub, role, and capability administration
- Analytics and all other admin-only operations

Server handlers remain authoritative. Hiding controls in the UI is not sufficient.

Use one error code consistently, for example `ACCOUNT_REQUIRED`, distinct from:

- `UNAUTHENTICATED`: no usable Better Auth session
- `FORBIDDEN`/`INSUFFICIENT_ROLE`: upgraded account lacks permission
- `ACCOUNT_REQUIRED`: session is valid but belongs to an anonymous user

## Server-Side State

Anonymous user state uses the existing account-related tables:

- `user.preferences`: language fallback and display behavior
- `user.experimental`: non-privileged experimental display settings
- `user.locale`: preferred locale
- `userLayer`: default layer selection per hub
- `userFeature`: wishlist and visited state
- `session`: secure browser continuity

Contributor mode must not make contributions available to anonymous users. It may be
hidden, disabled with an upgrade explanation, or enabled only after upgrade.

Anonymous users should not be given editable usernames, attribution identities, public
profiles, roles, or provider accounts.

## Upgrade to an Account

### Entry points

Show the centralized upgrade dialog when an anonymous user:

- Starts a contribution or upload
- Opens their own profile
- Attempts to subscribe to a hub
- Opens an admin route
- Selects an explicit synchronization/account action

Settings and wishlist surfaces should also contain non-blocking reminders, even though
their core functionality remains available.

### Authentication methods

The upgrade dialog should offer:

- Email address and password
- Google
- Apple, present but disabled until credentials and developer access are available
- WeChat, present but disabled until credentials and developer access are available

User intent and a validated same-origin return URL should survive the upgrade flow so the
application can resume the requested action where safe. File objects and sensitive form
contents must not be persisted for resumption.

### Link and migration flow

Better Auth calls `onLinkAccount({ anonymousUser, newUser })` when an anonymous session
signs up or signs in with a durable authentication method. The callback must migrate the
source data to `newUser.id` before the source anonymous user is deleted.

Merge rules:

- `userFeature`: union by feature ID.
- Wishlist: `true` wins if either record is wishlisted.
- Visited: `true` wins if either record is visited; retain the most recent valid
  `visitedAt`.
- `userLayer`: merge by hub and layer. Anonymous choices should become the upgraded
  account's defaults for the current hub; preserve unrelated hub defaults.
- Preferences and locale: the active anonymous session's current settings win because
  they represent the device state visible immediately before upgrade.
- Account identity fields, roles, email verification, provider accounts, and security
  state always come from `newUser` and are never overwritten from the anonymous user.
- Subscription state is not normally present for anonymous users. If prompt-dismissal
  state is later stored for them, it may be migrated separately.

Migration must be idempotent and execute atomically where supported. Unique conflicts on
`userFeature` and `userLayer` must be resolved by merge/upsert rather than failing the
link. A retry must produce the same final state.

Only delete the anonymous source after migration succeeds. If migration fails, abort the
link where Better Auth permits it or retain enough source data for a safe retry. Emit
structured logs without recording passwords, tokens, or unnecessary personal data.

After success:

1. Refresh the Better Auth session.
2. Reinitialize `AppCtx` using the upgraded user.
3. Invalidate user-feature, user-layer, preference, and role-aware resource caches.
4. Show a concise confirmation that saved places and settings are now associated with
   the account.

### Existing accounts

Signing in to an existing account while using an anonymous session must also run the
merge. This is not limited to creating a new account. Existing account security and roles
remain authoritative while anonymous saved state is merged using the rules above.

## Email and Password

Enable Better Auth email/password authentication with email verification and password
reset support. The account table and verification table already contain the required
schema fields.

Required flows:

- Sign up and upgrade with email/password
- Sign in to an existing account and merge the current anonymous state
- Verify email and resend verification
- Request and complete password reset
- Add a password to an existing social-login account without creating a duplicate user
- Generic error responses that avoid email enumeration

Password reset should revoke other sessions. Email delivery must use a Cloudflare email / Worker-compatible
sender and background execution where possible.

## Apple and WeChat

Apple and WeChat should be represented in a typed provider registry but remain disabled.
The UI displays them as coming soon, but must not initiate OAuth.

Server providers must be registered only when both an explicit enable flag and all
required credentials are present. Missing credentials must never produce a partially
enabled provider.

## Reminders and Copy

Anonymous users should see concise, non-blocking reminders in settings and saved-place
surfaces:

> You're continuing without an account. Your settings and saved places are associated
> with this browser's current session and may be lost if cookies are cleared or after an
> extended period of inactivity.

Primary action:

> Upgrade to an account

Contextual prompts should explain the benefit or requirement:

- “Upgrade to contribute places and photos.”
- “Upgrade to keep your saved places when you change devices.”
- “An account is required to view and manage your profile.”
- “Sign in with an authorized account to open the admin panel.”

Avoid “anonymous”, “untracked”, “private browsing”, or language suggesting that no data
is stored.

## Retention and Cleanup

Automatic user creation will produce abandoned database rows. Add scheduled cleanup for
anonymous users that no longer have a usable session.

Initial policy:

- Keep normal Better Auth session expiry and refresh behavior.
- Delete anonymous users only when they have no unexpired session and have exceeded a
  documented inactivity grace period.
- Use cascading foreign keys to remove related `userFeature`, `userLayer`, sessions, and
  other anonymous-owned rows.
- Never delete upgraded users through this cleanup path.
- Record aggregate cleanup counts and failures without retaining deleted identifiers in
  routine logs.

The exact grace period should be longer than the maximum anonymous session lifetime. If
session activity alone cannot reliably express last use, add an explicit anonymous
`lastSeenAt`/expiry field rather than inferring activity from unrelated preference rows.

## Abuse and Capacity Controls

Because application visits create D1 users, implementation must account for automated
traffic and abandoned sessions:

- Create anonymous users only from interactive app bootstrap, never from asset/API bots.
- Apply rate limits to anonymous sign-in creation.
- Monitor creation rate, upgrade rate, active anonymous sessions, and cleanup volume.
- Ensure repeated bootstrap requests converge on the session created first and do not
  create multiple users because of concurrent effects.
- Use a client-side in-flight guard around `signIn.anonymous()`.
- Keep anonymous custom sessions inexpensive by skipping unnecessary role queries.

Turnstile should not be required for ordinary browsing because it would reintroduce the
friction this feature is intended to remove. It may be considered later only for detected
abuse or account/contribution workflows.

## UI and Application Changes

Primary integration points:

- `src/lib/auth/client.ts`: add the anonymous client plugin.
- `src/lib/auth.ts`: correct link migration and anonymous cleanup behavior.
- `src/hooks.server.ts`: remove the broad signed-out redirect; retain explicit protection
  for admin and other account-only server routes.
- `src/routes/+layout.svelte`: own the one-time anonymous bootstrap and auth transition.
- `src/routes/(app)/+layout.svelte`: render the application for anonymous and upgraded
  sessions; remove the session-based landing-page branch.
- `src/routes/(app)/+page.svelte`: remove the Google-only landing experience.
- `src/lib/context/app.svelte.ts`: initialize resources for anonymous user IDs and keep
  user state/caches isolated across anonymous-to-account transitions.
- `src/lib/api/services/authz/*`: allow published reads and reject anonymous writes with
  `ACCOUNT_REQUIRED` where appropriate.
- Settings, wishlist, profile, contribution, upload, subscription, and admin entry
  components: use the centralized reminder/upgrade flow.

## Privacy and Documentation

Update the privacy policy before release to disclose:

- Automatic creation of a pseudonymous server-side identifier
- Session-cookie use
- Preferences, wishlist, visited state, and activity stored against that identifier
- Loss of access after cookie deletion or expiry
- Retention and cleanup behavior
- What happens when the user upgrades and associates the data with an email/social login
- Email/password, Google, and future provider roles

Update authorization and deployment documentation to reflect the new actor lifecycle,
email service configuration, provider flags, and cleanup schedule.

## Test Plan

### Bootstrap and sessions

- First app visit creates exactly one anonymous user and session.
- Concurrent root effects do not create duplicate anonymous users.
- Returning browser reuses its anonymous user.
- Direct feature URL initializes anonymously and remains on the original URL.
- Logout from an account returns to the app and creates a new anonymous session.
- Infrastructure and asset requests do not create users.

### Authorization

- Anonymous users can read published, non-archived hierarchy and features.
- Anonymous users cannot read unpublished or archived records by list filters, direct ID,
  relation hydration, response profile, or cache reuse.
- Anonymous write commands return `ACCOUNT_REQUIRED`.
- Upgraded users still require the appropriate role for privileged writes.
- Admin routes require an upgraded account and relevant role.

### Persistence

- Preferences, locale, default layers, wishlist, and visited state survive reloads through
  the anonymous session.
- Clearing the cookie prevents the new session from accessing the old anonymous user.
- User-scoped query keys do not leak state between old anonymous, new anonymous, and
  upgraded sessions.

### Upgrade

- New email/password signup migrates anonymous state.
- Google signup/sign-in migrates anonymous state.
- Existing-account sign-in merges anonymous state without overwriting identity or roles.
- Wishlist, visited dates, layers, locale, and preferences follow the defined merge rules.
- Link migration is idempotent and safe under retry.
- Source anonymous user is deleted only after successful migration.
- Failed migration does not silently discard anonymous data.

### Lifecycle and abuse

- Cleanup deletes only eligible anonymous users.
- Active anonymous sessions and upgraded users are never deleted.
- Rate limits and bootstrap retry behavior fail safely.
- Disabled Apple and WeChat providers cannot initiate OAuth.

## Rollout

1. Correct and test anonymous account linking before automatically creating users.
2. Add anonymous client bootstrap behind a deployment flag.
3. Open published hierarchy reads and remove the app-shell landing gate.
4. Enable server persistence for preferences, layers, wishlist, and visits.
5. Add centralized upgrade prompts and enforce `ACCOUNT_REQUIRED` on all writes.
6. Enable email/password, verification, reset, and existing-account merging.
7. Add cleanup scheduling, rate limiting, metrics, privacy updates, and operational alerts.
8. Enable automatic anonymous bootstrap in preview, monitor D1/session behavior, then
   release to production.

## Acceptance Criteria

- A new visitor reaches the functional app without seeing a login prompt.
- The visitor automatically receives one anonymous Better Auth session.
- Settings, layer defaults, wishlist, and visited state persist in D1 across reloads.
- The UI consistently says “without an account” and never promises untracked use.
- Contributions, uploads, subscriptions, own-profile access, and administration require
  an upgraded account at both UI and server boundaries.
- Upgrading with email/password or Google preserves the anonymous user's saved state.
- Clearing or expiring the anonymous cookie may lose access, and the UI communicates this.
- Abandoned anonymous users are removed by a safe, observable retention process.
- Apple and WeChat are scaffolded but cannot be used until explicitly enabled.
