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
  projectRole,
  property,
  propertyI18n,
  propertyValueI18n,
  propertyValue
} from '$lib/db/schema';
import type { GeometryObject } from 'geojson';
import type {
  GhostSignsFeatureProperties,
  AddressProperties,
  LayerMetadata,
  PropertyValue
} from '$lib/types';
import type { Table } from 'drizzle-orm';
const targetLangs = ['zh-hant', 'zh-hans'] as const;
const customPropertyTypes = ['classifiers', 'specifiers', 'display'] as const;
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
  key: z
    .string()
    .regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/, {
      message: 'Not a valid JS identifier - must not contain spaces or funky characters'
    })
    .min(2, { message: 'Key should have at least 2 characters' }),
  url: z.string().url({ message: 'URL is invalid' }).optional()
};

const getDefaultConstraints = (
  table:
    | typeof organisation
    | typeof organisationI18n
    | typeof project
    | typeof projectI18n
    | typeof layer
    | typeof layerI18n
    | typeof property
    | typeof feature
) => {
  return Object.keys(table).reduce(
    (acc, key) => {
      if (key in constraints) {
        acc[key as keyof typeof table] = constraints[key as keyof typeof constraints];
      }
      return acc;
    },
    {} as Record<keyof typeof table, z.ZodType<any>>
  );
};

/* ----------------- */
// UTILITY FUNCTIONS
/* -------- */

function createRequiredObjSchema<K extends string, V extends z.ZodTypeAny>(
  keysSchema: z.ZodEnum<[K, ...K[]]>,
  valueSchema: V
) {
  return z
    .record(keysSchema, valueSchema)
    .refine((obj): obj is Record<K, z.infer<V>> =>
      keysSchema.options.every((key) => obj[key] != null)
    );
}

const getTranslations = (model: z.ZodType<any>) =>
  createRequiredObjSchema(z.enum(targetLangs), model).default({
    'zh-hant': {},
    'zh-hans': {}
  });

const getUserRoles = (model: z.ZodType<any>) =>
  z
    .record(z.string(), model)
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 User')
    .refine(
      (schema) => Object.values(schema).some((user) => user.role === 'owner'),
      'Set at least 1 Owner'
    );

const getMaintainerRoles = (model: z.ZodType<any>) =>
  z
    .record(z.string(), model)
    .refine((schema) => Object.keys(schema).length > 0, 'Add at least 1 Maintainer');

const getCustomProperties = (model: z.ZodType<any>) =>
  createRequiredObjSchema(z.enum(customPropertyTypes), model).default({
    classifiers: {},
    specifiers: {},
    display: {}
  });

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

// ORGANISATION UTILS

// ORGANISATION SCHEMAS

// Schema for selecting an organisation - can be used to validate API responses
export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationI18nBase = createSelectSchema(organisationI18n);
export const OrganisationRoleBase = createSelectSchema(organisationRole);

// Base schema to validate submit data
export const OrganisationInsert = createInsertSchema(organisation, {
  ...getDefaultConstraints(organisation as Table)
});

export const OrganisationUpdate = OrganisationInsert.extend({
  id: z.string()
});

export const OrganisationI18nInsert = createInsertSchema(organisationI18n, {
  ...getDefaultConstraints(organisationI18n as Table)
});

export const OrganisationRoleInsert = createInsertSchema(organisationRole, {
  ...getDefaultConstraints(organisationRole as Table)
});

export const OrganisationRoleInsertWithAssociatedFields = OrganisationRoleInsert.extend({
  user: UserPrivacyPreserving
});

export const OrganisationI18nWithoutPK = OrganisationI18nInsert.omit({ lang: true });
export const OrganisationRoleWithoutPK = OrganisationRoleInsertWithAssociatedFields.omit({
  userId: true
});
export const OrganisationI18nAPI = OrganisationI18nWithoutPK.omit({ organisationId: true });
export const OrganisationRoleAPI = OrganisationRoleWithoutPK.omit({ organisationId: true });

export const OrganisationInsertAPI = OrganisationInsert.extend({
  translations: getTranslations(OrganisationI18nAPI),
  userRoles: getUserRoles(OrganisationRoleAPI)
});

export const OrganisationUpdateAPI = OrganisationUpdate.extend({
  translations: getTranslations(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateWithAssociatedFields)
});

console.log('ORGANISATION UPDATE API', OrganisationUpdateAPI.shape);

/* ----------------- */
// PROPERTY VALUES
/* -------- */

// Property Value Schemas
export const PropertyValueBase = createSelectSchema(propertyValue);
export const PropertyValueI18nBase = createSelectSchema(propertyValueI18n);

// Base schema to validate submit data
export const PropertyValueInsert = createInsertSchema(propertyValue);
export const PropertyValueI18nInsert = createInsertSchema(propertyValueI18n);

export const PropertyValueUpdate = PropertyValueInsert.extend({
  id: z.string()
});

export const PropertyValueI18nAPI = PropertyValueI18nInsert.omit({ propertyValueId: true });

export const PropertyValueInsertAPI = PropertyValueInsert.extend({
  translations: getTranslations(PropertyValueI18nInsert)
});
export const PropertyValueUpdateAPI = PropertyValueUpdate.extend({
  translations: getTranslations(PropertyValueI18nInsert)
});

/* ----------------- */
// PROPERTIES
/* -------- */

// Property Schemas
export const PropertyBase = createSelectSchema(property);
export const PropertyI18nBase = createSelectSchema(propertyI18n);

// Base schema to validate submit data
export const PropertyInsert = createInsertSchema(property).extend({
  ...getDefaultConstraints(property)
});

export const PropertyUpdate = PropertyInsert.extend({
  id: z.string()
});

export const PropertyI18nInsert = createInsertSchema(propertyI18n);

// export const PropertyI18nWithoutPK = PropertyI18nInsert.omit({ lang: true });
export const PropertyI18nAPI = PropertyI18nInsert.omit({ propertyId: true });

export const PropertyInsertAPI = PropertyInsert.extend({
  translations: getTranslations(PropertyI18nAPI),
  values: z.array(PropertyValueInsertAPI)
});
export const PropertyUpdateAPI = PropertyUpdate.extend({
  translations: getTranslations(PropertyI18nAPI),
  values: z.array(PropertyValueUpdateAPI)
});

/* ----------------- */
// PROJECTS
/* -------- */

// Schema for selecting a project - can be used to validate API responses
export const ProjectBase = createSelectSchema(project);
export const ProjectI18nBase = createSelectSchema(projectI18n);
export const ProjectRoleBase = createSelectSchema(projectRole);

export const CustomProperty = z.object({
  type: z.enum(fieldDiscriminators),
  key: z.string().min(3, { message: 'Key should have at least 3 characters' }),
  label: z.string().min(2, { message: 'Label should have at least 2 characters' }),
  component: z.enum(['InputField', 'TextareaField', 'SelectField', 'RangeField']),
  values: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional()
});

export const CustomPropertySchema = z.object({
  classifiers: z.record(z.string(), CustomProperty),
  specifiers: z.record(z.string(), CustomProperty),
  display: z.record(z.string(), CustomProperty)
});

// Base schema to validate submit data
export let ProjectInsert = createInsertSchema(project).extend({
  ...getDefaultConstraints(project)
});

export const ProjectUpdate = ProjectInsert.extend({
  id: z.string()
});

export const ProjectI18nInsert = createInsertSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n)
});

export const ProjectRoleInsert = createInsertSchema(projectRole).extend({
  role: z.enum(['maintainer'])
});

export const ProjectRoleInsertWithAssociatedFields = ProjectRoleInsert.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserPrivacyPreserving
});

export const ProjectI18nWithoutPK = ProjectI18nInsert.omit({ lang: true });
export const ProjectRoleWithoutPK = ProjectRoleInsertWithAssociatedFields.omit({ userId: true });
export const ProjectI18nAPI = ProjectI18nWithoutPK.omit({ projectId: true });
export const ProjectRoleAPI = ProjectRoleWithoutPK.omit({ projectId: true });

export const ProjectInsertAPI = ProjectInsert.extend({
  translations: getTranslations(ProjectI18nAPI),
  maintainerRoles: getMaintainerRoles(ProjectRoleAPI)
});

export const ProjectUpdateAPI = ProjectUpdate.extend({
  translations: getTranslations(ProjectI18nWithoutPK),
  maintainerRoles: getMaintainerRoles(ProjectRoleWithoutPK)
});

/* ----------------- */
// LAYERS
/* -------- */

// Schema for selecting a layer - can be used to validate API responses
export const LayerBase = createSelectSchema(layer);
export const LayerI18nBase = createSelectSchema(layerI18n);

// Base schema to validate submit data
export const LayerInsert = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().default({ defaultEnabled: true })
});

export const LayerUpdate = LayerInsert.extend({
  id: z.string()
});

export const LayerI18nInsert = createInsertSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n)
});

export const LayerI18nAPI = LayerI18nInsert.omit({ layerId: true });

export const LayerInsertAPI = LayerInsert.extend({
  translations: getTranslations(LayerI18nAPI)
});

export const LayerUpdateAPI = LayerUpdate.extend({
  translations: getTranslations(LayerI18nInsert)
});

/* ----------------- */
// FEATURES
/* -------- */

// Feature Schemas
export const FeatureBase = createSelectSchema(feature);

export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  geometry: z.custom<GeometryObject>(),
  properties: z.custom<GhostSignsFeatureProperties>(),
  addressProperties: z.custom<AddressProperties>().optional()
});

export const FeatureUpdate = FeatureInsert.extend({
  id: z.string()
});

export const FeatureInsertAPI = FeatureInsert;
export const FeatureUpdateAPI = FeatureUpdate;

