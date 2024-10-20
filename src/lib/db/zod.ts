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
import type { TargetLang } from '$lib/types';
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
    .min(6, { message: 'Description should add something more ...' })
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

/* ----------------- */
// ORGANISATIONS
/* -------- */

// Schema for selecting an organisation - can be used to validate API responses
export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationI18nBase = createSelectSchema(organisationI18n);
export const OrganisationRoleBase = createSelectSchema(organisationRole);

// Base schema to validate submit data
export const OrganisationReqBase = createInsertSchema(organisation, {
  ...getDefaultConstraints(organisation as Table)
});

export const OrganisationI18nReqBase = createInsertSchema(organisationI18n, {
  ...getDefaultConstraints(organisationI18n as Table)
});

export const OrganisationRoleReqBase = createInsertSchema(organisationRole, {
  user: UserBase,
  ...getDefaultConstraints(organisationRole as Table)
});

const OrganisationI18nDekeyed = OrganisationI18nReqBase.omit({ lang: true });
const OrganisationRoleDekeyed = OrganisationRoleReqBase.omit({ userId: true });

export const OrganisationReqBody = z.object({
  ...OrganisationReqBase.shape,
  translations: z.record(z.enum(targetLangs), OrganisationI18nDekeyed),
  userRoles: z.record(z.string(), OrganisationRoleDekeyed)
});

export const NewOrganisationReqBody = z.object({
  ...OrganisationReqBase.omit({ id: true }).shape,
  translations: z.record(z.enum(targetLangs), OrganisationI18nDekeyed.omit({ organisationId: true })),
  userRoles: z.record(z.string(), OrganisationRoleDekeyed.omit({ organisationId: true }))
});

/* ----------------- */
// PROJECTS
/* -------- */

// Schema for selecting a project - can be used to validate API responses
export const ProjectBase = createSelectSchema(project);
export const ProjectI18n = createSelectSchema(projectI18n);
export const ProjectRole = createSelectSchema(projectRole);

// Base schema to validate submit data
export const ProjectReqBase = createInsertSchema(project, {
  ...getDefaultConstraints(project as Table)
});

export const ProjectI18nReqBase = createInsertSchema(projectI18n, {
  ...getDefaultConstraints(projectI18n as Table)
});

export const ProjectRoleReqBase = createInsertSchema(projectRole, {
  ...getDefaultConstraints(projectRole as Table)
});

const ProjectI18nDekeyed = ProjectI18nReqBase.omit({ lang: true });
const ProjectRoleDekeyed = ProjectRoleReqBase.omit({ userId: true });

export const ProjectReqBody = z.object({
  ...ProjectReqBase.shape,
  translations: z.record(z.enum(targetLangs), ProjectI18nDekeyed),
  maintainerRoles: z.record(z.string(), ProjectRoleDekeyed)
});

export const NewProjectReqBody = z.object({
  ...ProjectReqBase.omit({ id: true }).shape,
  translations: z.record(z.enum(targetLangs), ProjectI18nDekeyed.omit({ projectId: true })),
  maintainerRoles: z.record(z.string(), ProjectRoleDekeyed.omit({ projectId: true }))
});

/* ----------------- */
// LAYERS
/* -------- */

// Schema for selecting a layer - can be used to validate API responses
export const LayerBase = createSelectSchema(layer);
export const LayerI18n = createSelectSchema(layerI18n);

// Base schema to validate submit data
export const LayerReqBase = createInsertSchema(layer, {
  ...getDefaultConstraints(layer as Table)
});

export const LayerI18nReqBase = createInsertSchema(layerI18n, {
  ...getDefaultConstraints(layerI18n as Table)
});

const LayerI18nDekeyed = LayerI18nReqBase.omit({ lang: true });

export const LayerReqBody = z.object({
  ...LayerReqBase.shape,
  translations: z.record(z.enum(targetLangs), LayerI18nDekeyed)
});

export const NewLayerReqBody = z.object({
  ...LayerReqBase.omit({ id: true }).shape,
  translations: z.record(z.enum(targetLangs), LayerI18nDekeyed)
});

/* ----------------- */
// FEATURES
/* -------- */

// Schema for selecting a feature - can be used to validate API responses
export const FeatureBase = createSelectSchema(feature);

// Base schema to validate submit data
export const FeatureReqBase = createInsertSchema(feature, {
  ...getDefaultConstraints(feature as Table)
});

export const FeatureReqBody = z.object({
  ...FeatureReqBase.shape,
  geometry: z.custom<GeometryObject>(),
  properties: z.custom<GhostSignsFeatureProperties>(),
  addressProperties: z.custom<AddressProperties>().optional()
});

export const NewFeatureReqBody = z.object({
  ...FeatureReqBase.omit({ id: true }).shape,
  geometry: z.custom<GeometryObject>(),
  properties: z.custom<GhostSignsFeatureProperties>(),
  addressProperties: z.custom<AddressProperties>().optional()
});