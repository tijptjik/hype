// I18N
import { m } from '$lib/i18n'
import { ProjectRoleType } from '$lib/enums'
import type {
  CapabilityDefinitions,
  CapabilityDefinition,
  CapabilityKey,
} from '$lib/types'
import type { ProjectRoleCapabilities } from '../project.types'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema/index'
// CONSTRAINTS
import { FormI18nRoot, getDefaultConstraints, getLocales } from '../../constraints'
// ZOD SCHEMAS
import { UserBasic } from '../user'
import { PropertyAPI, PropertyInsertAPI, PropertyUpdateAPI } from './property'
import { ImageContextEnvelopeAPI } from '../image'
import { OrganisationI18nBase } from './organisation'
import { OrganisationBase } from './organisation'

/* ----------------- */
// PROJECT CAPABILITIES SCHEMA
/* -------- */

export const ProjectRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: z.boolean().optional(),
    manageVolunteers: z.boolean().optional(),
    manageDropOffs: z.boolean().optional(),
  })
export const ProjectCapabilityDefinitionSchema: z.ZodType<CapabilityDefinition> =
  z.object({
    i18n: FormI18nRoot.optional(),
  })

export const ProjectCapabilityDefinitionsSchema: z.ZodType<CapabilityDefinitions> =
  z.record(z.custom<CapabilityKey>(), ProjectCapabilityDefinitionSchema)

/* ----------------- */
// PROJECT CORE SCHEMAS
/* -------- */

export const ProjectBase = createSelectSchema(project).extend({
  capabilities: ProjectCapabilityDefinitionsSchema.optional().default({}),
})
export const ProjectInsert = createInsertSchema(project).extend({
  ...getDefaultConstraints(project),
  code: z.string().min(1, { message: m.admin__validation_short_name_lte_32_chars() }),
  capabilities: ProjectCapabilityDefinitionsSchema.optional().default({}),
})
export const ProjectUpdate = createUpdateSchema(project).extend({
  ...getDefaultConstraints(project),
  capabilities: ProjectCapabilityDefinitionsSchema.optional(),
})

/* ----------------- */
// PROJECT RELATIONAL SCHEMAS
/* -------- */

export const ProjectI18nBase = createSelectSchema(projectI18n)
export const ProjectI18nInsert = createInsertSchema(projectI18n)
  .extend({
    ...getDefaultConstraints(projectI18n),
  })
  .omit({
    projectId: true,
  })
export const ProjectI18nUpdate = createUpdateSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n),
})

export const ProjectI18nAPI = ProjectI18nBase

export const ProjectRoleBase = createSelectSchema(projectRole)
export const ProjectRoleBaseExtra = ProjectRoleBase.extend({
  i18n: z.array(ProjectI18nBase).nullish(),
  user: UserBasic,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})
export const ProjectRoleInsert = createInsertSchema(projectRole).omit({
  projectId: true,
})
export const ProjectRoleInsertExtra = ProjectRoleInsert.extend({
  role: z.nativeEnum(ProjectRoleType),
  user: UserBasic,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})
export const ProjectRoleUpdate = createUpdateSchema(projectRole)
export const ProjectRoleUpdateExtra = ProjectRoleUpdate.extend({
  role: z.nativeEnum(ProjectRoleType),
  user: UserBasic,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

export const ProjectRoleAPI = ProjectRoleBase.extend({
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
  project: ProjectBase.extend({
    i18n: getLocales(ProjectI18nBase),
    organisation: OrganisationBase.extend({
      i18n: getLocales(OrganisationI18nBase),
    }),
  }),
})

export const ProjectRoleWithUser = ProjectRoleBase.extend({
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
  user: UserBasic.nullish(),
})

/* ----------------- */
// PROJECT API SCHEMAS
/* -------- */

export const ProjectCollectionAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  image: ImageContextEnvelopeAPI.nullish(),
})

export const ProjectAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  userRoles: z.array(ProjectRoleBaseExtra).default([]),
  properties: z.array(PropertyAPI).nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
})

export const ProjectInsertAPI = ProjectInsert.extend({
  i18n: getLocales(ProjectI18nInsert),
  userRoles: z.array(ProjectRoleInsertExtra).default([]),
  properties: z.array(PropertyInsertAPI).nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
})

export const ProjectUpdateAPI = ProjectUpdate.extend({
  i18n: getLocales(ProjectI18nUpdate),
  userRoles: z.array(ProjectRoleUpdateExtra).default([]),
  properties: z.array(PropertyUpdateAPI).nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  publisher: UserBasic.nullish(),
})

/* ----------------- */
// PROJECT INTERMEDIATE SCHEMAS
/* -------- */

export const ProjectRaw = ProjectBase.extend({
  i18n: z.array(ProjectI18nBase).nullish(),
  userRoles: z.array(ProjectRoleBaseExtra).nullish(),
  properties: z.array(PropertyAPI).nullish(),
  image: z.unknown().nullish(),
  publisher: UserBasic.nullish(),
})
