// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import { organisation, organisationI18n, organisationRole } from '$lib/db/schema';
// ZOD SCHEMAS
import { getDefaultConstraints, getLocales, getUserRoles } from '../constraints';
import { UserBasic } from './user';
import { ImageBasic, ImageBase } from './image';
import { HubBasic } from './hub';

/* ----------------- */
// ORGANISATION CORE SCHEMAS
/* -------- */

export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationInsert = createInsertSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
});
export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  ...getDefaultConstraints(organisation)
});


/* ----------------- */
// ORGANISATION RELATIONAL SCHEMAS
/* -------- */

export const OrganisationI18nBase = createSelectSchema(organisationI18n);
export const OrganisationI18nInsert = createInsertSchema(organisationI18n)
  .extend({
    ...getDefaultConstraints(organisationI18n)
  })
  .omit({
    organisationId: true
  });
export const OrganisationI18nUpdate = createUpdateSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n)
});

export const OrganisationRoleBase = createSelectSchema(organisationRole);
export const OrganisationRoleWithUser = OrganisationRoleBase.extend({
  user: UserBasic
});
export const OrganisationRoleInsert = createInsertSchema(organisationRole);
export const OrganisationRoleInsertExtra = OrganisationRoleInsert.extend({
  user: UserBasic
}).omit({
  organisationId: true
});
export const OrganisationRoleUpdate = createUpdateSchema(organisationRole);
export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserBasic
});

export const OrganisationRoleAPI = OrganisationRoleBase.extend({
  organisation: OrganisationBase.extend({
    i18n: getLocales(OrganisationI18nBase)
  })
});



/* ----------------- */
// ORGANISATION API
/* -------- */

export const OrganisationCollectionAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  image: ImageBasic.nullish(),
  hub: HubBasic.nullish()
});

export const OrganisationAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  userRoles: getUserRoles(OrganisationRoleWithUser),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish(),
  hub: HubBasic.nullish()
});

export const OrganisationForHubAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
});

export const OrganisationInsertAPI = OrganisationInsert.extend({
  i18n: getLocales(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsertExtra)
});

export const OrganisationUpdateAPI = OrganisationUpdate.extend({
  i18n: getLocales(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra)
});

/* ----------------- */
// ORGANISATION INTERMEDIATE SCHEMAS
/* -------- */

export const OrganisationRaw = OrganisationBase.extend({
  i18n: z.array(OrganisationI18nBase),
  userRoles: z.array(OrganisationRoleBase)
});