// I18N
import { m } from '$lib/i18n';
// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import { organisation, organisationI18n, organisationRole } from '$lib/db/schema/index';
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
  code : z.string().min(1, { message: m.admin__validation_short_name_lte_32_chars() }),
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
// ORGANISATION SUPERADMIN API (Full Access)
/* -------- */

export const OrganisationCollectionSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  image: ImageBasic.nullish(),
  hub: HubBasic.nullish()
});

export const OrganisationSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  userRoles: getUserRoles(OrganisationRoleWithUser),
  image: ImageBase.nullish(),
  publisher: UserBasic.nullish(),
  hub: HubBasic.nullish()
});

export const OrganisationInsertSuperAdminAPI = OrganisationInsert.extend({
  i18n: getLocales(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsertExtra)
});

export const OrganisationUpdateSuperAdminAPI = OrganisationUpdate.extend({
  i18n: getLocales(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra)
});

/* ----------------- */
// ORGANISATION API (Regular Users - Omit SuperAdmin Fields)
/* -------- */

export const OrganisationCollectionAPI = OrganisationCollectionSuperAdminAPI.omit({
  isCoreInclusive: true // Only SuperAdmins can see this field
});

export const OrganisationAPI = OrganisationSuperAdminAPI.omit({
  isCoreInclusive: true // Only SuperAdmins can see this field
});

export const OrganisationInsertAPI = OrganisationInsertSuperAdminAPI.omit({
  isCoreInclusive: true // Only SuperAdmins can set this field
});

export const OrganisationUpdateAPI = OrganisationUpdateSuperAdminAPI.omit({
  isCoreInclusive: true // Only SuperAdmins can update this field
});

/* ----------------- */
// ORGANISATION INTERMEDIATE SCHEMAS
/* -------- */

export const OrganisationRaw = OrganisationBase.extend({
  i18n: z.array(OrganisationI18nBase),
  userRoles: z.array(OrganisationRoleBase),
  image: ImageBase.nullish()
});