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
  task,
  userLayer,
  taskImage
} from '$lib/db/schema';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { AddressMeta, AddressProperties, LayerMetadata } from '$lib/types';
import type { GeometryObject } from 'geojson';

export const targetLangs = ['zh-hant', 'zh-hans'] as const;
export const fieldDiscriminators = ['classifier', 'specifier', 'display'] as const;
export const supportedLanguages = ['en', 'zh-hant', 'zh-hans'] as const;
/* ----------------- */
// CONSTRAINTS
/* -------- */

const constraints: Record<string, z.ZodType<any>> = {
  code: z
    .string()
    .min(1, { message: m.admin__validation_code_is_required() })
    .max(24, { message: m.admin__validation_code_lte_24_chars() })
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_code_valid_characters()
    }),
  name: z
    .string()
    .min(1, { message: m.admin__validation_name_is_required() })
    .max(128, { message: m.admin__validation_name_lte_128_chars() }),
  title: z
    .string()
    .min(1, { message: m.admin__validation_name_is_required() })
    .max(128, { message: m.admin__validation_name_lte_128_chars() }),
  nameShort: z
    .string()
    .min(1, { message: m.admin__validation_short_name_is_required() })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  description: z
    .string()
    .max(1024, { message: m.admin__validation_description_lte_1024_chars() })
    .optional()
    .nullish()
    .transform((x) => x ?? undefined),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_$]*$/, {
      message: m.admin__validation_key_valid_characters()
    })
    .min(2, { message: m.admin__validation_key_gte_2_chars() }),
  url: z
    .string()
    .url({ message: m.admin__validation_url_invalid() })
    .optional()
    .nullish()
    .transform((x) => x ?? undefined),
  attribution: z
    .string()
    .min(1, { message: m.admin__validation_attribution_is_required() })
    .max(128, { message: m.admin__validation_attribution_lte_128_chars() })
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

// TODO - It looks like this is stripping the validation messages for the default values
// e.g. organisaiton.name should render as m.admin__validation_name_is_required() but instead renders "required".
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
      m.admin__validation_user_roles_at_least_one_owner()
    );

// TODO - Test the addition / removal of maintainer roles while maintaining and / or removing the owner
const getMaintainerRoles = (model: z.ZodType<any>) =>
  z
    .array(model)
    .refine((schema) => schema.length > 0, 'Add at least 1 Maintainer')
    .refine(
      (schema) => schema.map((user) => user.role).some((role) => role === 'maintainer'),
      m.admin__validation_user_roles_at_least_one_maintainer()
    );

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
export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true
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

export const OrganisationI18nInsert = OrganisationI18nUpdate.omit({
  organisationId: true
});
export const OrganisationRoleInsert = OrganisationRoleUpdateExtra.omit({
  organisationId: true
});

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

export const PropertyValueI18nInsert = PropertyValueI18nUpdate.omit({
  propertyValueId: true
});

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
  user: UserBasic
});

export const ProjectI18nInsert = ProjectI18nUpdate.omit({ projectId: true });
export const ProjectRoleInsertExtra = ProjectRoleUpdateExtra.omit({ projectId: true });

export const ProjectInsertAPI = ProjectInsert.extend({
  translations: getTranslations(ProjectI18nInsert),
  maintainerRoles: getMaintainerRoles(ProjectRoleInsertExtra),
  properties: z.array(PropertyInsertAPI)
  // tasks: z.array(TaskInsert).optional()
});

export const ProjectUpdateAPI = ProjectUpdate.extend({
  translations: getTranslations(ProjectI18nUpdate),
  maintainerRoles: getMaintainerRoles(ProjectRoleUpdateExtra),
  properties: z.array(PropertyUpdateAPI)
  // tasks: z.array(TaskUpdate).optional()
});

export const ProjectPatch = ProjectUpdate.partial();

/* ----------------- */
// LAYERS
/* -------- */

// Schema for selecting a layer - can be used to validate API responses
export const LayerBase = createSelectSchema(layer).extend({
  experimental: z
    .object({
      contributorMode: z.boolean()
    })
    .default({ contributorMode: false }),
  language: z.enum(supportedLanguages).default('en')
});
export const LayerI18nBase = createSelectSchema(layerI18n);

// Base schema to validate submit data
export const LayerInsert = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().default({ defaultEnabled: true }),
  experimental: z
    .object({
      contributorMode: z.boolean()
    })
    .default({ contributorMode: false }),
  language: z.enum(supportedLanguages).default('en')
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
export const LayerPropertyInsert = LayerPropertyUpdateExtra.omit({ layerId: true });

export const LayerI18nInsert = LayerI18nUpdate.omit({ layerId: true });

export const LayerInsertAPI = LayerInsert.extend({
  translations: getTranslations(LayerI18nInsert),
  properties: z.array(LayerPropertyInsert)
});

export const LayerUpdateAPI = LayerUpdate.extend({
  translations: getTranslations(LayerI18nUpdate),
  properties: z.array(LayerPropertyUpdateExtra)
});

export const LayerUpdateAPIWithProject = LayerUpdateAPI.extend({
  project: ProjectBase
});

export const LayerPatch = LayerUpdate.partial();

/* ----------------- */
// FEATURE PROPERTIES
/* -------- */

export const FeaturePropertyBase = createSelectSchema(featureProperty);
export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n);

// Base schema to validate submit data
export const FeaturePropertyInsert = createInsertSchema(featureProperty)
  .extend({
    value: z.string().nullable()
  })
  .omit({
    featureId: true
  });
export const FeaturePropertyInsertExtra = FeaturePropertyInsert.extend({
  property: PropertyInsertAPI.omit({ values: true }).deepPartial(),
  propertyValue: PropertyValueInsertAPI.optional()
});

export const FeaturePropertyUpdate = FeaturePropertyInsert.extend({
  id: z.string()
});
export const FeaturePropertyUpdateExtra = FeaturePropertyUpdate.extend({
  property: PropertyInsertAPI.omit({ values: true }).deepPartial(),
  propertyValue: PropertyValueInsertAPI.optional()
});

export const FeaturePropertyI18nUpdate = createInsertSchema(featurePropertyI18n);
export const FeaturePropertyI18nInsert = FeaturePropertyI18nUpdate.omit({
  featurePropertyId: true
});

export const FeaturePropertyInsertAPI = FeaturePropertyInsertExtra.extend({
  translations: z.union([getTranslations(FeaturePropertyI18nInsert), z.object({})])
});
export const FeaturePropertyUpdateAPI = FeaturePropertyUpdateExtra.extend({
  translations: z.union([getTranslations(FeaturePropertyI18nUpdate), z.object({})])
});

/* ----------------- */
// FEATURES
/* -------- */

const PointGeometry = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number())
});

// Feature Schemas
export const FeatureBase = createSelectSchema(feature);
export const FeatureI18nBase = createSelectSchema(featureI18n);

// Base schema to validate submit data
export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  isIntangible: z.boolean().default(false),
  isVisitable: z.boolean().default(true),
  contributorId: z.string().optional(),
  geometry: z.custom<GeometryObject>().default({
    type: 'Point',
    coordinates: [114.1693671540923, 22.319307515052614]
  }),
  // TODO These are NOT custom, they should just be z.object()
  addressProperties: z.custom<AddressProperties>().default({}),
  addressMeta: z.custom<AddressMeta>().default({})
});

export const FeatureUpdate = FeatureInsert.extend({
  id: z.string()
});

export const FeatureI18nInsert = createInsertSchema(featureI18n)
  .omit({ featureId: true })
  .extend({
    ...getDefaultConstraints(featureI18n)
  });
export const FeatureI18nUpdate = createSelectSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n)
});

// Update existing Feature schemas to include new relations
export const FeatureInsertAPI = FeatureInsert.extend({
  translations: getTranslations(FeatureI18nInsert),
  properties: z.array(FeaturePropertyInsertAPI)
  // images: z.array(FeatureImageInsert).optional(),
  // users: z.array(UserFeatureInsert).optional(),
  // tasks: z.array(TaskInsert).optional()
});

export const FeatureUpdateAPI = FeatureUpdate.extend({
  translations: getTranslations(FeatureI18nUpdate),
  properties: z.array(FeaturePropertyUpdateAPI)
  // images: z.array(FeatureImageUpdate).optional(),
  // users: z.array(UserFeatureUpdate).optional(),
  // tasks: z.array(TaskUpdate).optional()
});

export const FeaturePatch = FeatureUpdate.partial();

export const FeatureGetAPI = FeatureUpdateAPI.extend({
  layer: LayerUpdateAPI.optional(),
  project: ProjectUpdateAPI.optional(),
  organisation: OrganisationUpdateAPI.optional()
});

/* ----------------- */
// IMAGES
/* -------- */

// Base schemas
export const ImageBase = createSelectSchema(image);
export const ImageInsert = createInsertSchema(image).extend({
  id: z.string().optional(),
  publicId: z.string().min(1, 'Public ID is required'),
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
  intent: z
    .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
    .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().optional()
});
// TODO Give this the correct name
export const FeatureImageInserts = FeatureImageInsert.omit({ imageId: true });

export const FeatureImageUpdate = FeatureImageInsert.extend({
  featureId: z.string(),
  imageId: z.string()
});

export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
  feature: FeatureBase.optional(),
  image: ImageBase.optional()
});

export const ImageInsertAPI = ImageInsert.extend({
  featureImage: FeatureImageInserts.optional(),
  // RELATED ENTITY
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string()
});

export const ImageUpdateAPI = ImageUpdate.extend({
  featureImage: FeatureImageUpdate.optional(),
  // RELATED ENTITY
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string()
});

export const ImageGetAPI = ImageUpdate.extend({
  featureId: z.string(),
  attribution: z.string().optional(),
  intent: z
    .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
    .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.coerce.date()
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

export const UserFeatureUpdateExtended = UserFeatureUpdate.extend({
  hierarchy: z.object({
    organisation: z.string(),
    project: z.string(),
    layer: z.string().nullable(),
    feature: z.string()
  })
});

export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
  user: UserBase.optional(),
  feature: FeatureBase.optional()
});

/* ----------------- */
// USER LAYERS
/* -------- */

// Add new schemas for userLayer
export const UserLayerBase = createSelectSchema(userLayer);
export const UserLayerInsert = createInsertSchema(userLayer);
export const UserLayerUpdate = UserLayerInsert.extend({
  userId: z.string(),
  layerId: z.string()
});

export const UserLayerUpdateAPI = UserLayerUpdate.extend({
  user: UserBase.optional(),
  layer: LayerBase.optional()
});

// USER EXTENDED

export const UserUpdateAPI = UserBase.extend({
  userLayers: z.array(UserLayerUpdate)
});

export const UserUpdate = UserPrivacyPreserving.extend({
  userLayers: z.array(UserLayerUpdate)
});

export const UserPatch = UserUpdate.partial();

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
  reviewAction: z
    .enum([
      'ignored',
      'set-unpublished',
      'set-intangible',
      'set-archived',
      'added-all-photos',
      'added-all-photos-with-intent',
      'added-feature'
    ])
    .optional()
});

export const TaskUpdate = TaskInsert.extend({
  id: z.string()
});

/* ----------------- */
// TASK IMAGES
/* -------- */

// Base schemas
export const TaskImageBase = createSelectSchema(taskImage);
export const TaskImageInsert = createInsertSchema(taskImage).extend({
  isPrimary: z.boolean().default(false)
});

export const TaskImageUpdate = TaskImageInsert.extend({
  taskId: z.string(),
  imageId: z.string()
});

export const TaskImageUpdateAPI = TaskImageUpdate.extend({
  task: TaskBase.optional(),
  image: ImageBase.optional()
});

export const TaskInsertAPI = TaskInsert.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureInsertAPI.optional(),
  images: z.array(ImageBase).optional(),
  taskImages: z.array(TaskImageInsert).optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskUpdateAPI = TaskUpdate.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureUpdateAPI.optional(),
  images: z.array(ImageBase).optional(),
  taskImages: z.array(TaskImageUpdate).optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskPatch = TaskUpdate.partial();
