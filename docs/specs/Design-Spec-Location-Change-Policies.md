# Location curations, policies and display names

Tracked under [#178](https://github.com/tijptjik/hype/issues/178). See
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

## Approved model

[SaanSeoi](https://saanseoi.hk) supplies upstream evidence. Use its icon at
`static/logos/saanseoi.svg`. Community curations correct or enrich evidence without
rewriting it. Organisation customizations apply above accepted evidence. Resolved
`.title` and `.displayAddress` are materialized outputs, never customization stores.
Omission inherits; explicit clear suppresses.

| Location visibility and origin | Available layers                                 |
| ------------------------------ | ------------------------------------------------ |
| Community, upstream-linked     | Upstream → community → Organisation              |
| Community, locally created     | Community → Organisation                         |
| Internal                       | Organisation only, over a sparse identity anchor |

Edit destination is independent of visibility. **Community** contributes to community
curations; **Internal** saves Organisation customizations. Feature Location tab edits
should contribute by default for community Locations. Publishing an internal Location
must atomically transfer its values to community curations and remove the publishing
Organisation's corresponding customizations. Never invent upstream evidence for local
Locations or destroy immutable historical records during migration.

Permissioned Project editors can contribute through Feature-scoped commands. Standalone
community edits require Organisation management authority or SuperAdmin. Translation
rights alone do not qualify. Internal Locations cannot receive community writes.

## Identity fields

| Field    | Meaning and storage                                                       |
| -------- | ------------------------------------------------------------------------- |
| name     | Localized provided name; immutable upstream evidence remains intact       |
| groupId  | Community-curation link to corporate affiliation, independent of branding |
| brandId  | Community-curation link to public brand family, such as AROME             |
| format   | Localized full marketed name, such as AROME Bakery                        |
| branch   | Localized outlet designation, such as Central                             |
| branchId | Group-issued outlet identifier, stored as text including leading zeros    |
| category | Existing taxonomy; no competing classification vocabulary                 |

Brand and group share an extensible catalogue with a kind discriminator, logo and names
in en, zh-Hant and zh-Hans. Autocomplete supports selection and creation; detail pages
edit the logo and all three names. Imported brands create catalogue entries. Preserve
raw upstream brand objects, identifiers and localized names; fill missing catalogue
locales with an available name. Curated brand values take precedence when brandId is
set. Links belong on community curations, not Location anchors or upstream revisions.
Catalogue changes must enter the identity adoption flow rather than bypass review
through an unpinned live lookup. Never infer format or branch by parsing establishment
names.

Migration `0231_global_branch_property.sql` introduces the translatable global free-text
Feature property `branch`. This is distinct from Location branch; inheritance needs an
explicit binding so a property override and a resolved value remain distinguishable.

## Policies

Project settings override Organisation defaults. No new Layer data policies. SaanSeoi
and community rules are separate, with a toggle to use the same rules for both while
retaining the separate configuration. Acceptance affects the entire Organisation,
including consumers in other Projects. It releases the affected Organisation
customization; keep-current stores the retained value explicitly. Unrelated fields and
other Organisations remain untouched. Review decisions must be revision-fenced.

| Group          | Fields                                                          | Default community action |
| -------------- | --------------------------------------------------------------- | ------------------------ |
| Identity       | Name, group, brand, format, branch, identifiers, classification | Review                   |
| Address        | Street, building, floor, unit and structured components         | Review                   |
| Map position   | Marker coordinates                                              | Review                   |
| Relocation     | Business or venue move                                          | Review                   |
| Communications | Phone numbers, websites, socials                                | Accept                   |
| Templates      | Community template assignment                                   | Review                   |

Support skip, review and accept. Marker rules can accept changes within a distance.
Optional source-specific exceptions accept missing values or newly resolved addresses.
They do not replace nonempty values, defeat explicit suppression, authorize relocation,
or bypass incomplete dependencies or independent marker review. Previously unseen means
a newly supplied missing value, not automatic acceptance of a new business identity.

The Admin Docs diagram is defined in `src/lib/docs/locationChangePolicies.ts` and
rendered by `LocationChangePolicyDocs.svelte`. It describes this approved target flow.

## Central display templates

Templates have a name, stable code, immutable versions and locale-specific expressions.
Assignments reference templates rather than copying strings. Precedence is system →
accepted community Location → Organisation → Project → Layer → explicit record. Manual
names win. Location templates cannot depend on consumer Feature properties; Feature
templates can reference their properties and accepted Location fields.

The bounded DSL supports property tags, fallback (`??`), pairs, optional fragments and
true/false/missing cases. Example:

```text
{{ pair(format.name ?? brand.name, branch, " - ") ?? source.name }}
```

Pair requires both components; otherwise the expression falls back to the provided name.
A small helper editor inserts tags, pairs and cases and previews each locale. No
arbitrary code execution. Dependency changes regenerate affected outputs, and central
publishing can explicitly regenerate all references. History and concurrency fences
protect both assignment and regeneration; changes held for review must not leak through
regeneration.

## Current implementation boundary

Source-specific policy controls, permissioned community edits, localized branch/format
editing and branchId text storage exist in the draft. Identity and Address cards now
combine the approved fields. Existing persisted unit/address keys remain compatible;
changing Address writes both, and mixed legacy rules display the conservative result.

The accepted Feature history path now applies Accept and Keep-current across all
non-draft consumers of the Location in the Organisation. Decisions require Organisation
management authority. Community auto-acceptance uses the union of accepting Project
fields within an Organisation; another Project's review rule does not create a separate
value after its Organisation has accepted. Acceptance releases only customizations for
changed underlying fields. Keep-current authors explicit customizations, including
clears for newly supplied fields or locales that were previously absent. Source,
community, Organisation, policy and association-set fences protect the atomic
transaction. Legacy storage without accepted Feature history retains its compatibility
application path.

Remaining integration: sparse identity/local layer migration and internal publication;
catalogue/import/editor; skip policies and template policy; central DSL
registry/editor/dependency regeneration; global Branch property inheritance; default
community contribution routing for ordinary Feature Location name/address saves (the
dedicated community commands already exist). Current reviews still use Feature facts and
position groups. The diagram is a design contract, not evidence that these pending paths
work.

## Community curation field locks

Migration `0232_community_curation_locks.sql` adds immutable, actor-attributed lock
revisions. Each field has a boolean openness control; absence means open. Only an
authenticated SuperAdmin can set or unset these controls, using the lock icon in a
community Location's record toolbar. Editors cannot provide their own role claims.

Locks apply to new community edits, including SuperAdmin edits until explicitly
unlocked. They do not modify resolved values, Organisation customizations, source
publications or acceptance of previously published evidence. A mixed patch touching any
locked field is rejected atomically. Map geometry and the address envelope have
independent controls; localized identity maps lock all their languages. The typed entity
envelope cannot bypass locks on the establishment details it contains. Every community
save fences the lock revision, so locking a field during another user's save aborts that
save. System source-reconciliation revisions remain separate from community edits.

Admin Docs present the Feature display-resolution diagram first: accepted upstream
values, accepted community overlay, Organisation customization, resolved inherited
fields, then localized display generation and manual name precedence. A separate second
diagram explains editing, locking, policy acceptance and review. Approved but unfinished
template and sparse-layer behavior remains explicitly labeled as target behavior.

### Lock controls

Switches are on when locked. Identity, Address, Map position, Relocation and
Communications group their fields; a category switch changes every field in that area.
Address includes accessibility; Map position includes footprint. The lock in the compact
dialog header changes all 17 community-editable fields. Identity and Address form the
left desktop column; the remaining policy areas form the right. Section icons and inline
counts distinguish category switches from the smaller field switches. Mobile uses one
column. Partially locked categories and the toolbar show the locked-field count. Branch
ID is internal-only: it is excluded from these switches and counts, and community
commands reject direct or nested branch ID edits, including those submitted by
SuperAdmin. Existing evidence is retained; author branch IDs through the Internal
destination.
