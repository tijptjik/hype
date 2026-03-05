// I18N
import { m } from '$lib/i18n'
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
  CapabilityKey,
} from '$lib/types'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { organisation, organisationI18n, organisationRole } from '$lib/db/schema/index'
// ZOD SCHEMAS
import {
  FormI18nRoot,
  getDefaultConstraints,
  getLocales,
  getUserRoles,
} from '../../constraints'
import { UserBasic } from '../user'
import { ImageBase, ImageContextEnvelopeAPI } from '../image'
import { HubBasic } from './hub'

export const OrganisationCapabilityDefinitionSchema: z.ZodType<CapabilityDefinition> =
  z.object({
    i18n: FormI18nRoot.optional(),
  })

export const OrganisationCapabilityDefinitionsSchema: z.ZodType<CapabilityDefinitions> =
  z.record(z.custom<CapabilityKey>(), OrganisationCapabilityDefinitionSchema)

/* ----------------- */
// ORGANISATION CORE SCHEMAS
/* -------- */

export const OrganisationBase = createSelectSchema(organisation).extend({
  capabilities: OrganisationCapabilityDefinitionsSchema.optional().default({}),
})
export const OrganisationInsert = createInsertSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
  code: z.string().min(2, { message: m.admin__validation_short_name_lte_32_chars() }),
  capabilities: OrganisationCapabilityDefinitionsSchema.optional().default({}),
})
export const OrganisationUpdate = createUpdateSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
  capabilities: OrganisationCapabilityDefinitionsSchema.optional(),
})

/* ----------------- */
// ORGANISATION RELATIONAL SCHEMAS
/* -------- */

export const OrganisationI18nBase = createSelectSchema(organisationI18n)
export const OrganisationI18nInsert = createInsertSchema(organisationI18n)
  .extend({
    ...getDefaultConstraints(organisationI18n),
  })
  .omit({
    organisationId: true,
  })
export const OrganisationI18nUpdate = createUpdateSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n),
})

export const OrganisationRoleBase = createSelectSchema(organisationRole)
export const OrganisationRoleWithUser = OrganisationRoleBase.extend({
  user: UserBasic,
})
export const OrganisationRoleInsert = createInsertSchema(organisationRole)
export const OrganisationRoleInsertExtra = OrganisationRoleInsert.extend({
  user: UserBasic,
}).omit({
  organisationId: true,
})
export const OrganisationRoleUpdate = createUpdateSchema(organisationRole)
export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserBasic,
})

export const OrganisationRoleAPI = OrganisationRoleBase.extend({
  organisation: OrganisationBase.extend({
    i18n: getLocales(OrganisationI18nBase),
  }),
})

/* ----------------- */
// ORGANISATION SUPERADMIN API (Full Access)
/* -------- */

export const OrganisationCollectionSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
  hub: HubBasic.nullish(),
})

export const OrganisationSuperAdminAPI = OrganisationBase.extend({
  i18n: getLocales(OrganisationI18nBase),
  userRoles: getUserRoles(OrganisationRoleWithUser),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
  hub: HubBasic.nullish(),
})

export const OrganisationInsertSuperAdminAPI = OrganisationInsert.extend({
  i18n: getLocales(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsertExtra),
})

export const OrganisationUpdateSuperAdminAPI = OrganisationUpdate.extend({
  i18n: getLocales(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra),
})

/* ----------------- */
// ORGANISATION API (Regular Users - Omit SuperAdmin Fields)
/* -------- */

export const OrganisationCollectionAPI = OrganisationCollectionSuperAdminAPI.omit({
  isCoreInclusive: true,
})

export const OrganisationAPI = OrganisationSuperAdminAPI.omit({
  isCoreInclusive: true,
})

export const OrganisationInsertAPI = OrganisationInsertSuperAdminAPI.omit({
  isCoreInclusive: true,
})

export const OrganisationUpdateAPI = OrganisationUpdateSuperAdminAPI.omit({
  isCoreInclusive: true,
})

/* ----------------- */
// ORGANISATION INTERMEDIATE SCHEMAS
/* -------- */

export const OrganisationRaw = OrganisationBase.extend({
  i18n: z.array(OrganisationI18nBase),
  userRoles: z.array(OrganisationRoleBase),
  image: ImageBase.nullish(),
})
