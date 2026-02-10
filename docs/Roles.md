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
- `updateFeature`
#### Maintainer
- `+` Translator capabilities 
- `createFeature`
- `deleteFeature`
- `manageReviewQueue` - accept/reject reports
- manageTeam - assign Whip/DPM/Caller on a day
#### Owner
- `+` Maintainer capabilities
- `updateProject` (incl. publish)
- `createLayer`
- `updateLayer`
- `deleteLayer`
- `manageRoles` - add/update/remove membership
- `manageFields` - add/update/remove project & layer fields


### Effects

- `ProjectOwners` (and `OrganisationOwners`, `HubAdmin`, `SuperAdmin` ) have visibility into deleted files and can undelete them. Lower-tier roles don’t have this visibility – a deleted feature will not show up anywhere.
- In the `app`, Maintainers get the ability to *also* show unpublished + unreviewed items (i.e. “Pending Review”, Owner additionally have the ability to show unpublished + reviewed (i.e. “Unpublished”) ; and or archived items (i.e. “Deleted”). These options are available in addition to the “Published” option – this is the default option and is the only one activated on load. 
- `Members` ordinarily don’t have any additional capabilities, but they show up in the project member list so that other roles can be assigned to them. However, when they have ‘responsibilities’ assigned to them (e.g. ‘Support Manager’, ‘Whip’,’)
- `Users` don’t have any admin rights, but they show up as valid values for events - only project users can attend project “events".
