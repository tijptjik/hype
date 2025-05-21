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
import { UserPrivacyPreserving } from './user';

/* ----------------- */
// ORGANISATION CORE SCHEMAS
/* -------- */

export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationInsert = createInsertSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
  // TODO - Why is this here? Check if this can be deleted.
  id: z.string().optional()
});
export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
});

/* ----------------- */
// ORGANISATION RELATIONAL SCHEMAS
/* -------- */

export const OrganisationI18nBase = createSelectSchema(organisationI18n);
export const OrganisationI18nInsert = createInsertSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n)
});
export const OrganisationI18nUpdate = createUpdateSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n)
});

export const OrganisationRoleBase = createSelectSchema(organisationRole);
export const OrganisationRoleBaseExtra = OrganisationRoleBase.extend({
  user: UserPrivacyPreserving
});
export const OrganisationRoleInsert = createInsertSchema(organisationRole);
export const OrganisationRoleInsertExtra = OrganisationRoleInsert.extend({
  user: UserPrivacyPreserving
});
export const OrganisationRoleUpdate = createUpdateSchema(organisationRole);
export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserPrivacyPreserving
});


/* ----------------- */
// ORGANISATION API SCHEMAS
/* -------- */

export const OrganisationAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  userRoles: getUserRoles(OrganisationRoleBaseExtra)
});

export const OrganisationInsertAPI = OrganisationInsert.extend({
  i18n: getLocales(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsertExtra)
});

export const OrganisationUpdateAPI = OrganisationUpdate.extend({
  i18n: getLocales(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra)
});

// TODO Remove once we've migrated to the new schemas

/* ----------------- */
// DEPRECATED ORGANISATION SCHEMAS
/* -------- */

// ORGANISATION UTILS

// ORGANISATION SCHEMAS

// Schema for selecting an organisation - can be used to validate API responses
// export const OrganisationBase = createSelectSchema(organisation);
// export const OrganisationI18nBase = createSelectSchema(organisationI18n);
// export const OrganisationRoleBase = createSelectSchema(organisationRole);

// // Base schema to validate submit data
// export const OrganisationInsert = createInsertSchema(organisation).extend({
//   ...getDefaultConstraints(organisation),
//   id: z.string().optional()
// });

// export const OrganisationPatch = OrganisationInsert.extend({
//   id: z.string()
// });
// export const OrganisationI18nUpdate = createInsertSchema(organisationI18n).extend({
//   ...getDefaultConstraints(organisationI18n)
// });
// export const OrganisationRoleUpdate = createInsertSchema(organisationRole);
// export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
//   user: UserPrivacyPreserving
// });

// export const OrganisationI18nInsert = OrganisationI18nUpdate.omit({
//   organisationId: true
// });
// export const OrganisationRoleInsert = OrganisationRoleUpdateExtra.omit({
//   organisationId: true
// });

// export const OrganisationInsertAPI = OrganisationInsert.extend({
//   i18n: getLocales(OrganisationI18nInsert),
//   userRoles: getUserRoles(OrganisationRoleInsert)
// });

// export const OrganisationUpdateAPI = OrganisationPatch.extend({
//   i18n: getLocales(OrganisationI18nUpdate),
//   userRoles: getUserRoles(OrganisationRoleUpdateExtra)
// });

// export const OrganisationPatch = OrganisationPatch.partial();
