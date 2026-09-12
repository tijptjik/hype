---
created: 2025-09-15T17:02
updated: 2025-12-01T22:50
---

### Features

### Governance & Commitments

- The HYPE project's goal is to improve the quality of life in Hong Kong by making existing cultural and urban resources more accessible.
- The HYPE project's codebase(s), the hype.hk domain, and the hype.hk infrastructure are owned and operated by Droste Limited.
- Partners are given:
  - **A dedicated hub on hype.hk**, which is a variant of the HYPE app in which the partner controls which maps are offered through the hub. A hub supports
    - Access through a custom domain, e.g. https://breadline.hk
    - Access through a subdomain, e.g. https://breadline.hype.hk
    - Control over the _Projects_, _Layers_, and _Features_ which are shown in the maps.
    - Custom landing page
    - Custom map styles
    - Custom widgets - see below
    - Custom navbar - see below
    - Custom admin views - see below
    - Custom roles - see below
    - Optionally be included in the core Hub (https://hype.hk)
  - **Data Ownership** - any data that is associated with the partner (i.e. associated with the _Organisation_ or the _Project_ in the HYPE app) is owned by the partner and is made available by the partner to Droste, specifically, under a limited license (TBD), and to the public, generally, under a license which can be set on the Project's profile page.
    - **Exclusive Ownership** : Features (ex `Donors`, `Dropoffs`), `Properties` (new), ProjectRoles (ex `User Roles`), Images, and Events (ex `Runs`)
      - This data can be amended, added to, or deleted at will by the partner, and can be exported in full upon request.
      - The scope includes relationships, e.g. the users who claimed a run (i.e. attending an event) are included and can be managed by the partner.
    - **Shared Ownership** : Users, Accounts (ex `Users`), `Sessions` and user preferences (i.e. `UserLayers`, `UserFeatures`) are primarily owned by the respective users. However, this data is shared with HYPE and the partner for the purposes of providing the service. Any other core data used to facilitate the functioning of the system (e.g. `Places` and related location data) are also available to the partner;
      - The partner is restricted to amending the name and phone numbers for users which have a volunteer role in their project, users cannot be deleted or added to. The right to delete or create a user is reserved for the users themselves as they are the primary owners of the data and need to provide their credentials.
      - **??** Do you have a need to ban accounts?
    - **Data Export** The partner can at any time request a full export of the above for the purposes of recreating the HYPE infrastructure in a third-party environment. Droste is committed to provide such a comprehensive export and provide assistance in understanding the data structure and its contents. This data export will NOT contain data from any other partners or the core hub.
  - **No lock-in guarantee** - Droste is committed to never impede its partners from forging their own path. This entails that at any time, partners can inform Droste that they want to cease being part of the HYPE project and want to "spin off" their hub and bring it under their own or another third-party's management. To enable this, Droste is committed to share
    - **Source code** - specifically, an export from the GitHub repository. By default this would be the latest commit, but the partner may specify any date from the duration of the partnership. See **Fair Source** below for the plans to make the source code available under a permissive license.
    - **Data** - Share an export of the data associated with the partner's hub. See **Data Ownership** above.
    - **Knowledge and best practice** - on setting up a third-party infrastructure, and advise on the third-party services HYPE depends on.
  - **Maintenance** - as part of the HYPE project, the software and infrastructure powering the partner's hub will be maintained for as long as the HYPE project is actively maintained:
    - **Tech Stack** as new versions of dependencies are released (see **Tech Stack** below for the major ones), we perform a cost/benefit analysis to keeping parity with the latest version of a library. If the latest version cannot be adopted immediately, a migration is planned so we can soon benefit from newly added features and retaining parity with the broader web ecosystem.
    - **Security vulnerabilities** in third-party are patched whenever fixes become available.
    - **Cloud Infrastructure** offerings evolve often requiring applications to either update their configurations or migrate their deployments. HYPE centrally manages these for all partner hubs.
    - **Cost Effectiveness** Droste is also committed to using the most cost-effective cloud services, so in case the pricing of current or competing SaaS services change, a cost/benefit analysis is performed to ensure that the infrastructure is run in the most cost-effective way. This ensures that the infrastructure remains affordable and sustainable.
  - **Free Web App Hosting** - Thanks to HYPE's technology and infrastructure choices the cost-control of hosting is currently excellent. Subject to a Fair Use Policy (FUP), the hosting will remain free for partners. Practically, the FUP provides that Droste will absorb up to USD 10 / month in hosting fees incurred by the partner.
  - **Vector Tile Hosting** - Droste hosts its own tile server based on an OpenStreetMaps (OSM) extract. This avoids incurring API fees (e.g. Google Maps or Mapbox) and offers greater control over the how the data is stored, loaded and presented. Droste performs regular data extracts to the latest OSM data. Note that the coverage is currently limited to Hong Kong SAR.
  - **Places Directory** - Droste will offer a Places API based on a Hong Kong-specific extract of Overture Maps. The directory will allow HYPE users to pre-populate feature details (such as addresses, locations, phone numbers and opening hours) where available, and provide a source to validate existing data and get notified of changes.
  - **Mobile App Friendly Codebase** - while HYPE is developed as a web app, the codebase has been architected to allow for mobile app toolkits such as _Capacitor_ or _Tauri_ to simply wrap the HYPE client app, and retain full compatibility with the back-end server with minimal effort. Our Sveltekit endpoints are all exposed and consumed as explicit REST API endpoints instead of tightly coupled load functions.
  - **Source code access** - partners can request access to the source code. Access is offered through accounts with read-only privileges on the GitHub repository. See **Fair Source** below for the plans on opening the codebase to the public and welcoming contributions.
  - **Issue tracker access** - partners can request access to the issue tracker. This gives visibility into the development priorities and allows partners to report bugs and propose feature requests. Access is offered through our GitHub repository. Once the project is open source, the public at large will have this visibility too.
- Partners are NOT given admin access to the
  - **Database** - to safeguard data integrity. For analytical reporting purposes, Droste will assist in running SQL to produce a periodic data extract.
  - **Infrastructure** - to safeguard service integrity.
  - **Repository** - to safeguard code integrity. Read access is provided from the outset, and contributor access will be enabled once the project is open sourced.
- **Commercialisation** - While the HYPE project is primarily a project that supports the public good by promoting grass roots projects, surfacing culture, public infrastructure and events. Our approach to commercialisation is :
  - **Free Forever** - Our core service (https://hype.hk) will forever be free for the public to use. We will endeavour to onboard more partner organisations and projects to enrich the map. The service level for these partner will not be degraded in the future: we thus have a commitment to serve them free of charge with the current feature set - or better, as the functionality of the app is further enhanced.
  - **Bespoke Development** - Partners may request specific features or services to be added to the platform or their hub. If they are of general interest and aligned with the project goals, they can simply be added to the roadmap and will be developed as part of the HYPE platform. However, if a partner wants their features prioritised, Droste will cost them out and partners can cover the development costs to have them made. Note that we will only consider features and services which align with the project goal.
  - **Affiliates** - Droste will develop its own hubs for service verticals (e.g. dentistry, therapy, psychiatry) and monetise referrals to affiliates listed on those hubs and use part of the proceeds to support continued development of the HYPE platform.
  - **Monetisation** - There are NO plans to monetise any of the partner's data. However, if we do change course to (indirectly or otherwise) monetise partner's data on the platform, we will (1) inform partners of the change in commercial strategy, (2) offer partner's an opt-out, (3) present a revenue-share model where the revenue is shared with partners, where their share would be based on, e.g. how often their features are shown to end-users.
    - Personal data will NEVER be sold to a third-party.
- **Fair Source** - While the HYPE codebase is currently held in a private repository, the goal is to release it with a permissive license; specifically the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](https://github.com/getsentry/fsl.software/blob/main/FSL-1.1-MIT.template.md) which is a Fair Source License (FSL).
  - The difference between FOSS (Free Open Source Source) and FSS (Fair Source Software) is that the latter imposes a non-compete period for each software release. The software is still publicly available, permits any personal use, and is <u>guaranteed</u> to become Open Source (MIT in our case) albeit with a two-year delay. During that window a third-party cannot offer a substitute service for commercial gain using the (non-yet-FOSSed) HYPE source code. This is intended to protect (1) HYPE community projects from the free rider problem, and (2) HYPE's commercial model from being put at risk by making the source code available.
  - If Droste no longer is able to maintain the HYPE project, it is also committed to either (1) transfer the project leadership to a trusted party, or (2) release a last version under MIT so that the restrictions on use is removed. In either case, all parties will be informed in advanced.
  - There are currently a number of blockers which need to be cleared first before the project can be released under the FSL:
    - Migration from `Zod v3` to `Zod v4`
    - Migration from `Tailwind v3` to `Tailwind v4`.
    - Migration of components to `Bits UI`.
    - Migration from `maplibre` to `svelte-maplibre-gl`.
    - Dropping `SuperForms` in favour of `Remote Functions`.
    - Dropping dependency on `DaisyUI`.
    - Test suite covering the most important user flows.
    - Implement paging on all end-points and components.

### Tech Stack

- **UI** : [Svelte](https://svelte.dev/)
- **Server** : [Sveltekit](https://svelte.dev/docs/kit/introduction) with Cloudflare adaptor
- **UI Components** : [BitsUI](https://bits-ui.com/)
- **ORM** : [Drizzle](https://orm.drizzle.team/)
- **Auth** : [Better Auth](https://www.better-auth.com/)
- **CSS** : [Tailwind](https://tailwindcss.com/)
- **I18N** : [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
- **Map Data** : [OSM](https://www.openstreetmap.org)
- **Map Rendering** : [MapLibre](https://maplibre.org/maplibre-gl-js/docs/)
- **Map Tile Storage** : [PMTiles](https://docs.protomaps.com/pmtiles/) hosted on R2.
- **Map Styles** : [Protomaps basemap](https://docs.protomaps.com/basemaps/layers)
- **Build Tool** : [Vite](https://vite.dev/)
- **Edge Runtime** : [Cloudflare Workers](https://workers.cloudflare.com/) with Node.js compatibility
- **Static Asset Hosting** : [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- **Database** : [Cloudflare D1](https://www.cloudflare.com/en-gb/developer-platform/products/d1/) (SQLite-based)
- **Version Management**: Git and [Changesets](https://github.com/changesets/changesets)
- **CI/CD**: [GitHub Actions](https://github.com/features/actions)

### Features

### I18n

- ✅ [domain::i18n] : [priority::5] - **Support for English**
- [domain::i18n] : [priority::5] - **Support for Traditional Chinese**
  - `external` translate any additional strings added in the redesign
- [domain::i18n] : [priority::2] - **Support for Simplified Chinese**
  - `external` validate the machine translation from traditional Chinese to simplified Chinese

### Auth

- ✅ [domain::auth] : [priority::5] - **Support for auth with Google Accounts**.
  - [domain::auth] : [priority::5] - Migrate all existing breadline accounts (via Google sub claims) to Hype accounts. All existing users will have to login again to authenticate with HYPE. Telephone numbers and user stats will be migrated too.

### Data Architecture

#### Current Schema

![[annotated_Pasted image 20251015222038]]

#### Migration Mapping

🌞 = new table not currently part of the HYPE schema

- [domain::data] : [priority::5] - **Historic Data** - retain all historic records of runs.
  - [domain::data] : [priority::5] - Migrate the schema to Breadline `v4`
    - `donor` → `feature`
      - `-` → `id` - use a randomly generated NanoID
      - `-` → `layerId` - `layerId` for Donors
      - `-` → `projectId` - i.e. `Breadline`
      - `-` → `organisationId` - i.e. `HKFoodWorks`
      - `-` → `contributorId` - **??** Who do you want to attribute the shops too?
        - Use Claudio's acount
      - `id` → `feature.properties.id_v3` - **??** Do you want to keep the old Id?
        - NO - drop them.
      - `created_at` → `createdAt`
      - `last_updated_at` → `modifiedAt`
      - `code` → `feature.featureProperty.property.code` - **??** Do you want to keep this code practice?
        - NO - drop them.
      - `geom` → `-`
      - `active` → `isVisitable`
      - `address_display_en` → `feature.featureI18n[locale='en'].displayAddress`
      - `address_display_zn` → `feature.featureI18n[locale='zh-Hant'].displayAddress`
      - `-` → `feature.featureI18n[locale='zh-Hans'].displayAddress`
      - `address_full_en` → `feature.i18n.en.{structured address}`
      - `address_full_zh` → `feature.i18n.zh-Hant.{structured address}`
      - `-` → `feature.i18n.zh-Hans.{structured address}`
      - `brand` → `feature.featureProperty.property.brand` - {`Maxims, Arome, 7 Eleven, St. Honore, Yamazaki`}
      - `name_en` → `feature.featureI18n[locale='en'].title`
      - `name_zh` → `feature.featureI18n[locale='zh-Hant'].title`
      - `-` → `feature.featureI18n[locale='zh-Hans'].title`
      - `nearest_mtr_exit` → `feature.featureProperty.property.MtrExit` - {`A`,`B`,`C2`, etc}
      - `nearest_mtr_station_en` → `feature.featureProperty.featurePropertyI18n[locale='en'].MtrStation` - {`Central`,`Wong Tai Sin`, etc}
      - `nearest_mtr_station_zh` → `feature.featureProperty.featurePropertyI18n[locale='zh-Hant'].MtrStation`
      - `-` → `feature.featureProperty.featurePropertyI18n[locale='zh-Hans'].MtrStation`
      - 🌞 `pickup_times` → `feature.schedule`
        - See "Schedule" tables below for schema and functionality
        - **??** Original is an array with 8 values - mon-sun + ph. Is this correct?
          - YES
        - **??** Treat the value as the start time of the window. Is this correct?
          - NO - END time
        - **??** What is the default window logic?
          - 15 minutes before closing time.
          - 19:00 in the data means end tim
          - 19-21 in the data means a range
      - `latitude` → `geometry.coordinates[1]`
      - `longitude` → `geometry.coordinates[0]`
      - `phone` → `feature.featureProperty.property.phoneNumber`
      - `shop_code` → **??** Do you want to keep this code in practice? Is this used for anything other than the `code` generation?
        - NO - drop it.
      - `-` → `visitableAsOf` - This is technically the last time the schedule was confirmed.
      - `-` → `isIntangible` - N/A for you.
      - `-` → `isArchived` - Once donors should no longer be shown on the map.
      - `-` → `isPendingReview` - As part of the user submitted feature flow, but likely not relevant for you.
      - `-` → `publishedAt` - timestamp
      - `-` → `publisherId` - **??** Who do you want to attribute the shops to - is there a breadline account?
        - Claudio's account
    - `dropoffs` → `feature`
      - `-` → `id` - use a randomly generated NanoID
      - `-` → `layerId` - `layerId` for Drop Off Points
      - `-` → `projectId` - i.e. `Breadline`
      - `-` → `organisationId` - i.e. `HKFoodWorks`
      - `-` → `contributorId`
        - **??** Who do you want to attribute the shops too?
          - YES to Claudio
      - `id` → `feature.properties.id_v3` - **??** Do you want to keep the old Id?
        - NO
      - `created_at` → `createdAt`
      - `last_updated_at` → `modifiedAt`
      - `name_en` → `feature.featureI18n[locale='en'].title`
      - `name_zh` → `feature.featureI18n[locale='zh-Hant'].title`
      - `address_full_en` → `feature.i18n.en.{structured address}`
      - `address_full_zh` → `feature.i18n.zh-Hant.{structured address}`
      - `latitude` → `geometry.coordinates[1]`
      - `longitude` → `geometry.coordinates[0]`
      - 🌞 `-` → `feature.schedule`
        - See "Schedule" tables below for schema and functionality
        - **??** You'd want to be able to differentiate the availability of drop-off points per day of the week right?
          - YES
        - **??** How was that currently encoded? I didn't see it in the schema, was it hard-coded into the codebase?
          - YES - `ngo_dropoff.dow` - the time is part of the address on `dropoffs`
      - `google_maps_url` → `-` **??** Is it acceptable to just route to the LatLng? or why do you have a dedicated Google URL in the schema?
        - YES - that's fine.
      - `-` → `visitableAsOf` - This is technically the last time the schedule was confirmed.
      - `-` → `isIntangible` - N/A
      - `-` → `isArchived` - Once drop off points should no longer be shown on the map.
      - `-` → `isPendingReview` - As part of the user submitted feature flow, but likely not relevant for you.
      - `-` → `publishedAt` - timestamp
      - `-` → `publisherId` - **??** Who do you want to attribute the drop-off points to - is there a breadline account?
        - NO
    - `roles` → `ProjectRole` - In addition to the `OrganisationRole` which Hype provides, which allows you (Daisy, Claudio) to be the 'superAdmins' of the Organisation and control the membership and roles in the project (Breadline), there are roles that users can have FOR the project.
      - The defaults are `maintainer` and `member` - the former can control membership and has access to the reviewQueue, and the latter has access to edit features (e.g. Bakeries).
      - But specifically for Breadline, we'll be adding additional roles so we can meet your needs :
        - `volunteer` - assigned to every user who
          1. Was imported from the old database
          2. signs up through your Hub (breadline.hk), or
          3. has an account on Hype.hk but claims one of the runs.
        - `support` - to be assigned by a `maintainer` to every user which needs access to:
          - **Donor Call List** - list of bakeries which are participating in today's run.
          - **Drop-off Point Check-in** - list of volunteers who are expected to arrive at a particular drop-off point on that day, with the ability to mark them as seen.
      - These replace the existing roles `volunteer`, `donor`, `ngo`, `admin`, `group` and `leader`.
      - `-` → `organisationId` - HKFoodWorks ID
      - `user_id` → `userId`
    - 🌞 `runs` → `event` - An event is a repeating occurrence where the specific occurrence is relevant from a modelling perspective. I.e. features can have `schedules` associates with them (e.g. for opening hours), and since we are only interested in the pattern here (i.e. not tracking anything for a specific day) it's modelled as a schedule instead of an event. Whereas for _runs_, we want to be able to track data against specific instances. In short, a schedule can determine _when_ an event may take place, but the _event_ is the record of that specific occurrence.
      - `-` → `id` - use a randomly generated NanoID
      - `-` - `type` - Initially we'll just have the `pickupWindow` and `dropoffWindow` event types (+ `programme` and `programmeSlot`)
      - `id` → `event.eventProperty.property.id_v3` - **??** Do you want to keep the old Id?
        - NO
      - `donor_id` → `featureId` - The bakery / shop
      - `volunteer_id` → `event.eventAttendance.userId` - Many to Many relationship so that we CAN support multiple users participating in a single run (if we want to).
      - `ngo_id` → dropped
      - `-` → `capacity` - how many runners can take this run? Default to 1.
      - `claimed` → `atCapacity` - If capacity has been reached, then this is true, otherwise it's false and it can be shown on the map to be claimed.
      - `expected_amount` → 🌝 `event.eventProperty[value].property.[key=expectedAmount]` - a numerical property, thus not translatable. We currently don't have a numerical fields so this will be added.
      - `collected_amount` → `event.eventProperty[value].property.[key=collectedAmount]` - a numerical property, thus not translatable.
      - `date` → `fromDate`
      - `-` → `untilDate` - Not relevant for current Breadline, same as `fromDate`
      - `-` → `fromTime` - Start of the collection window, taken from `feature.schedule.scheduleRule[dayOfWeek=1..7|ruleType=publicHoliday].timeSegments.untilTime`, but can be overridden for this particular date.
        - **??** Is there a practical logic for determining the pickup window from the closing time? Or should we just use the closing time as the reference?
      - `-` → `untilTime` - End of the collection window, defaults to `feature.schedule.scheduleRule[dayOfWeek=1..7|ruleType=publicHoliday].timeSegments.untilTime`, but can be overridden for this particular date.
      - `created_at` → `createdAt`
      - `last_updated_at` → `modifiedAt`
    - 🌞 `drop_selection` → `event` - Just like a pick-up run is an _event_ for a bakery feature, a drop-off is an _event_ for a collection point feature.
      - `-` → `id` - use a randomly generated NanoID
      - `-` - `type` - The `dropoffWindow` types.
      - `dropoff_id` → `featureId` - The drop-ff point
      - `volunteer_id` → `event.eventAttendance.userId` - Many to Many relationship so that multiple users can opt to use a particular drop-off point on that day.
      - `-` → `capacity` - There is no capacity for the drop-off points – any number of volunteers can show up.
        - **??** Are you still looking at optimising the 'hauls' per drop-off point?
          - NOT NOW
      - `-` → `atCapacity` - Always false for drop-off events.
        - **??** Unless you'd want to tell people that the drop-off point is "full"? Anyway, I imagine this modeling concept will be useful if you ever expand to have beneficiaries as drop-off points.
          - NOT NOW
      - `expected_amount` → `event.eventProperty.property.expectedAmount`
        - **??** Would you want to have this for analytics / display purposes? It would be the total amount reported for bakeries claimed by users who have selected this as the drop-off event they are participating in.
          - NO VALUE
      - `collected_amount` → `event.eventProperty.property.collectedAmount` - Sum of all the picked up buns reported by the volunteers who are using this drop-off event, who are marked as `event.eventAttendance.hasAttended`.
        - **??** Would you want to have this for analytics / display purposes?
          - YES - useful because different dropoff points go to different beneficiaries
      - `date` → `fromDate`
      - `-` → `untilDate` - Not relevant for current Breadline, same as `fromDate`
      - `-` → `fromTime` - Start of the dropoff window, taken from `feature.schedule.scheduleRule[dayOfWeek=1..7|ruleType=publicHoliday].timeSegments.fromTime`, but can be overridden for this particular date.
        - **??** Is there a practical logic for determining the dropoff window?
          - YES - optimise the 'best' 2 hours, so it opens at 20:00.
            - Incentivise early runners to pick up mores
            - Not have drop off managers to volunteer more than 2 hours.
      - `-` → `untilTime` - End of the dropoff window, defaults to `feature.schedule.scheduleRule[dayOfWeek=1..7|ruleType=publicHoliday].timeSegments.untilTime`, but can be overridden for this particular date.
      - `created_at` → `createdAt`
      - `last_updated_at` → `modifiedAt`
    - `users` → `user` / `account`
      - `volunteer_id` → `user.id` - a randomly generated NanoID
        - `""` → `account.userId` - mapping to the User
      - `name` → `user.name` - User's full name, as close to their
      - `email` → `user.email` - User's contact email address
      - `-` → `user.emailVerified` - part of the BetterAuth schema.
      - `picture` → `user.image` - User's profile image
      - `locale` → `user.locale` - User's locale preference, defaults to 'en'
      - `-` → `user.attribution` - How User's want to be credited.
      - `-` → `user.isArchived` - Whether the user is still available for server functions.
      - `-` → `user.preferences` - App-related preferences.
      - `-` → `user.experimental` - Experimental features flags
      - `-` → `user.username` - Unique username
      - `-` → `user.displayUsername` - a URL-safe version of the username
      - `-` → `user.isAnonymous` - whether the user has an account associated with it or is ephemeral.
      - `-` → `user.createdAt`
      - `-` → `user.updatedAt`
      - `ngo_id` → dropped
      - `family_name` → dropped
      - `given_name` → dropped
      - `name` → dropped
      - `gender` → dropped
      - `welcome_completed` → dropped - instead of this flag, we can use the role `volunteer` as a sign they have completed the welcome, as every breadline user has at least a volunteer role, and they must complete the onboarding to become a user.
        - **??** Is this acceptable? There are currently 2600+ accounts which have not completed the welcome.
          - YES
      - `telephone` → 🌝 `user.telephone`
      - `id` → `account.id` - a randomly generated NanoID
      - `uid` → `account.accountId`
        - **??** The `uid` is not purely google AccountIDs, what are the other values ? E.g. `Facebook_10156780847508310` and `ea3245b8-0a90-4f13-983b-75f0a91c2dd8`.
          - Drop the Facebook users
          - Maybe keep the users that haven't completed the welcome
      - `-` → `account.providerId = google`
      - `-` → `account.accessToken` - betterAuth schema
      - `-` → `account.refreshToken` - betterAuth schema
      - `-` → `account.accessTokenExpiresAt` - betterAuth schema
      - `-` → `account.refreshTokenExpiresAt` - betterAuth schema
      - `-` → `account.scope` - betterAuth schema
      - `-` → `account.idToken` - betterAuth schema
      - `-` → `account.password` - betterAuth schema
      - `-` → `account.createdAt`
      - `-` → `account.updatedAt`

- [domain::data] : [priority::5] - The following tables are dropped in the migration:
  - `dropoffs_schedule`
  - `migratehistory`
  - `ngos`
  - `ngos_dropoffs`
  - `ngos_schedule`
  - `users_roles` ``
  - `voluneers_ngos`
  - `voluneers`
    - The values from `runs_completed` and `saved_amount` will still be available, even if the fields will no longer be. Instead, we have a more robust leaderboard system which can simply be queried by volunteer (`userId`) for their 'AllTime' stats (`timeFrame==null`) values for the breadline Project (`projectId`). These values are calculated every night, based on a simple sum of `property.[key=collectedAmount].eventProperty.[value]` for collected buns or a trueCount of `eventAttendance.hasAttended` for number of runs.

- [domain::data] : [priority::5] - Create new tables to support the scheduling functionality
  - `schedule`
    - `id` - NanoID
    - `ownerType` - `feature` or `place`
    - `ownerId` - `featureId` or `placeId`
    - `osmOpeningHours` - The original OSM opening_hours string for parsing
    - `timezone` - `Asia/Hong_Kong`
    - `isActive` - whether the schedule is current.
    - `createdAt`
    - `modifiedAt`
  - `scheduleRule`
    - `id` - NanoID
    - `scheduleId` - ScheduleID
    - `ruleType` - `weekly` or `nthDoWly` for regular every day of the week rules, or more sparse, every Nth day of the month.
    - `dayOfWeek` - Day of the Week (Monday through Sunday).
    - `nth` - 1=1st, 2=2nd, 3=3rd, 4=4th, -1=last
    - `timeSegments` - Segment of start and end times.
    - `isClosed` - location is closed this day
    - `is24Hours` - Open 24 hours
    - `priority` - Within same schedule, higher priority rules take precedence in case of conflict.
    - `validFromDay` - Optional start day for this rule (1-31)
    - `validFromMonth` - Optional start month for this rule (1-12)
    - `validFromYear` - Optional start year
    - `validUntilDay` - Optional end day for this rule (1-31)
    - `validUntilMonth` - Optional end month for this rule (1-12)
    - `validUntilYear` - Optional end year
    - `createdAt`
    - `modifiedAt`
  - `scheduleRuleI18n`
    - `scheduleRuleId` - FK to `scheduleRule`
    - `locale` - English, Traditional or Simplified Chinese
    - `name` - Full Name in {locale} (e.g., "Winter Hours", "Summer Schedule")
    - `nameShort` - Short Name in {locale}, used in navigation (e.g., "Winter", "Summer")
    - `nameGen` - Generation flags for AI-assisted translation
    - `nameShortGen` - Generation flags for AI-assisted translation
  - `scheduleException`
    - `id` - NanoID
    - `scheduleId` - ScheduleID
    - `exceptionDate` - Specific date in `YYYY-MM-DD` format
    - `exceptionType` - Whether it's a `holiday`, `event`, `closure`, `specialHours`
    - `timeSegments` - Segment of start and end times.
    - `isClosed` - location is closed this day
    - `is24Hours` - Open 24 hours
    - `createdAt`
    - `modifiedAt`
  - `scheduleExceptionI18n`
    - `scheduleExceptionId` - FK to `scheduleException`
    - `locale` - English, Traditional or Simplified Chinese
    - `name` - Full Name in {locale} (e.g., "Easter Hours", "Golden Week Schedule")
    - `nameShort` - Short Name in {locale}, used in navigation (e.g., "Easter", "Golden Week")
    - `nameGen` - Generation flags for AI-assisted translation
    - `nameShortGen` - Generation flags for AI-assisted translation
- [domain::data] : [priority::5] - Create new tables or modify existing ones to support the run pick-up, and drop-off check-in functionality
  - `eventAttendance` - Once a user claims a 'bakery' on a day (a pickup event) an entry is made to match the user with the event; equally, once a user selects a drop-off point (a drop-off event), they are linked and can be listed in a check-off roster.
    - `eventId` - EventId
    - `userId` - UserId of the volunteer
    - `hasAttended` - track whether the user has visited the bakery in the case of a pickup event, or delivered the bread in the case of a drop-off event. The latter is performed by a drop-point managed on a in-app check-list specific to their drop-point.
      - TRUE = confirmed attended
      - FALSE = confirmed NOT to have attended
      - null = unconfirmed
  - `eventProperty` - Map properties to Events - useful for `collectedAmount` and `expectedAmount`.
    - `eventId` - EventId
    - `propertyId` - PropertyId
    - `value` - the amount collected or expected.
  - `property` - Add the following columns:
    - `isSystemProperty` - boolean flag, default to false, whether it's a system property that cannot be deleted as code relies on it. This cannot be set by the users directly, but should be part of a data migration initialising the property.
    - `isCalculated` - boolean flag, whether the value of the property can be set, or is purely calculated by the system, e.g. the collectedAmount at dropOffs events.
  - `layerProperty` - Add the following columns
    - `isEventExclusive` - boolean flag, this property should not be shown on the Features in this layer, but instead on the Feature's Events.
      - In the hierarchy `Layer` (All Drop-off Point<u>s</u>) → `Feature` (Specific Drop-off Point) → `Event` (Drop-off Point activity that day), the properties which are marked "isVisiable" and "isEventExclusive" will be shown on the events related to those drop points.
      - Similarly, in the hierarchy `Layer` (All Baker<u>ies</u>) → `Feature` (Specific Bakery) → `Event` (i.e. Run), the properties which are marked "isVisiable" and "isEventExclusive" will be shown on the run related to that bakery that day.
      - In both cases they would NOT be shown in the Bakery and the Drop off point card.
- [domain::data] : [priority::4] - Create a new tables to support leaderboard functionality
  - `leaderboard`
    - `id` - NanoID
    - `projectId` - FK to Project (i.e. Breadline)
    - `layerId` - FK to Layer (i.e. picked up vs delivered)
    - `propertyId` - FK to Property (i.e. `collectedAmount`), null for _runs_
    - `resourceType` - `event`, `eventAttendance` or `feature`, `event` for `collectedAmount` and `eventAttendance`
    - `aggregationField` - which field to `aggegate` over, defaults to `value`, `hasAttended` for _runs_.
    - `aggregation` - aggregation function, i.e. `sum`, `count`, `mean`, `countTrue` - in our case it's `sum` for `collectedAmount` and `countTrue` for runs (i.e. `eventAttendance` related to events related to features in the dropOff layer, where `eventAttendance.hasAttended` is true)
    - `timeFrame` - whether it's considering a `year`, `month`, or `date`.
    - `period` - specific year, month or date - null means it's ongoing
    - `modifiedAt` -
    - `createdAt` -
  - `leaderboardRanking`
    - `leaderboardId` - FK to Leaderboard
    - `userId` - FK to User
    - `value` - the aggregate metric
    - `rank` - the resulting rank
    - `modifiedAt` -
    - `createdAt` -
  - We must run a nightly job which:
  - Inserts / replace rows which don't have a specified `period`, with the new values for open boards.
  - At the end of a period, set the period value and insert the next open board (e.g. on 2024-03-01 finalise Feb, and create the March MTD rows with period = null).

- [domain::data] : [priority::5] - Migrate data from Breadline `prod` to Hype `prod`.

### Mini Apps

HYPE is a mapping platform that supports "mini-apps" to run on top of shared infrastructure. Mini-apps determine what is shown to the users, what functionality if offered, and how the app is styled. There are three conditions under which the Breadline mini app is activated:

- A user visits `breadline.hk`.
- A user visits `breadline.hype.hk`.
- A user visits `hype.hk` and selects the `Breadline` project.

In the first two cases (which we call a 'hub'), the user directly runs the breadline mini-app and will not have the ability to switch to any of the other maps. This is the default experience in which the breadline users won't even know that it's a HYPE app. In the third case, selecting the `Breadline` project activates the mini-app: this updates the map styling, which widgets are shown, and it removes any non-breadline markers on the map.

### Views

![[Breadline v4 2025-10-18 19.15.16.excalidraw|520|center]]

- [domain::page] : [priority::4] Responsive landing page (breadline.hk/welcome) for the breadline Hub
  - Featuring:
    - Breadline's visual language
    - Breadline app visuals
    - Tutorial video
    - Reference to HK FoodWorks
    - Launch the app
    - Sections about breadline (replaces the FAQ on the homepage)
    - Language Selector
  - `external` Recreate the Breadline Tutorial Video

![[Drawing 2025-10-18 20.16.05.excalidraw|720|center]]

- [domain::page] : [priority::5] **Auth Flow**.
  - Login is handled from the landing page, so the dedicated login view is removed.
  - Users are still required to provide their phone numbers, so the app cannot be used until a phone number is provided.

![[Breadline v4 2025-10-18 20.18.24.excalidraw|center|800]]

- [domain::widgets] : [priority::5] Whenever the Breadline MiniApp is running, HYPE's omnibar is replaced by widgets to control the time:
  - **Data Picker** - pick any date on which Breadline is offering runs.
    - Functionality is similar to the current widget.
    - Today should read as "Today", tomorrow as "Tomorrow" instead of the calendar date.
  - **Time Ranger Slider**
    - Functionality is similar to the current widget.
    - Real-time update the markers as the slider is interacted with, don't show a spinner.
    - Markers will match is there is at least 1 minute overlap between the pick-up window and the slider range, i.e. if the slider selects 20:00, and the end of the pick-up window is 20:00 it should NOT be shown.
      - **??** Is this the desired behaviour?
        - Left side included, right side excluded.

![[Breadline v4 2025-10-18 20.57.26.excalidraw|center]]

- [domain::map] : [priority::4] Map Styles
  - Offer a light map style with clearly recognisable features.
  - Show a collapsible legend with the marker significance.
    - **??** Are these still the 3+1 meaningful states / ranges?
      - YES - keep it.
  - Show 'You are here' marker.
  - Modernise the markers style
    - We differentiate along two dimensions:
      - Statistically Expected vs Reported Expected (the former has a white ring, the latter has a accent hue of the volume).
        - We also use the outer ring to indicate 'claimed' status, to clearly indicate which bakeries they have already picked.
      - Volume Tier : High / Med / Low / None
    - If _no Info_, a recency-biased average collected amount is used, where every recent month is twice as important as the values from the month prior to it, only the most recent 3 months are considered.
    - These statistically expected amounts are mapped to High / Med / Low yield colour scheme.
    - If there is no historic/reported information, we'll default to the Low tier (this avoid introducing another colour encoding)
               ![[Pasted image 20251018210931.png|800]]
      **??** Would you like to support clustering? Are you happy with how the markers currently convey the quantities?
                   MAYBE - to discuss.

![[Breadline v4 2025-10-18 22.51.12.excalidraw|center|800]]

- [domain::nav]: [priority::5] The navigation bar will consist of the following buttons:
  - **HUB** (breadline.hk)
    - `RUNS` - Run schedule management
    - `RECORDS` - Leaderboard, ranking and personal record.
    - `HELP` - AI Chat
    - `SETTINGS`
  - **HYPE** (hype.hk)
    - `MAPS`
    - `FILTERS`
    - `RUNS`
    - `SETTINGS`
  - On HYPE, the `RUNS` view links to the `RECORDS` and `HELP` views.

![[Breadline v4 2025-10-19 00.30.56.excalidraw|center|1400]]

- [domain::views]: [priority::5] **Runs** offers the ability for users to
  - See what runs they have coming up, grouped by day with _today_ highlighted.
    - These runs can be reordered so that they are arranged in the order that the user wishes to visit them. This is useful because
    - We will show the estimated time / distance / travel method between 2 bakeries, and finally
    - Show the estimated time / distance / travel method to the drop-off point.
    - **!!** `schema:extend` store the rank-order on the day alongside the user in `userAttendance`
    - **!!** `schema:extend` we need to calculate and store the time / distance / travel method between each feature so that we can show an estimate for how much time they would need between bakeries.
    - **!!** `schema:extend` Should we allow users to customise their preferred mode of transport? E.g. Only Walk, Cycling, MTR+Walk, Car+Walk
    - **??** Do you think it's a good idea to design around images of these shops? Would that be a helpful addition?
      - YES - please
  - Remove any bakeries from their runs
  - Change the drop-off point
  - In addition to the info they are currently showing, there's also a quick-link to route to that bakery / drop-off point.

![[Breadline v4 2025-10-19 00.32.26.excalidraw|center|400]]

- [domain::views]: [priority::5] **Records** offers the ability for users to see
  - Their total contribution (bread saved + runs) - **??** Would you like to have a new metric 'Distance' which tracks the (optimal) route from pick-up points to drop-off points? - YES (time-based and distance) – thinking volunteering hours and elderly health benefits.
  - Badges (5x Most Collected / Day, 2x Most Runs / Month, 1x Most collected / year ) - **??** What other badges would you like to add? - TO DISCUSS - **!!** `schema:extend` to store the badges - We can calculate this based on the existing records and get everyone badges for their efforts 🥳
  - The history of their own runs (similar to current)
  - See the leader-boards, which show rankings for runs and collected bread:
    - Current
      - Today
      - Month
      - Years
    - Past Period, i.e. for a specific
      - Day
      - Month
      - Year
    - All non-zero scoring users (listed by their usernames) are featured with their score and ranking.
       ![[Breadline v4 2025-10-19 00.32.48.excalidraw|center]]
- [domain::views]: [priority::5] **Help** offers the ability to
  - Chat with an AI which
    - Answers any breadline-related questions.
    - Will be trained on how Breadline operates.
    - Uses RAG to store and retrieve our knowledge base.
    - Can fit within the educational-tier of [dify.ai](https://dify.ai)
    - The relevant knowledge base sections are then passed to an LLM API for a proper response.
    - The AI Chatbot supports English, written Cantonese and Mandarin.
    - Since LLMs for this task are highly commoditised, we should be able to use Google's free tier for Gemini.
    - `external` Describe all the practices, and background knowledge about breadline.
  - Chat with the _WhatsApp Role_ during operating hours.
    - The `admin` can select / schedule any user with the `Support` role to become the point of contact.
      - **??** Is this functionality desirable? What does the scheduling look like?
      - **!!** `schema:extend` to track the whatsApp role on a date to a user.
    - Chat's are handed over to the user's WhatsApp app installed on their phone or computer.

![[Breadline v4 2025-10-19 00.33.33.excalidraw|center|800]]

- [domain::views]: [priority::5] **Settings** offers the ability to
  - Set
    - Language preference
    - Username (used in leaderboards)
    - Phone number
    - Attribution (how to be credit for contributions (e.g. photos))
    - App-specific preferences (currently none, but we might add power-user features that are gated behind a toggle)
  - Read help section related to settings.
  - Sign Out

![[Breadline v4 2025-10-19 01.38.39.excalidraw|1400|center]]

- [domain::views]: [priority::5] **Add Runs** will be revamped and simplified
  - **On Load** - the default state of the app when the map is loaded shows the nearest upcoming date which has runs available:
    - It offers
      - the date picker
      - the pick-up times slider
      - an "Add Runs" icon in the bottom left corner to trigger the add runs flow
    - The purpose of this view is to allow users to browse around the map in a non-committal way.
  - Instead of it being a multi-step process, the "Add Runs" view provides the user with sensible feedback and controls to successfully complete their scheduling, and recover from mistakes if any:
    - **Date Picker** - specifies the date AND contextualises how many days from now this is, to help people who don't keep track of dates.
    - **Pick up Range Slider** - filters the markers available on the map with overlapping pickup windows.
    - **No. Points Selected** - a counter widget which increments each time a run is added.
      - Tapping the widget slides down the schedule panel:
      - This indicator turns red in case the number and distance between the selected shops makes it unlikely the user can pick up from all these shops.
        - In advanced settings, the user can turn off the warnings (for visually impaired group leads)
    - **Bakery Cards** - Donor detail cards which
      - Feature:
        - Name
        - Address
        - Phone number
        - Nearest MTR Station & Exit
        - Pick up window start / end
        - Available Amount
          - If no Info, a recency-biased average collected amount is used, where every recent month is twice as important as the values from the month prior to it, only the most recent 3 months are considered.
          - Translate this to High / Med / Low yield colour scheme.
        - Button to _Claim the shop_ - if already claimed by the user, the button becomes an "Unclaim" button.
          - Claiming the shop gives the marker a different outer-ring style to indicate they have claimed it.
    - **Schedule panel** - a toggle view of the selected run schedule which
      - Is hidden by default.
      - Auto-sorts the shops based on :
        - Pick up window, opens earlier comes first
        - Proximity to the user
      - Allows the user to order the shops, because it
      - Show the user the estimated travel time / distance between the shops
      - Allows user to specify their mode of transport (default to MTR + walk)
      - Shows how the pick-up windows are stacked.
      - Warns if the user is expected to have difficulties reaching shops in time.
      - Allows users to remove the cards (X or swipe-out), after confirming their action.
      - Shows the drop-off point as the last card in the schedule.
      - `??` This would be the perfect point to nudge users to add more nearby shops into their schedule, by telling them how much time / travel distance it would cost vs how much bread is typically available at these shops.
        - We would only suggest shops that fit in the pick-up window.
        - `priority::3` YES let's do this.
      - Auto-selects the drop-off point based on :
        - User's previous selection
        - Proximity to the last pick-up shop
        - Proximity to the user
      - The user can opt for another drop-off point (show hints for where the other drop-off point is without the user needing to click it first)
      - A "Confirm Runs" button, at the bottom right, registers the user's claims with the server and redirects the user to their runs view.
        - **??** This would be a good place to prompt the user to do more – i.e. after they've made their initial selection and are ready to confirm. Would it be helpful to have different poking levels:
          - YES – Let's do this.
          - Prompt to do more - Very Low man-power night
          - Prompt to do more, if they are under average - Low man-power night
          - Prompt regulars to do more, if they are under average - Regular manpower night
          - Prompt to do more, if there are bakeries nearby - Well-staffed night
          - Prompt to do more, if there are bakeries nearby and they are under average - Very Well-staffed night
        - We could have levels of signups / claims to automatically determine the level..
        - Or we could have the 'Shift Manager' set this in the "Team View". and the behaviour would then only poke users when necessary.
        - **!!** `schema:extend` This would need to be reflected in the data schema.
      - **!!** `schema:extend` to track the whatsApp role on a date to a user.
        - most runners on average pick up X amount of bread this day … could you do more?
      - A "Add More" button, at the bottom left, collapses the panel, and allows users to first add more
    - **Review Plan** Button which also toggles the schedule panel.

![[Breadline v4 2025-10-19 01.41.24.excalidraw|center|400]]

- [domain::views]: [priority::5] **Add Nearby Bakeries** view will be removed

![[Breadline v4 2025-10-19 01.44.03.excalidraw|center|1800]]

- [domain::views]: [priority::5] **Run Flow** offers the ability to tap into a particular shop's pick-up event, and then:
  - **Show a badge** – Generates a badge which
    - Shows the:
      - Breadline Logo
      - Name of the shop
      - Date
      - Name of the Volunteer
    - This button is only available during the run window.
    - `??` Would it be a good idea to add a QR code which would have the details (incl. breadline process) in cantonese? so if there is any issue, they can just scan the QR code to get the exlainer?
      - LATER
  - **Enter the Amount** - the confirm button which
    - validated the input is non-negative number
    - shows the user a success state and then redirected to the runs view.
  - [domain::forms]: [priority::3] **Report** allow users to report
    - **Changes** :
      - Opening Hours
      - Collection Window
      - (Temporary) Closure
    - **Issues** - report issues with the bakery e.g.
      - Refused to hand over the bread
      - Closed the shops before the end of the pickup window
      - Uncontactable

![[Breadline v4 2025-10-19 14.44.09.excalidraw|1400|center]]

- [domain::views]: [priority::3] **Donor App** will be removed.
  - The following routes are retired:
    - ~~`/donors`~~
    - ~~`/donors/auth`~~
    - ~~`/donors/welcome`~~
    - ~~`/donors/estimation`~~

![[Breadline v4 2025-10-19 14.48.24.excalidraw|center|1400]]

- [domain::views]: [priority::3] **NGO App** will be removed.
  - The following routes are retired:
    - ~~`/ngo`~~
    - ~~`/ngo/runs`~~
    - ~~`/ngo/drop-offs`~~
    - ~~`/ngo/volunteers`~~
    - ~~`/ngos`~~

![[Breadline v4 2025-10-19 15.12.07.excalidraw|center|1400]]

- [domain::views]: [priority::5] **Support Dashboard** will be have new functionality which is accessible depending on the `role` a user is assigned:
  - **Team**
    - This view is available to anybody with the `project::maintainer` role at breadline.hk/dash/team
    - It's purpose is to assign roles (`WhatsApp` contact, `shopCaller`s) that are only "active" that day - the drop-off managers, `project::support`, always have access to the drop-off dash, and project admins `project::maintainer` always have access to all the dash views.
    - It allows the user to select a date, defaults to today, then
      - ONE user can be selected for the WhatsApp contact – that persons's phone number would be used in support Chats that day which are directed to WA.
      - MANY users can be selected to form the donor calling team.
    - We should show the average number of shops users are expected to call, update as users are added / removed.
    - **!!** `schema:extend` to track the daily role assignments.
  - **Volunteers**
    - This view is available to anybody with the `project::maintainer`, `project::member` or `project::support` role at breadline.hk/dash/volunteers
    - It allows the user to select a date, defaults to today - if NO date is selected, effectively ALL volunteers are shown.
    - The (default) result is a list of volunteer users who have claimed runs that day. We show:
      - Full Name
      - Username
      - Email address
      - Phone number
      - Sign up date
      - "Last Ran on" date
      - Today's Participation State : Unconfirmed / Prompted / Confirmed / ResultShared - hidden if no date is selected.
      - Roles - if more than just `project::volunteer`.
      - We flag users for whom it is their first time running.
      - We flag users whom are 'new', i.e. signed up in the last week.
    - The view can be sorted by `Name` or `signUpDate`
    - The view can be filtered by
      - A search bar, by queries matching name, email address or phone number.
      - Today's Participation State : Unconfirmed / Prompted / Confirmed / ResultShared.
    - Tapping into a volunteer leads to an editable form where we can update - this is only available to `project::member` or higher.
      - Full Name
      - Username
      - Phone number
      - Roles: `project::support`, `project::member`, `project::maintainer`
    - If a volunteer still has the Unconfirmed state, a button can be clicked to send the user a link to verify their participation:
      - Tapping this button opens a link of the form in a new tab:
        - `https://api.whatsapp.com/send?phone=85291491764&text=Please%20confirm%20you%27re%20running%20for%20Breadline%20tonight%20by%20clicking%20https%3A%2F%2Fbreadline.hk%2Fvolunteers%2F20270131%2Ftijptjik` which consists of
          - https://api.whatsapp.com/send? - WhatsApp API
          - phone=85291491764 - the User's phone number
          - text=Please confirm you're running for Breadline tonight by clicking https://breadline.hk/dash/confirmAttendance/20270131/tijptjik
            - https://breadline.hk/ - Breadline APP
            - `dash/confirmAttendance` - Attendance confirmation view, on load it confirms the user's attendance
            - `20270131` - Date of the Events (pickup runs).
            - `tijptjik` - Username (we generate default usernames)
        - The view also allows the user to cancel their participation, with a "Cancel Runs" button, but there will be a warning about the implications of doing so.
        - There's a link to the user's runs, so they can properly manage their runs if they wish to do so.
        - Upon confirmation, the user's status for that day is updated to 'confirmed' and thus the support team would no longer need to call them. If the user cancels the runs, all the pickup events are released into the available pool.
        - Support team would send out these links around 14:00 (?) and sadly this needs to be done manually as the WhatsApp app needs to send the messages 1 by 1. But this should reduce the amount of work in calling them and tracking the progress.
        - After some lead time (30 min?) support team could filter the list for 'Prompted' users and call them to manually confirm their attendance.
      - **??** Does this meet the design goal "way for users to confirm their presence for the night, otherwise Runs would be automatically deleted: whips spend most of their time checking on the day that runners are actually coming" - perhaps it's worth testing out and seeing how much it reduces the team's work. Other options are Push Notifications (but users need to opt-in).. or emails, which could be fully automated, but might be ignored by many users.
    - If a volunteer does NOT have a `ResultShared` status, there is a button which can send the user the results once all the runs have been dropped off for that day
      - The button only becomes available once ALL volunteers for that day are either marked as having attended the "drop-off event" (`eventAttendance.hasAttended=true`) OR marked as having abandoned the drop-off event (`eventAttendance.hasAttended=false`)
      - The message would be pre-populated with the results for the day, featuring:
        - the amount of bread saved,
        - number of shops collected from, and
        - number of volunteers participated.
        - The leaderboard with the top-10 volunteer results of the day.
        - The volunteer who is addressed in the message is bolded in the result list. If they did not make the top 10, we show their ranking, at the bottom of the list with a `…` on the previous row to indicate the gap with the top of the leaderboard.
      - WhatsApp message example (Old vs New): ![[Breadline v4 2025-10-19 18.31.02.excalidraw|center|800]]
      - Example text:

        🅁🄴🅂🅄🄻🅃🅂 18 ᴏᴄᴛᴏʙᴇʀ 2025

        🍞 : `123` Saved
        🏪 : `34` Shops
        🏃‍♀️ : `12` Runners

        🄻🄴🄰🄳🄴🅁🄱🄾🄰🅁🄳

        Bread Collected
        1. Daisy -----–-- 🍞 24
        2. _Claudio_ ------ 🍞 20
        3. Tijptjik ----- 🍞 19

        Runs Completed 4. Daisy -------- 🏪 4 5. _Claudio_ ------ 🏪 3 6. Tijptjik ----- 🏪 3

      - Once the button is clicked, the user is considered as having had the results shared, so their status is updated to `resultShared`, completing the life-cycle of a volunteer's participation that day.
    - **!!** `schema:extend` to track the daily participation status of volunteers.
  - **Runs**
    - This view is available to anybody with the `project::maintainer`, `project::member` and `project::support` role at breadline.hk/dash/runs
    - It allows the user to select a date, defaults to today.
    - This result in a list of runs (i.e. `pick-up events`) which are available on that day (including the Peninsula, so including pickup `Event`s from `Feature`s which are `isPublished==False` )
      - Donor name
      - Claimed by : User's Full Name (tapping them directs to volunteer's detail page)
      - Phone number (with quick-link to call them)
      - Pick up window start & end time
      - State : No Info / Available Amount / Collected Amount
    - There is a search bar to filter the list by queries matching bakery name, claimed user's name, or phone number.
    - There is functionality to perform the following actions:
      - Remove a user's claim on a run – i.e. delete the `eventAttendance` for a `User` and `Event`) to put it back into the pool.
      - Assign a user to a run - i.e. from all the `Users` with `volunteer` roles, allow `eventAttendance` association (this cater's to the Peninsula use case).
      - Update a bakery's `availableAmount` - or reset it.
      - Update a user's `collectedAmount` - or reset it.
    - There are filters to filter the list by:
      - Public / Private (whether a run is publicised, i.e. the Peninsula is privately managed)
    - ~~Ability to export a CSV with all the bakeries donating today with their:~~
      - ~~Name~~
      - ~~Address~~
      - ~~Phone number (with quicklink to call them)~~
      - ~~Closing time~~
      - ~~Window Start & End time~~
      - **??** ~~Is this really not something that could be wrapped into the app? The "manager" of that day, selects the users whom they want to assist in making the calls. Those users can then go to breadline.hk/dash/runs and have a list of all the bakeries that day filtered (by default) for the ones that are assigned to them. Then there's tappable phone numbers to call them, and a field to select the expected amount. This would be available to users with the `project::support` role.~~
  - **Drop-offs**
    - This view is available to anybody with the `project::maintainer`, `project::member` or `project::support` role at breadline.hk/dash/dropoffs
    - It allows the user to select a date (defaulting to today) and, subsequently, an associated drop-off event.
    - The result is a list of volunteers (users with `volunteer` role) which have selected that drop-off point for their runs that day (i.e. `eventAttendance` is linking `User` with `Event`). We show:
      - Full Name
      - Phone number (with quick-links to call them / WhatsApp them)
      - Amount Collected
        - Currently the system relies on the estimated amount.
        - We should prompt the manager if the user has UNCONFIRMED collectedAmount.
        - They should prompt the user to enter the amount before signing them off.
        - If they don't have their collectedAmount entered – they should not marked for attended.
        - If the user has no battery left, the dropoff manager can use the runs view to set the collected Amount.
      - Last Pick-up time / location.
      - Expected arrival time (calculated based on the travel time from the last PickUp location to the dropOff point)
      - We flag the user for whom it is their first time running.
    - The view can be sorted by `Name`, or `Expected Arrival Time`
    - The view can be filtered by state (All / checked-in / not checked-in / Abandoned) for a focused list.
    - The view offers the functionality to:
      - Update the users 'eventAttendance.hasAttended' status – from unconfirmed ('null') to confirmed seen ('true') or confirmed to no longer be coming ('false')
      - **??** Do they need to ability to update the drop-off amount? And if so how should this be distributed / accounted for on the donor side as we currently treat `collectedAmount` == `droppedAmount` IIUC.

TODO : split the `support` into 2 roles : `supportManager` and `support`` the latter only has access to `runs` to confirm the estimated amount

## Annual Report

- [domain::map] : [priority::2] To promote breadlines work / as an artefact to publish alongside the annual report, we could show off the activity of the volunteers by overlaying the map with an animation of a years worth of runs - see [deck.gl](https://deck.gl/examples/maplibre) for a demo. Each trace would represent a volunteer, and we would show how they hit each shop (we'll use order in which they reported the quantity), and the last stop would be the collection point. As they gain more buns, their colour intensifies. We'd stich together the periods during which we are collecting, so that there are no extended gaps, but there is a natural cadence as there is little activity at 18:00 and 20:00. I'll experiment with using bun icons (flying BLB?) to see if we can make this worth going viral :)
- If you like this idea, we could feature it on the landing page too to _show_ our work.

![[Pasted image 20251018212547.png|1200]]

## Wishlist

- [-] Reporting link? E.g. [completion:: 2025-10-19]
  - [-] potential bakeries to contact (tapping into our volunteer network’s intelligence) [completion:: 2025-10-19]
  - [-] to report missing/ change of info [completion:: 2025-10-19]
- [x] User prompt - most runners on average pick up X amount of bread this day … could you do more? [completion:: 2025-10-19]
- [x] Show bakery track record (volume) (whether its a high/ med/ low yield shop) [completion:: 2025-10-19]
- [x] Include Volunteer Badge within the App (maybe a user-specific dynamically generated badge?) [completion:: 2025-10-19]
- [-] Potentially Make Front-end so that it would be at the same time a Web App but also an Android and iPhone App [completion:: 2025-10-19]
- [x] Add a STATS section for the latest day of joining in each Runner account (we do this manually now) [completion:: 2025-10-19]
- [x] Shop pick up time should be expressed as periods instead of fixed time [completion:: 2025-10-19]
- [x] Remove present “Run Suggestion” totally or replace it with something much smarter [completion:: 2025-10-19]
- [x] New map provider, OSM instead of Gmaps. It should also show the current location, since at the moment it’s quite hard to use it to find your way to the shop [completion:: 2025-10-19]
- [-] New Auth: is whatsapp auth possible? It’s our main communication channel. At least we should open it to non-Google email accounts? [completion:: 2025-10-19]
- [x] Design a way for users to confirm their presence for the night, otherwise Runs would be automatically deleted: whips spend most of their time checking on the day that runners are actually coming [completion:: 2025-10-19]
- [x] Update Roles: [completion:: 2025-10-19]
  - [x] Update Admin: [completion:: 2025-10-19]
    - [x] System to manage Peninsula. [completion:: 2025-10-19]
    - [x] remove runner inputs. [completion:: 2025-10-19]
    - [x] new functionality to be able to remove Runs, [completion:: 2025-10-19]
    - [x] update user names and contacts, [completion:: 2025-10-19]
  - [-] Donor (as is?) [completion:: 2025-10-19]
  - [-] Group/Leader (as is?) [completion:: 2025-10-19]
  - [x] Create a Support Team role (caller + DPMs): new functionality of ticking people off when arrived at dropoff and exporting excel lists for assigning calls [completion:: 2025-10-17]
  - [x] Delete NGOs [completion:: 2025-09-15]
- [x] Make the work and future software Open Source (source file on GitHub, no more GitLab since it does not operate in HK and it’s private mode only)
