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
  propertyValue,
  layerProperty,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  image,
  featureImage,
  userFeature,
  task
} from '$lib/db/schema';
// TYPES
import type {
  AddressProperties,
  LayerMetadata,
  TaskType
} from '$lib/types';

export const targetLangs = ['zh-hant', 'zh-hans'] as const;
export const fieldDiscriminators = ['classifier', 'specifier', 'display'] as const;
/* ----------------- */
// CONSTRAINTS
/* -------- */

const constraints: Record<string, z.ZodType<any>> = {
  code: z
    .string()
    .min(1, { message: 'Code is required' })
    .max(24, { message: 'Code must be 24 characters or less' })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: 'Must contain only alphanumerics, underscores and $ characters'
    }),
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
    .optional()
    .nullish()
    .transform((x) => x ?? undefined),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: 'Must contain only alphanumerics, underscores and $ characters'
    })
    .min(2, { message: 'Key should have at least 2 characters' }),
  url: z
    .string()
    .url({ message: 'URL is invalid' })
    .optional()
    .nullish()
    .transform((x) => x ?? undefined)
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
    | typeof featureI18n
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
    'zh-hant': { lang: 'zh-hant' },
    'zh-hans': { lang: 'zh-hans' }
  });

const getUserRoles = (model: z.ZodType<any>) =>
  z
    .array(model)
    .refine((schema) => schema.length > 0, 'Add a User')
    .refine(
      (schema) => schema.map((user) => user.role).some((role) => role === 'owner'),
      'Set an Owner'
    );

const getMaintainerRoles = (model: z.ZodType<any>) =>
  z.array(model).refine((schema) => schema.length > 0, 'Add at least 1 Maintainer');

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
export const OrganisationInsert = createInsertSchema(organisation).extend({
  ...getDefaultConstraints(organisation),
  id: z.string().optional()
});

export const OrganisationUpdate = OrganisationInsert.extend({
  id: z.string()
});
export const OrganisationI18nUpdate = createInsertSchema(organisationI18n).extend({
  ...getDefaultConstraints(organisationI18n)
});
export const OrganisationRoleUpdate = createInsertSchema(organisationRole);
export const OrganisationRoleUpdateExtra = OrganisationRoleUpdate.extend({
  user: UserPrivacyPreserving
});

export const OrganisationI18nInsert = OrganisationI18nUpdate.omit({ organisationId: true });
export const OrganisationRoleInsert = OrganisationRoleUpdateExtra.omit({ organisationId: true });

export const OrganisationInsertAPI = OrganisationInsert.extend({
  translations: getTranslations(OrganisationI18nInsert),
  userRoles: getUserRoles(OrganisationRoleInsert)
});

export const OrganisationUpdateAPI = OrganisationUpdate.extend({
  translations: getTranslations(OrganisationI18nUpdate),
  userRoles: getUserRoles(OrganisationRoleUpdateExtra)
});

export const OrganisationPatch = OrganisationUpdate.partial();

/* ----------------- */
// PROPERTY VALUES
/* -------- */

// Property Value Schemas
export const PropertyValueBase = createSelectSchema(propertyValue);
export const PropertyValueI18nBase = createSelectSchema(propertyValueI18n);

// Base schema to validate submit data
export const PropertyValueInsert = createInsertSchema(propertyValue);
export const PropertyValueI18nUpdate = createInsertSchema(propertyValueI18n);

export const PropertyValueUpdate = PropertyValueInsert.extend({
  id: z.string()
});

export const PropertyValueI18nInsert = PropertyValueI18nUpdate.omit({ propertyValueId: true });

export const PropertyValueInsertAPI = PropertyValueInsert.extend({
  translations: getTranslations(PropertyValueI18nInsert)
});
export const PropertyValueUpdateAPI = PropertyValueUpdate.extend({
  translations: getTranslations(PropertyValueI18nUpdate)
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

export const PropertyI18nUpdate = createInsertSchema(propertyI18n);

// export const PropertyI18nWithoutPK = PropertyI18nUpdate.omit({ lang: true });
export const PropertyI18nInsert = PropertyI18nUpdate.omit({ propertyId: true });

export const PropertyInsertAPI = PropertyInsert.extend({
  translations: getTranslations(PropertyI18nInsert),
  values: z.array(PropertyValueInsertAPI)
});
export const PropertyUpdateAPI = PropertyUpdate.extend({
  translations: getTranslations(PropertyI18nUpdate),
  values: z.array(PropertyValueUpdateAPI)
});

/* ----------------- */
// PROJECTS
/* -------- */

// Schema for selecting a project - can be used to validate API responses
export const ProjectBase = createSelectSchema(project);
export const ProjectI18nBase = createSelectSchema(projectI18n);
export const ProjectRoleBase = createSelectSchema(projectRole);

// Base schema to validate submit data
export const ProjectInsert = createInsertSchema(project).extend({
  ...getDefaultConstraints(project)
});

export const ProjectUpdate = ProjectInsert.extend({
  id: z.string()
});

export const ProjectI18nUpdate = createInsertSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n)
});

export const ProjectRoleUpdate = createInsertSchema(projectRole).extend({
  role: z.enum(['maintainer'])
});
export const ProjectRoleUpdateExtra = ProjectRoleUpdate.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserPrivacyPreserving
});

export const ProjectI18nInsert = ProjectI18nUpdate.omit({ projectId: true });
export const ProjectRoleInsertExtra = ProjectRoleUpdateExtra.omit({ projectId: true });

export const ProjectInsertAPI = ProjectInsert.extend({
  translations: getTranslations(ProjectI18nInsert),
  maintainerRoles: getMaintainerRoles(ProjectRoleInsertExtra),
  properties: z.array(PropertyInsertAPI),
  // tasks: z.array(TaskInsert).optional()
});

export const ProjectUpdateAPI = ProjectUpdate.extend({
  translations: getTranslations(ProjectI18nUpdate),
  maintainerRoles: getMaintainerRoles(ProjectRoleUpdateExtra),
  properties: z.array(PropertyUpdateAPI),
  // tasks: z.array(TaskUpdate).optional()
});


export const ProjectPatch = ProjectUpdate.partial();

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

export const LayerI18nUpdate = createInsertSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n)
});

export const LayerPropertyUpdate = createInsertSchema(layerProperty);
export const LayerPropertyUpdateExtra = LayerPropertyUpdate.extend({
  property: PropertyInsertAPI.omit({ values: true })
});
export const LayerPropertyInsert = LayerPropertyUpdateExtra.omit(
  { layerId: true }
);

export const LayerI18nInsert = LayerI18nUpdate.omit({ layerId: true });

export const LayerInsertAPI = LayerInsert.extend({
  translations: getTranslations(LayerI18nInsert),
  properties: z.array(LayerPropertyInsert)
});

export const LayerUpdateAPI = LayerUpdate.extend({
  translations: getTranslations(LayerI18nUpdate),
  properties: z.array(LayerPropertyUpdateExtra)
});

export const LayerPatch = LayerUpdate.partial();

/* ----------------- */
// FEATURE PROPERTIES
/* -------- */

export const FeaturePropertyBase = createSelectSchema(featureProperty);
export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n);

// Base schema to validate submit data
export const FeaturePropertyInsert = createInsertSchema(featureProperty).extend({
  value: z.string().nullable()
});
export const FeaturePropertyUpdate = FeaturePropertyInsert.extend({
  id: z.string()
});
export const FeaturePropertyUpdateExtra = FeaturePropertyUpdate.extend({
  property: PropertyInsertAPI.omit({ values: true }).deepPartial(),
  propertyValue: PropertyValueInsertAPI.optional()
});

export const FeaturePropertyI18nUpdate = createInsertSchema(featurePropertyI18n);
export const FeaturePropertyI18nInsert = FeaturePropertyI18nUpdate.omit({ featurePropertyId: true });

export const FeaturePropertyInsertAPI = FeaturePropertyInsert.extend({
  translations: z.union([getTranslations(FeaturePropertyI18nInsert), z.object({})])
});
export const FeaturePropertyUpdateAPI = FeaturePropertyUpdateExtra.extend({
  translations: z.union([getTranslations(FeaturePropertyI18nUpdate), z.object({})])
});

/* ----------------- */
// FEATURES
/* -------- */

const PointGeometry = z.object({
  type: z.literal("Point"),
  coordinates: z.array(z.number())
})

// Feature Schemas
export const FeatureBase = createSelectSchema(feature);
export const FeatureI18nBase = createSelectSchema(featureI18n);

// Base schema to validate submit data
export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  // TODO These are NOT custom, they should just be z.object()
  contributorId: z.string(),
  geometry: PointGeometry,
  addressProperties: z.custom<AddressProperties>().optional()
});

export const FeatureUpdate = FeatureInsert.extend({
  id: z.string()
});

export const FeatureI18nUpdate = createInsertSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n)
});
export const FeatureI18nInsert = FeatureI18nUpdate.omit({ featureId: true });

// Update existing Feature schemas to include new relations
export const FeatureInsertAPI = FeatureInsert.extend({
  translations: getTranslations(FeatureI18nInsert),
  properties: z.array(FeaturePropertyInsertAPI),
  // images: z.array(FeatureImageInsert).optional(),
  // users: z.array(UserFeatureInsert).optional(),
  // tasks: z.array(TaskInsert).optional()
});

export const FeatureUpdateAPI = FeatureUpdate.extend({
  translations: getTranslations(FeatureI18nUpdate),
  properties: z.array(FeaturePropertyUpdateAPI),
  // images: z.array(FeatureImageUpdate).optional(),
  // users: z.array(UserFeatureUpdate).optional(),
  // tasks: z.array(TaskUpdate).optional()
});

export const FeaturePatch = FeatureUpdate.partial();

export const FeatureGetAPI = FeatureUpdateAPI.extend({
  layer: LayerUpdateAPI.optional(),
  project: ProjectUpdateAPI.optional(),
  organisation: OrganisationUpdateAPI.optional()
})

/* ----------------- */
// IMAGES
/* -------- */

// Base schemas
export const ImageBase = createSelectSchema(image);
export const ImageInsert = createInsertSchema(image).extend({
  id: z.string().optional(),
  publicId: z.string().min(1, "Public ID is required"),
  cdn: z.enum(['cloudinary']).default('cloudinary'),
  contributorId: z.string(),
  capturedAt: z.string()
});

export const ImageUpdate = ImageInsert.extend({
  id: z.string()
});

// Feature Images (Join Table)
export const FeatureImageBase = createSelectSchema(featureImage);
export const FeatureImageInsert = createInsertSchema(featureImage).extend({
  featureId: z.string(),
  intent: z.enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
  .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().optional()
});

export const FeatureImageUpdate = FeatureImageInsert.extend({
  featureId: z.string(),
  imageId: z.string()
});

export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
  feature: FeatureBase.optional(),
  image: ImageBase.optional()
});


export const ImageInsertAPI = ImageInsert.extend({
  featureImage: FeatureImageInsert.optional(),
  // RELATED ENTITY
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string(),
});

export const ImageUpdateAPI = ImageUpdate.extend({
  featureImage: FeatureImageUpdate.optional(),
  // RELATED ENTITY
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string(),
});

export const ImageGetAPI = ImageUpdate.extend({
  featureId: z.string(),
  intent: z.enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
  .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.coerce.date(),
});


export const ImagePatch = ImageUpdate.partial();

/* ----------------- */
// USER FEATURES
/* -------- */

// Base schemas
export const UserFeatureBase = createSelectSchema(userFeature);
export const UserFeatureInsert = createInsertSchema(userFeature).extend({
  isVisited: z.boolean().default(false),
  isWishlisted: z.boolean().default(false)
});

export const UserFeatureUpdate = UserFeatureInsert.extend({
  userId: z.string(),
  featureId: z.string()
});

export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
  user: UserBase.optional(),
  feature: FeatureBase.optional()
});

/* ----------------- */
// TASKS
/* -------- */

// Base schemas
export const TaskBase = createSelectSchema(task);
export const TaskInsert = createInsertSchema(task).extend({
  id: z.string().optional(),
  type: z.enum(['reportedMissing', 'newPhoto', 'newFeature']),
  isReviewed: z.boolean().default(false),
  reviewOutcome: z.enum(['rejected', 'accepted']).optional(),
  reviewAction: z.enum(['ignored', 'set-unpublished', 'set-intangible', 'set-archived', 'add-photo', 'add-feature']).optional()
});

export const TaskUpdate = TaskInsert.extend({
  id: z.string()
});

export const TaskInsertAPI = TaskInsert.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureInsertAPI.optional(),
  image: ImageBase.optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskUpdateAPI = TaskUpdate.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureUpdateAPI.optional(),
  image: ImageBase.optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskPatch = TaskUpdate.partial();