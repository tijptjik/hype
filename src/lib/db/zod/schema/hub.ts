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
import { getDefaultConstraints } from '../constraints'
import { getLocales } from '../constraints'
import { ImageBasic } from './image'

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
export const HubRoleInsert = createInsertSchema(hubRole)
export const HubRoleUpdate = createUpdateSchema(hubRole)

/* ----------------- */
// HUB API
/* -------- */

export const HubCollectionAPI = HubBase.extend({
  i18n: getLocales(HubI18nBase),
  organisations: z
    .array(
      createSelectSchema(organisation).extend({
        i18n: getLocales(createSelectSchema(organisationI18n)),
        image: ImageBasic.nullish(),
      }),
    )
    .nullish(),
})

export const HubAPI = HubCollectionAPI

export const HubInsertAPI = HubInsert.extend({
  i18n: getLocales(HubI18nInsert),
})

export const HubUpdateAPI = HubUpdate.extend({
  i18n: getLocales(HubI18nUpdate),
  organisations: z
    .array(
      createSelectSchema(organisation).extend({
        i18n: getLocales(createSelectSchema(organisationI18n)),
        image: ImageBasic.nullish(),
        hubId: z.string().nullish(),
        isCoreInclusive: z.boolean().optional(),
        isHubExclusive: z.boolean().optional(),
      }),
    )
    .optional(),
})

/* ----------------- */
// HUB RAW SCHEMAS
/* -------- */

export const HubRaw = HubBase.extend({
  i18n: z.array(HubI18nBase).nullish(),
  organisations: z
    .array(
      createSelectSchema(organisation).extend({
        i18n: z.array(createSelectSchema(organisationI18n)).nullish(),
        image: ImageBasic.nullish(),
        isCoreInclusive: z.boolean().nullish(),
        // userRoles: z.array(createSelectSchema(organisationRole))
      }),
    )
    .nullish(),
})
