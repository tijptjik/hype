# Roles

## Overview

Roles are used to define the permissions that a user has to a specific resource. A role
can be assigned to a user, and a user can have multiple roles.

## Staff save semantics

An authorised staff edit takes effect on Save and records its history in the same
transaction. This includes translation-only edits within the Translator's allowed
fields, image metadata/rotation and shared Location corrections by Organisation
managers. Saving content preserves publication visibility; publish/unpublish remain
separate permissions and actions. Staff edits do not create review proposals.

Authority remains resource-specific: Feature editing does not grant Organisation
correction rights. Contributor task submissions and proposed shared corrections from
actors without shared-resource edit authority retain their review workflows.

## Hub

- Admin
- User (default, implicit)

Table : `hubRole` Examples :

- `hype.hk` - **Admin** : @tijptjik
- `breadline.hk` - **Admin** : @clau, @tijptjik
- `hkghostsigns.com` - **Admin** : @bpotts, @tijptjik

### Capabilities

#### Admin

- `createHub` (only admins in `core`)
- `readHub`
- `updateHub`
- `deleteHub` (only admins in `core`)
- `manageRoles` - add/remove admins
- `createOrganisation` (only admins in `core`)
- `deleteOrganisation` (only admins in `core`)

## Organisation

- Owner
- Member (staff)
- User (lowest role)

**Table** : `organisationRole` **Examples** :

- `saanseoi` - **Owner**: @tijptjik
- `hkfoodworks` - **Owner**: @clau, @dazzy
- `hkghostsigns` - **Owner**: @bpotts, @ben
- `hkghostsigns` - **Member**: @clementin, @tijptjik

### Capabilities

#### Member

- `readOrganisation`

#### Owner

- `+` Member capabilities
- `updateOrganisation` (incl. publish)
- `createProject`
- `deleteProject`
- `manageRoles` - add/update/remove membership

### Effects

- `members` become available for projectRole assignments

### Organisational User

An **Organisational User** is the lowest organisation role: `user < member < owner`. All
three levels qualify for organisation-user inclusion. **Staff** explicitly means
`member` or `owner`; user-level membership grants no staff access, project capability,
or contact-directory access. User-only rows appear in the organisation **Users** tab,
not the organisation/feature staff-role overview.

The existing `organisationRole` retains one row per organisation/person. Its `grant`
JSON object maps independent reasons to levels, for example
`{"manual":"owner","breadline:123":"user","onboarding":"user"}`. Database triggers
maintain `role` as the strongest surviving grant. Existing assignments are backfilled as
manual grants; their original historical source is unknown. Staff edits change the
manual grant; Breadline deletion revokes only `breadline:<sourceUserId>`. Other grants,
HYPE accounts, and historic source IDs survive. Hub and verified-domain enrolment grant
only `user`.

Only that organisation's Owner, a relevant scoped Hub Admin or SuperAdmin can configure
Users or browse its enabled directory and contacts. Ordinary Members and Organisational
Users cannot enumerate contacts. The master switch stops enrolment and hides the
directory; disabling a rule does not erase existing grants. See
[the import specification](../../spec/breadline/proposal/02-user-import.md).

Organisation profile editing additionally requires the SuperAdmin-granted
`permitUserDetailsEdit` permission on the same organisation as the target membership. It
defaults to off for all organisations; only explicit SuperAdmins may change it. Owners
and relevant Hub Admins cannot grant it to themselves. Revocation is checked again when
saving a profile. Self-profile editing is independent.

## Project

- Owner
- Maintainer
- Translator
- Member
- User (e.g. Volunteer for breadline)

**Table** : `projectRole` **Examples** :

- `thrift` - **Owner**: @tijptjik
- `breadline` - **Owner**: @clau, @dazzy
- `breadline` - **Maintainer:** @winner, @wing
- breadline - **Member:Whip**: @thea, @mel
- breadline - **Member:DropPointManager**: @jonathan, @izzy
- breadline - **Member:Caller**: @vanessa, @jamie
- `hkghostsigns` - **Owner**: @bpotts, @ben
- `hkghostsigns` - **Member**: @clementin, @tijptjik

### Capabilities

#### Capability Policy Actions

- `manageCapabilities` (project-level capability config): allowed for `SuperAdmin`,
  relevant scoped `Hub Admin`, `Organisation Owner`, `Project Owner`; denied for
  `Project Maintainer` and below.
- `assignCapabilities` (project role capability assignment): allowed for `SuperAdmin`,
  relevant scoped `Hub Admin`, `Organisation Owner`, `Project Owner`, and
  `Project Maintainer`; denied for lower roles.

#### User

No Dash / Admin access.

#### Member

Dash Access

##### Volunteer Manager (Whip)

- `@pickupDash` - EventAttendence (User(Volunteer)@Event.Feature(Bakery) & Event.Date)
  - createEventAttendence - Assign runs to volunteers
  - readEventAttendence - Show all users picking up bread
  - updateEventAttendence - Mark as attending (EventAttendence.hasAttended)
  - deleteEventAttendence - Override a user’s claim on a bakery

EventProperty.stats - Confirmed R

##### Drop Point Manager

- `@dropoffDash` - EventAttendence (User(Volunteer)@Event.Feature(DropOff) & Event.Date)
  - createEventAttendence - Assign dropoffs to volunteers
  - readEventAttendence - Show all users dropping off bread
  - updateEventAttendence - Mark as attending (EventAttendence.hasAttended) - i.e.
    dropped off
  - event.eventProperty.value - Override a user’s reported pick up amount

Note `deleteEventAttendence` is not available - user no shows are marked with
`EventAttendence.hasAttended = false`

##### Bakery Manager (Caller)

- `@breadAvailabilityDash`
  - updateEventPropety - Mark available amount / called status
  - readEvent - Show all bakeries donating bread today

#### Translator

- `readProject`
- `readLayer`
- `readFeature`
- `updateProject`, `updateLayer`, `updateFeature` - translations only (`i18n` fields)

#### Maintainer

- `+` Translator capabilities
- `updateProject` (incl. publish; subject to hub-admin-only field restrictions)
- `manageRoles` (`manageProjectRoles`) - add/update/remove project membership
- `assignCapabilities` - assign operational capabilities to project members
- `createFeature`
- `updateFeature` - general feature edits, not limited to translations
- `deleteFeature`
- `manageReviewQueue` - accept/reject reports
- manageTeam - assign Whip/DPM/Caller on a day

Feature transfers require general Feature-update authority in the current project and
Feature-create authority in the destination project. This includes Owners and
Maintainers with grants at both ends, as well as applicable Organisation owners, Hub
admins and Superadmins. Translators cannot transfer Features. The destination layer
determines its project and organisation; those links are rechecked atomically. Transfers
preserve Feature identity, media and history and record the new scope in a revision.
Transfers retain values only for fields assigned to the destination layer within its
project/organisation/hub scope, drop all other fields (including hidden internal
fields), and initialize newly supported fields to null. Previous values remain in
revision history; matching uses field identity, never a similarly named field.
Cross-organisation transfers copy accepted organisation Location corrections and scoped
placement evidence into the destination. Shared Location identities remain shared;
source-owned local Locations are cloned with their accepted baselines. Creating or
reusing an organisation definition requires destination organisation management
permission. Equivalent destination corrections are reused; conflicting definitions
reject the transfer without overwriting either organisation. Copying, relinking and the
Feature transfer commit atomically, with source revisions and copy provenance retained.
Destination project ownership alone does not grant this organisation authority.

Maintainers cannot create or delete layers, or update layer fields other than
translations. They cannot configure project capabilities (`manageCapabilities`) or
delete the project.

#### Owner

- `+` Maintainer capabilities
- `deleteProject`
- `createLayer`
- `updateLayer`
- `deleteLayer`
- `manageCapabilities` - configure project capabilities
- `manageFields` - add/update/remove project & layer fields

Project update, publishing and membership management are shared by Owners and
Maintainers in the current server policy; they are not Owner-only permissions. The
authoritative checks are in [`project.ts`](../../src/lib/api/services/authz/project.ts),
[`layer.ts`](../../src/lib/api/services/authz/layer.ts) and
[`feature.ts`](../../src/lib/api/services/authz/feature.ts).

### Effects

- `ProjectOwners` (and `OrganisationOwners`, `HubAdmin`, `SuperAdmin` ) have visibility
  into deleted files and can undelete them. Lower-tier roles don’t have this visibility
  – a deleted feature will not show up anywhere.
- Members can view published, non-archived content only. Maintainers can view published
  and unpublished content, but cannot view archived content. Owners can view either
  publication state and either archive state. Maintainers and Owners can edit features
  within the states they can view; ordinary public maps still default to published,
  non-archived content.
- Publication Preview is implicit in the existing management roles: Project Maintainers
  and Owners can preview their projects and layers; Organisation Owners can preview
  their organisation and descendants. Relevant hub admins retain their scoped access.
  Members, Users and translation-only roles cannot preview. Project roles never grant
  preview access to an entire parent organisation.
- Preview uses the same existing-child-state/all-children choice as Publish, excludes
  archived assets and unsaved feature drafts, and does not publish anything. Unpublished
  ancestors are included as hierarchy context for the selected scope, without including
  siblings or granting upward editing rights. Preview is distinct from administrative
  viewing of archived content.
- `Members` ordinarily don’t have any additional capabilities, but they show up in the
  project member list so that other roles can be assigned to them. However, when they
  have ‘responsibilities’ assigned to them (e.g. ‘Support Manager’, ‘Whip’,’)
- `Users` don’t have any admin rights, but they show up as valid values for events -
  only project users can attend project “events".

## Analytics capability

`viewAnalytics` grants Usage, Views and Audience for an assigned scope. Organisation
Owners and Project Owners inherit access. Organisation Members may receive the explicit
staff analytics flag; project staff may receive the project `viewAnalytics` capability
through the existing organisation-definition, project-availability and member-assignment
controls. User-level membership never grants analytics. Organisation delegation includes
its projects; project delegation never grants its parent or sibling scopes.

Hub Admins can inspect their hub and owned descendants. SuperAdmins and core Hub Admins
can select global scopes. Assets is restricted to Hub Admins and SuperAdmins; shared
Data remains restricted to SuperAdmins and core Hub Admins. Analytics delegation does
not grant contact-directory/user-search access.

## Hype shared Location corrections

Location authority is field-specific and separate from Feature editing authority.
Project or Organisation editors may correct shared phone numbers, websites, social
profiles and accessibility. Translation-only rights do not grant this authority. Only
SuperAdmin may correct shared names, addresses, brands or other sensitive Location
facts. Organisation-authorized editors may instead maintain those values as Organisation
overrides; those edits must not rewrite the shared baseline. Third-party submissions
remain proposals until an authorized staff reviewer accepts them. Acceptance requires
authority for each destination field, not merely access to the task. Staff edits with
the required authority save directly.
