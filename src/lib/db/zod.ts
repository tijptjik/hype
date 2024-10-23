import { z } from 'zod';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import {
  user,
  organisation,
  organisationI18n,
  project,
  projectI18n,
  layer,
  layerI18n,
  feature,
  organisationRole,
  projectRole
} from '$lib/db/schema';
import type { GeometryObject } from 'geojson';
import type { GhostSignsFeatureProperties, AddressProperties } from '$lib/types';
import type { Table } from 'drizzle-orm';

const targetLangs = ['zh-hant', 'zh-hans'] as const;

/* ----------------- */
// CONSTRAINTS
/* -------- */

const constraints: Record<string, z.ZodType<any>> = {
  code: z
    .string()
    .min(1, { message: 'Code is required' })
    .max(24, { message: 'Code must be 24 characters or less' }),
  name: z
    .string()
    .min(1, { message: 'Name is required' })
    .max(124, { message: 'Name must be 124 characters or less' }),
  nameShort: z
    .string()
    .min(1, { message: 'Short Name is required' })
    .max(32, { message: 'Short Name must be 32 characters or less' }),
  description: z
    .string()
    .max(1024, { message: 'Description must be 1024 characters or less' })
    .optional(),
  url: z.string().url({ message: 'URL is invalid' }).optional()
};

const getDefaultConstraints = (table: Table) => {
  return Object.keys(table).reduce(
    (acc, key) => {
      if (key in constraints) {
        acc[key as keyof Table] = constraints[key as keyof typeof constraints];
      }
      return acc;
    },
    {} as Record<keyof typeof table, z.ZodType<any>>
  );
};

/* ----------------- */
// ZOD SCHEMAS
/* -------- */

/* ----------------- */
// USERS
/* -------- */

export const UserBase = createSelectSchema(user);
export const UserPrivacyPreserving = UserBase.omit({
  email: true,
  emailVerified: true,
  createdAt: true,
  modifiedAt: true
});

/* ----------------- */
// ORGANISATIONS
/* -------- */

// Schema for selecting an organisation - can be used to validate API responses
export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationI18nBase = createSelectSchema(organisationI18n);
export const OrganisationRoleBase = createSelectSchema(organisationRole);

// Base schema to validate submit data
export const OrganisationInsert = createInsertSchema(organisation, {
  ...getDefaultConstraints(organisation as Table)
});

export const OrganisationUpdate = createInsertSchema(organisation, {
  ...getDefaultConstraints(organisation as Table),
  id: z.string()
});

export const OrganisationI18nInsert = createInsertSchema(organisationI18n, {
  ...getDefaultConstraints(organisationI18n as Table)
});

export const OrganisationRoleInsert = createInsertSchema(organisationRole, {
  ...getDefaultConstraints(organisationRole as Table)
});

export const OrganisationRoleInsertWithAssociatedFields = z.object({
  ...OrganisationRoleInsert.shape,
  user: UserPrivacyPreserving
});

export const OrganisationI18nWithoutPK = OrganisationI18nInsert.omit({ lang: true });
export const OrganisationRoleWithoutPK = OrganisationRoleInsertWithAssociatedFields.omit({ userId: true });
export const OrganisationI18nAPI = OrganisationI18nWithoutPK.omit({ organisationId: true });
export const OrganisationRoleAPI = OrganisationRoleWithoutPK.omit({ organisationId: true });

export const OrganisationInsertAPI = z.object({
  ...OrganisationInsert.shape,
  translations: z.record(z.string(), OrganisationI18nAPI).default({
    'zh-hant': {},
    'zh-hans': {}
  }),
  userRoles: z.record(z.string(), OrganisationRoleAPI)
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 User')
    .refine(
      (schema) => Object.values(schema).some((user) => user.role === 'owner'),
      'Set at least 1 Owner'
    )
});

export const OrganisationUpdateAPI = z.object({
  ...OrganisationInsert.shape,
  translations: z.record(z.string(), OrganisationI18nWithoutPK).default({
    'zh-hant': {},
    'zh-hans': {}
  }),
  userRoles: z.record(z.string(), OrganisationRoleWithoutPK)
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 User')
    .refine(
      (schema) => Object.values(schema).some((user) => user.role === 'owner'),
      'Set at least 1 Owner'
    )
});

/* ----------------- */
// PROJECTS
/* -------- */

// Schema for selecting a project - can be used to validate API responses
export const ProjectBase = createSelectSchema(project);
export const ProjectI18nBase = createSelectSchema(projectI18n);
export const ProjectRoleBase = createSelectSchema(projectRole);

// Base schema to validate submit data
export const ProjectInsert = createInsertSchema(project, {
  ...getDefaultConstraints(project as Table)
});

export const ProjectUpdate = createInsertSchema(project, {
  ...getDefaultConstraints(project as Table),
  id: z.string()
});

export const ProjectI18nInsert = createInsertSchema(projectI18n, {
  ...getDefaultConstraints(projectI18n as Table)
});

export const ProjectRoleInsert = createInsertSchema(projectRole, {
  // TODO : Verify that this is useful instead of the a pure string
  role: z.enum(['member', 'owner', 'admin'])
});

export const ProjectRoleInsertWithAssociatedFields = z.object({
  ...ProjectRoleInsert.shape,
  user: UserPrivacyPreserving
});

export const ProjectI18nWithoutPK = ProjectI18nInsert.omit({ lang: true });
export const ProjectRoleWithoutPK = ProjectRoleInsertWithAssociatedFields.omit({ userId: true });
export const ProjectI18nAPI = ProjectI18nWithoutPK.omit({ projectId: true });
export const ProjectRoleAPI = ProjectRoleWithoutPK.omit({ projectId: true });

export const ProjectInsertAPI = z.object({
  ...ProjectInsert.shape,
  translations: z.record(z.enum(targetLangs), ProjectI18nAPI).default({
    'zh-hant': {},
    'zh-hans': {}
  }),
  maintainerRoles: z.record(z.string(), ProjectRoleAPI)
  // TODO Refine the role requirements
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 Maintainer')
    .refine(
      (schema) => Object.values(schema).some((user) => user.role === 'owner'),
      'Set at least 1 Owner'
    )
});

export const ProjectUpdateAPI = z.object({
  ...ProjectUpdate.shape,
  translations: z.record(z.enum(targetLangs), ProjectI18nWithoutPK).default({
    'zh-hant': {},
    'zh-hans': {}
  }),
    // TODO Refine the role requirements
  maintainerRoles: z.record(z.string(), ProjectRoleWithoutPK)
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 Maintainer')
    .refine(
      (schema) => Object.values(schema).some((user) => user.role === 'owner'),
      'Set at least 1 Owner'
    )
});

/* ----------------- */
// LAYERS
/* -------- */

// Schema for selecting a layer - can be used to validate API responses
export const LayerBase = createSelectSchema(layer);
export const LayerI18nBase = createSelectSchema(layerI18n);

// Base schema to validate submit data
export const LayerInsert = createInsertSchema(layer, {
  ...getDefaultConstraints(layer as Table)
});

export const LayerUpdate = createInsertSchema(layer, {
  ...getDefaultConstraints(layer as Table),
  id: z.string()
});

export const LayerI18nInsert = createInsertSchema(layerI18n, {
  ...getDefaultConstraints(layerI18n as Table)
});

export const LayerI18nWithoutPK = LayerI18nInsert.omit({ lang: true });
export const LayerI18nAPI = LayerI18nWithoutPK.omit({ layerId: true });

export const LayerInsertAPI = z.object({
  ...LayerInsert.shape,
  translations: z.record(z.enum(targetLangs), LayerI18nAPI).default({
    'zh-hant': {},
    'zh-hans': {}
  })
});

export const LayerUpdateAPI = z.object({
  ...LayerUpdate.shape,
  translations: z.record(z.enum(targetLangs), LayerI18nWithoutPK).default({
    'zh-hant': {},
    'zh-hans': {}
  })
});

/* ----------------- */
// FEATURES
/* -------- */

// Feature Schemas
export const FeatureBase = createSelectSchema(feature);

export const FeatureInsert = createInsertSchema(feature, {
  ...getDefaultConstraints(feature as Table),
  geometry: z.custom<GeometryObject>(),
  properties: z.custom<GhostSignsFeatureProperties>(),
  addressProperties: z.custom<AddressProperties>().optional()
});

export const FeatureUpdate = FeatureInsert.extend({
  id: z.string()
});

export const FeatureInsertAPI = FeatureInsert;
export const FeatureUpdateAPI = FeatureUpdate;