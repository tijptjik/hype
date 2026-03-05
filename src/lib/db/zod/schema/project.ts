// I18N
import { m } from '$lib/i18n'
import { ProjectRoleType } from '$lib/enums'
import type {
  CapabilityDefinitions,
  CapabilityDefinition,
  ProjectCapabilityKey,
  ProjectRoleCapabilities,
} from '$lib/types'

// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema/index'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints'
import { FormBoolean } from '../form'
// ZOD SCHEMAS
import { UserBasic } from './user'
import {
  ProjectPropertyFormData,
  PropertyAPI,
  PropertyInsertAPI,
  PropertyUpdateAPI,
} from './property'
import { ImageContextEnvelopeAPI } from './image'
import { OrganisationI18nBase } from './organisation'
import { OrganisationBase } from './organisation'

/* ----------------- */
// PROJECT CAPABILITIES SCHEMA
/* -------- */

/**
 * Schema for role capabilities
 * @remarks
 * Defines fine-grained permissions for project roles
 * All keys are optional, defaulting to false
 */
export const ProjectRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: z.boolean().optional(),
    manageVolunteers: z.boolean().optional(),
    manageDropOffs: z.boolean().optional(),
  })
export const ProjectCapabilityLabelI18nSchema = z.object({
  en: z.string().optional(),
  zhHans: z.string().optional(),
  zhHant: z.string().optional(),
})

export const ProjectCapabilityDefinitionSchema: z.ZodType<CapabilityDefinition> =
  z.object({
    i18n: ProjectCapabilityLabelI18nSchema.optional(),
  })

export const ProjectCapabilityDefinitionsSchema: z.ZodType<CapabilityDefinitions> =
  z.record(z.custom<ProjectCapabilityKey>(), ProjectCapabilityDefinitionSchema)

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
// REMOTE FUNCTION REFACTOR
/* -------- */

export const ProjectI18nFormData = z.object({
  name: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_name() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  nameGen: FormBoolean.default(false),
  nameShort: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_short_name() }) })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  nameShortGen: FormBoolean.default(false),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  descriptionGen: FormBoolean.optional(),
  license: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_license() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  licenseGen: FormBoolean.optional(),
  attribution: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_attribution() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  attributionGen: FormBoolean.optional(),
})

export const ProjectRoleFormData = z.object({
  userId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_user() }) }),
  role: ProjectRoleBase.shape.role,
  capabilities: ProjectRoleCapabilitiesSchema.optional().default({}),
})

export const ProjectI18nByLocaleFormData = z.object({
  en: ProjectI18nFormData,
  zhHans: ProjectI18nFormData,
  zhHant: ProjectI18nFormData,
})

export const ProjectUserRolesFormData = z.array(ProjectRoleFormData)

const ProjectPropertiesFormData = z.array(ProjectPropertyFormData).optional()

export const ProjectEntityFormData = z.object({
  organisationId: z
    .string({ message: m.field_is_required({ field: m.field_organisation() }) })
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  code: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) })
    .min(2, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters(),
    }),
  i18n: ProjectI18nByLocaleFormData,
  capabilities: ProjectCapabilityDefinitionsSchema.optional(),
  userRoles: ProjectUserRolesFormData.optional(),
  properties: ProjectPropertiesFormData,
})

export const ProjectFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const ProjectFormData = z.object({
  meta: ProjectFormMeta.optional(),
  data: ProjectEntityFormData,
})

export const ProjectPreflightFormData = ProjectFormData

export const PublishProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveProjectSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

// Profiles

export const ProjectProfile = z.enum(['list', 'card', 'detail', 'admin'])

const ProjectListFields = ProjectBase.pick({
  id: true,
  organisationId: true,
  code: true,
  createdAt: true,
  modifiedAt: true,
})

const ProjectCardFields = ProjectBase.pick({
  isPublished: true,
  isArchived: true,
})

const ProjectDetailFields = ProjectCardFields

export const ProjectListProfileAPI = ProjectListFields.extend({
  i18n: getLocales(ProjectI18nBase),
})

export const ProjectCardProfileAPI = ProjectListProfileAPI.extend({
  ...ProjectCardFields.shape,
  image: ImageContextEnvelopeAPI.nullish(),
})

export const ProjectDetailProfileAPI = ProjectCardProfileAPI.extend({
  ...ProjectDetailFields.shape,
})
