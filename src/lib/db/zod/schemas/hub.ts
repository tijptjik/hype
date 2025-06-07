// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import { hub, organisation, organisationI18n } from '$lib/db/schema';
// ZOD SCHEMAS
import { getDefaultConstraints } from '../constraints';
import { getLocales } from '../constraints';

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

export const HubCollectionAPI = HubBase;

export const HubAPI = HubBase.extend({
  organisation: createSelectSchema(organisation).extend({
    i18n: getLocales(createSelectSchema(organisationI18n))
  })
});

export const HubInsertAPI = HubInsert;

export const HubUpdateAPI = HubUpdate;

/* ----------------- */
// HUB RAW SCHEMAS
/* -------- */

export const HubRaw = HubBase;
