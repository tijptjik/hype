// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// ZOD SCHEMAS
import { FormBoolean } from '../form'
import { getLocales } from '../constraints'
import {
  ProjectRoleCapabilitiesSchema,
  ProjectCapabilityDefinitionsSchema,
  ProjectBase,
  ProjectI18nBase,
  ProjectRoleBase,
} from './deprecated/project'
import { ProjectPropertyFormData } from './property'
import { ImageContextEnvelopeAPI } from './image'

/* ----------------- */
// PROJECT REMOTE FORM SCHEMAS
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

/* ----------------- */
// PROJECT REMOTE PROFILE SCHEMAS
/* -------- */

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
