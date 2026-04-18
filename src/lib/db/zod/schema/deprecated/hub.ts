// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  hub,
  hubI18n,
  hubRole,
  organisation,
  organisationI18n,
} from '$lib/db/schema/index'
// ZOD SCHEMAS
import { getDefaultConstraints, getLocales } from '../../constraints'
import { UserBasic } from '../user'
import { ImageContextEnvelopeAPI } from '../image'

/* ----------------- */
// HUB CORE SCHEMAS
/* -------- */

export const HubBase = createSelectSchema(hub)

export const HubBasic = HubBase.pick({
  id: true,
  code: true,
  domain: true,
  isArchived: true,
} as const)

export const HubInsert = createInsertSchema(hub).extend({
  ...getDefaultConstraints(hub),
})

export const HubUpdate = createUpdateSchema(hub).extend({
  ...getDefaultConstraints(hub),
})

/* ----------------- */
// HUB RELATIONAL SCHEMAS
/* -------- */

export const HubI18nBase = createSelectSchema(hubI18n)
export const HubI18nInsert = createInsertSchema(hubI18n)
  .extend({
    ...getDefaultConstraints(hubI18n),
  })
  .omit({
    hubId: true,
  })
export const HubI18nUpdate = createUpdateSchema(hubI18n).extend({
  ...getDefaultConstraints(hubI18n),
})

export const HubRoleBase = createSelectSchema(hubRole)
export const HubRoleWithUser = HubRoleBase.extend({
  user: UserBasic,
})
export const HubRoleInsert = createInsertSchema(hubRole)
export const HubRoleInsertExtra = HubRoleInsert.extend({
  user: UserBasic,
}).omit({
  hubId: true,
})
export const HubRoleUpdate = createUpdateSchema(hubRole)
export const HubRoleUpdateExtra = HubRoleUpdate.extend({
  user: UserBasic,
})

const HubOrganisationBase = createSelectSchema(organisation)
export const HubOrganisationWithI18n = HubOrganisationBase.extend({
  i18n: getLocales(createSelectSchema(organisationI18n)),
  image: ImageContextEnvelopeAPI.nullish(),
})

/* ----------------- */
// HUB API
/* -------- */

export const HubCollectionAPI = HubBase.extend({
  i18n: getLocales(HubI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
})

export const HubAPI = HubCollectionAPI.extend({
  userRoles: z.array(HubRoleWithUser),
  organisations: z.array(HubOrganisationWithI18n),
})

export const HubInsertAPI = HubInsert.extend({
  i18n: getLocales(HubI18nInsert),
  userRoles: z.array(HubRoleInsertExtra).optional(),
  organisations: z
    .array(
      z.object({
        organisationId: z.string().min(1),
        isCoreInclusive: z.boolean(),
        isHubExclusive: z.boolean(),
      }),
    )
    .optional(),
})

export const HubUpdateAPI = HubUpdate.extend({
  i18n: getLocales(HubI18nUpdate),
  userRoles: z.array(HubRoleUpdateExtra).optional(),
  organisations: z
    .array(
      z.object({
        organisationId: z.string().min(1),
        isCoreInclusive: z.boolean(),
        isHubExclusive: z.boolean(),
      }),
    )
    .optional(),
})

/* ----------------- */
// HUB RAW SCHEMAS
/* -------- */

export const HubRaw = HubBase.extend({
  i18n: z.array(HubI18nBase).nullish(),
  image: z.unknown().nullish(),
  userRoles: z.array(HubRoleWithUser).nullish(),
  organisations: z.array(HubOrganisationWithI18n).nullish(),
})
