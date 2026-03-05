// I18N
import { m } from '$lib/i18n'
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
  ProjectCapabilityKey,
  ProjectRoleCapabilities,
} from '$lib/types'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { FormI18nRoot, getLocales } from '../constraints'
import { ProjectPropertyFormData } from './property'
import { ImageContextEnvelopeAPI } from './image'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CAPABILITY SCHEMAS
//    - CabilityDefinitionSchema
//    - CapabilityRoot
//    - ProjectRoleCapabilitiesSchema
//
// 2. BASE / RELATIONAL PRIMITIVES
//    - ProjectBase
//    - ProjectI18nBase
//    - ProjectRoleBase
//
// 3. REMOTE FORM SCHEMAS
//    - ProjectI18nFormData
//    - ProjectRoleFormData
//    - ProjectI18nByLocaleFormData
//    - ProjectUserRolesFormData
//    - ProjectEntityFormData
//    - ProjectFormMeta
//    - ProjectFormData
//    - ProjectPreflightFormData
//
// 4. REMOTE COMMAND SCHEMAS
//    - PublishProjectSchema
//    - RemoveProjectSchema
//
// 5. REMOTE PROFILE SCHEMAS
//    - ProjectProfile
//    - ProjectListProfileAPI
//    - ProjectCardProfileAPI
//    - ProjectDetailProfileAPI

// ═══════════════════════
// 1. CAPABILITY SCHEMAS
// ═══════════════════════

export const CabilityDefinitionSchema: z.ZodType<CapabilityDefinition> = z.object({
  i18n: FormI18nRoot.optional(),
})

export const CapabilityRoot: z.ZodType<CapabilityDefinitions> = z.record(
  z.custom<ProjectCapabilityKey>(),
  CabilityDefinitionSchema,
)

export const ProjectRoleCapabilitiesSchema: z.ZodType<ProjectRoleCapabilities> =
  z.object({
    manageBakeries: z.boolean().optional(),
    manageVolunteers: z.boolean().optional(),
    manageDropOffs: z.boolean().optional(),
  })

const CapabilityBase = CapabilityRoot.optional()

// ═══════════════════════
// 2. BASE / RELATIONAL PRIMITIVES
// ═══════════════════════

export const ProjectBase = createSelectSchema(project).extend({
  capabilities: CapabilityBase,
})

export const ProjectI18nBase = createSelectSchema(projectI18n)

export const ProjectRoleBase = createSelectSchema(projectRole)

// ═══════════════════════
// 3. REMOTE FORM SCHEMAS
// ═══════════════════════

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
  capabilities: CapabilityBase,
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

// ═══════════════════════
// 4. REMOTE COMMAND SCHEMAS
// ═══════════════════════

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

// ═══════════════════════
// 5. REMOTE PROFILE SCHEMAS
// ═══════════════════════

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
