// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import { hub, organisation, organisationI18n, image } from '$lib/db/schema';
// ZOD SCHEMAS
import { getDefaultConstraints } from '../constraints';
import { getLocales } from '../constraints';
import { ImageBasic } from './image';

/* ----------------- */
// HUB CORE SCHEMAS
/* -------- */

export const HubBase = createSelectSchema(hub);
export const HubBasic = HubBase.pick({
  id: true,
  code: true,
  domain: true,
  isArchived: true
} as const);

export const HubInsert = createInsertSchema(hub).extend({
  ...getDefaultConstraints(hub)
});
export const HubUpdate = createUpdateSchema(hub).extend({
  ...getDefaultConstraints(hub)
});

/* ----------------- */
// HUB API
/* -------- */

export const HubCollectionAPI = HubBase.extend({
  organisations: z.array(
    createSelectSchema(organisation).extend({
      i18n: getLocales(createSelectSchema(organisationI18n)),
      image: ImageBasic.nullish()
    })
  ).nullish()
});

export const HubAPI = HubCollectionAPI;

export const HubInsertAPI = HubInsert;

export const HubUpdateAPI = HubUpdate.extend({
  organisations: z.array(
    createSelectSchema(organisation).extend({
      i18n: getLocales(createSelectSchema(organisationI18n)),
      image: ImageBasic.nullish(),
      hubId: z.string().nullish(),
      isCoreInclusive: z.boolean().optional(),
      isHubExclusive : z.boolean().optional()
    })
  ).optional()
});

/* ----------------- */
// HUB RAW SCHEMAS
/* -------- */

export const HubRaw = HubBase.extend({
  organisations: z.array(
    createSelectSchema(organisation).extend({
      i18n: z.array(createSelectSchema(organisationI18n)),
      image: ImageBasic.nullish(),
      isCoreInclusive: z.boolean().nullish()
    })
  ).nullish()
});
