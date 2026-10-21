# Roles

## Overview

Roles are used to define the permissions that a user has to a specific resource. A role can be assigned to a user, and a user can have multiple roles.

## Hub

- Admin
- User (default, implicit)

Table : `hubRole`
Examples :
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
- Member (default)

**Table** : `organisationRole`
**Examples** :
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

## Project

- Owner
- Maintainer
- Translator
- Member
- User (e.g. Volunteer for breadline)

**Table** : `projectRole`
**Examples** :
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

- `manageCapabilities` (project-level capability config): allowed for `SuperAdmin`, relevant scoped `Hub Admin`, `Organisation Owner`, `Project Owner`; denied for `Project Maintainer` and below.
- `assignCapabilities` (project role capability assignment): allowed for `SuperAdmin`, relevant scoped `Hub Admin`, `Organisation Owner`, `Project Owner`, and `Project Maintainer`; denied for lower roles.

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
    - updateEventAttendence - Mark as attending (EventAttendence.hasAttended) - i.e. dropped off
    - event.eventProperty.value - Override a user’s reported pick up amount

Note `deleteEventAttendence` is not available - user no shows are marked with `EventAttendence.hasAttended = false`

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

Maintainers cannot create or delete layers, or update layer fields other than
translations. They cannot configure project capabilities (`manageCapabilities`)
or delete the project.

#### Owner
- `+` Maintainer capabilities
- `deleteProject`
- `createLayer`
- `updateLayer`
- `deleteLayer`
- `manageCapabilities` - configure project capabilities
- `manageFields` - add/update/remove project & layer fields

Project update, publishing and membership management are shared by Owners and
Maintainers in the current server policy; they are not Owner-only permissions.
The authoritative checks are in
[`project.ts`](../../src/lib/api/services/authz/project.ts),
[`layer.ts`](../../src/lib/api/services/authz/layer.ts) and
[`feature.ts`](../../src/lib/api/services/authz/feature.ts).

### Effects

- `ProjectOwners` (and `OrganisationOwners`, `HubAdmin`, `SuperAdmin` ) have visibility into deleted files and can undelete them. Lower-tier roles don’t have this visibility – a deleted feature will not show up anywhere.
- Members can view published, non-archived content only. Maintainers can view published and unpublished content, but cannot view archived content. Owners can view either publication state and either archive state. Maintainers and Owners can edit features within the states they can view; ordinary public maps still default to published, non-archived content.
- Publication Preview is implicit in the existing management roles: Project Maintainers and Owners can preview their projects and layers; Organisation Owners can preview their organisation and descendants. Relevant hub admins retain their scoped access. Members, Users and translation-only roles cannot preview. Project roles never grant preview access to an entire parent organisation.
- Preview uses the same existing-child-state/all-children choice as Publish, excludes archived assets and unsaved feature drafts, and does not publish anything. Unpublished ancestors are included as hierarchy context for the selected scope, without including siblings or granting upward editing rights. Preview is distinct from administrative viewing of archived content.
- `Members` ordinarily don’t have any additional capabilities, but they show up in the project member list so that other roles can be assigned to them. However, when they have ‘responsibilities’ assigned to them (e.g. ‘Support Manager’, ‘Whip’,’)
- `Users` don’t have any admin rights, but they show up as valid values for events - only project users can attend project “events".
