# Hub Subscriptions And Policies Design Notes

## Purpose
Define the first phase of hub-managed newsletter subscriptions and hub-managed policy content.

This phase covers:
- hub-level subscription configuration
- hub-level localized privacy policy and terms of service content
- admin UI for configuring both

This phase does not complete:
- end-user subscription enrollment
- end-user subscription status persistence
- app-surface subscription prompts

Those are specified here so the schema and admin work can be implemented without repainting the architecture later.

## Current Constraint: Substack Integration
- HYPE currently uses the installed `substack-subscriber` package for programmatic subscription attempts.
- This package is unofficial and uses a Playwright-driven browser flow rather than a documented public Substack subscriber API.
- Result:
  - HYPE can attempt direct in-platform enrollment.
  - The integration should still be treated as best-effort provider automation with clear failure handling.
  - Hub configuration should remain provider-driven so the implementation can be replaced later if Substack publishes a stable API.

## Goals
- Let a hub opt into newsletter promotion.
- Let a hub declare where that promotion appears.
- Let a hub define localized privacy policy and terms content.
- Keep the first provider model narrow: Substack only.
- Avoid mixing end-user state into admin-role tables.

## Non-Goals
- Multi-provider abstraction beyond what is needed for one provider.
- Billing, paid memberships, or provider-side audience segmentation.
- A generic legal-document CMS beyond hub privacy policy and terms.

## Data Model

### Hub
Add hub-level subscription fields:
- `isSubscriptionAvailable: boolean`
- `subscriptionService: 'substack' | null`
- `subscriptionId: string | null`
- `subscriptionPlacement: json`
  - `hubPanel: boolean`
  - `topBar: boolean`
  - `menu: boolean`

Recommended defaults:
- `isSubscriptionAvailable = false`
- `subscriptionService = 'substack'`
- `subscriptionId = null`
- `subscriptionPlacement = { hubPanel: false, topBar: false, menu: true }`

Rationale:
- `subscriptionService` remains nullable so the disabled state is structurally valid.
- `subscriptionPlacement` belongs in JSON because it is a small capability map that will likely grow by key, not by relation.

### HubI18n
Add localized legal content fields:
- `privacyPolicy: text | null`
- `termsOfService: text | null`

Rationale:
- These are localized editorial fields owned by the hub.
- They should live with the rest of hub-authored localized content.

### End-User Hub Subscription State
Do not store this in `hubRole`.

Reason:
- `hubRole` currently models admin assignments only.
- Newsletter state applies to ordinary users who will not otherwise have a `hubRole` row.
- Reusing `hubRole` would either create fake admin-assignment rows or overload one table with two unrelated meanings.

Recommended future table:
- `hubUserState`
  - `hubId`
  - `userId`
  - `subscriptionPromptDismissed: boolean`
  - `subscriptionMember: boolean`
  - `hasAgreedToTerms: boolean`
  - optional future provider metadata as JSON if needed

## Admin UX

### Core Facet: Subscription Section
Add a new section above Routing in the hub admin form.

Behavior:
- Section header includes the master switch for `isSubscriptionAvailable`.
- When disabled:
  - the section body remains visible but dimmed
  - interactive controls are disabled
- When enabled:
  - fields behave like the rest of the form

Fields:
- `subscriptionService`
  - select
  - preselected to `substack`
- `subscriptionId`
  - text input
  - example: `hkghostsigns`
- `subscriptionPlacement.hubPanel`
  - boolean toggle
- `subscriptionPlacement.topBar`
  - boolean toggle
- `subscriptionPlacement.menu`
  - boolean toggle

Expected initial configuration for `hkghostsigns`:
- enabled
- service: `substack`
- id: `hkghostsigns`
- placement:
  - `hubPanel = false`
  - `topBar = true`
  - `menu = true`

### Policies Facet
Add a new `policies` facet to the hub admin editor.

Contents:
- a localized `privacyPolicy` textarea
- a localized `termsOfService` textarea

This should reuse `FormI18nSection`.

## Default Legal Copy
Provide generated default copy for both fields.

Rules:
- Use the hub’s localized name when available.
- Replace `HYPE.HK` with the hub name in generated output.
- Keep the terms short and plain.
- Keep the privacy policy practical and specific to contribution workflows.

### Privacy Policy Default Requirements
Must cover:
- collection of user submissions including text, location data, and photos
- use of submission data for moderation, quality control, and listing accuracy
- no sharing with third parties except cloud storage/networking infrastructure operated by Cloudflare
- practical Hong Kong framing

### Terms Of Service Default Requirements
Must cover:
- service provided as-is
- no guarantee of uninterrupted service
- no guarantee that all content is complete or correct
- limitation of liability
- relationship between HYPE and the hub:
  - HYPE provides the platform technology
  - hub owners curate the content and policies for that hub

## App UX (Future Phase)

### Hub Panel CTA
Show at bottom of the hub panel when:
- `hub.isSubscriptionAvailable`
- `hub.subscriptionPlacement.hubPanel`

Content:
- title: `Get our updates!`
- provider button with Substack icon
- small legal line linking to terms and privacy dialogs

### Top Bar CTA
Show when:
- `hub.isSubscriptionAvailable`
- `hub.subscriptionPlacement.topBar`
- `!hubUserState.subscriptionPromptDismissed`

Actions:
- `Subscribe`
- `Maybe later`

`Maybe later` behavior:
- set `hubUserState.subscriptionPromptDismissed = true`

### Menu CTA
Show as the final menu item when:
- `hub.isSubscriptionAvailable`
- `hub.subscriptionPlacement.menu`
- `!hubUserState.subscriptionMember`

## API Shape (Future Phase)

### Hub Admin Form
Expand the existing hub form payload to include:
- hub subscription config
- localized privacy policy
- localized terms of service

### User Commands
Planned remote functions:
- `dismissSubscriptionPrompt`
- `joinSubscription`

For now:
- `joinSubscription` should call the Substack adapter and persist membership state only on success.
- Provider failures should surface as integration failures, not be silently ignored.

## Rollout Plan
1. Add spec.
2. Add hub schema and admin form support for subscription config and policy content.
3. Add migration.
4. Add default policy generators.
5. Add app-side CTA components and policy dialogs.
6. Add dedicated `hubUserState` persistence and user commands.
7. Revisit the provider adapter if a documented Substack API becomes available.
