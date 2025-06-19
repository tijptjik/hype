import { relations } from 'drizzle-orm';

// Import all table definitions
import { user, userFeature, userLayer } from './user';
import { hub, hubI18n } from './hub';
import { organisation, organisationI18n, organisationRole } from './organisation';
import { project, projectI18n, projectRole } from './project';
import { layer, layerI18n, layerProperty } from './layer';
import { property, propertyI18n, propertyValue, propertyValueI18n } from './property';
import { feature, featureI18n, featureProperty, featurePropertyI18n } from './feature';
import { image, featureImage } from './image';
import { task, taskImage } from './task';

/* ============================================================================
 * TABLE RELATIONS
 * ============================================================================
 * All table relationships defined in one place to avoid circular imports
 */

/**
 * User relations
 * @remarks
 * Links user to their memberships, roles, contributions, and preferences
 */
export const userRelations = relations(user, ({ many }) => ({
  memberships: many(organisationRole),
  projectRoles: many(projectRole),
  contributedImages: many(image, { relationName: 'contributor' }),
  contributedTasks: many(task, { relationName: 'contributorTasks' }),
  reviewedTasks: many(task, { relationName: 'reviewerTasks' }),
  userFeatures: many(userFeature),
  userLayers: many(userLayer)
}));

/**
 * Organization relations
 * @remarks
 * Links organization to its translations, members, projects, hub, and metadata
 */
export const organisationRelations = relations(organisation, ({ one, many }) => ({
  i18n: many(organisationI18n),
  userRoles: many(organisationRole),
  image: one(image, {
    fields: [organisation.imageId],
    references: [image.id]
  }),
  publisher: one(user, {
    fields: [organisation.publisherId],
    references: [user.id]
  }),
  hub: one(hub, {
    fields: [organisation.hubId],
    references: [hub.id]
  }),
  projects: many(project),
  tasks: many(task)
}));

/**
 * Organization translation relations
 */
export const organisationI18nRelations = relations(organisationI18n, ({ one }) => ({
  organisation: one(organisation, {
    fields: [organisationI18n.organisationId],
    references: [organisation.id]
  })
}));

/**
 * Organization role relations
 */
export const organisationRoleRelations = relations(organisationRole, ({ one }) => ({
  user: one(user, {
    fields: [organisationRole.userId],
    references: [user.id]
  }),
  organisation: one(organisation, {
    fields: [organisationRole.organisationId],
    references: [organisation.id]
  })
}));

/**
 * Project relations
 * @remarks
 * Links project to its translations, maintainers, properties, and metadata
 */
export const projectRelations = relations(project, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [project.organisationId],
    references: [organisation.id]
  }),
  i18n: many(projectI18n),
  maintainerRoles: many(projectRole),
  properties: many(property),
  layers: many(layer),
  tasks: many(task),
  image: one(image, {
    fields: [project.imageId],
    references: [image.id]
  }),
  publisher: one(user, {
    fields: [project.publisherId],
    references: [user.id]
  })
}));

/**
 * Project translation relations
 */
export const projectI18nRelations = relations(projectI18n, ({ one }) => ({
  project: one(project, {
    fields: [projectI18n.projectId],
    references: [project.id]
  })
}));

/**
 * Project role relations
 */
export const projectRoleRelations = relations(projectRole, ({ one }) => ({
  project: one(project, {
    fields: [projectRole.projectId],
    references: [project.id]
  }),
  user: one(user, {
    fields: [projectRole.userId],
    references: [user.id]
  })
}));

/**
 * Layer relations
 * @remarks
 * Links layer to its translations, properties, features, and project
 */
export const layerRelations = relations(layer, ({ many, one }) => ({
  organisation: one(organisation, {
    fields: [layer.organisationId],
    references: [organisation.id]
  }),
  project: one(project, {
    fields: [layer.projectId],
    references: [project.id]
  }),
  i18n: many(layerI18n),
  properties: many(layerProperty),
  publisher: one(user, {
    fields: [layer.publisherId],
    references: [user.id]
  }),
  features: many(feature)
}));

/**
 * Layer translation relations
 */
export const layerI18nRelations = relations(layerI18n, ({ one }) => ({
  layer: one(layer, {
    fields: [layerI18n.layerId],
    references: [layer.id]
  })
}));

/**
 * Layer property relations
 */
export const layerPropertyRelations = relations(layerProperty, ({ one }) => ({
  layer: one(layer, {
    fields: [layerProperty.layerId],
    references: [layer.id]
  }),
  property: one(property, {
    fields: [layerProperty.propertyId],
    references: [property.id]
  })
}));

/**
 * Property relations
 * @remarks
 * Links property to its translations, values, and layer assignments
 */
export const propertyRelations = relations(property, ({ one, many }) => ({
  project: one(project, {
    fields: [property.projectId],
    references: [project.id]
  }),
  values: many(propertyValue),
  i18n: many(propertyI18n),
  layerProperties: many(layerProperty)
}));

/**
 * Property translation relations
 */
export const propertyI18nRelations = relations(propertyI18n, ({ one }) => ({
  property: one(property, {
    fields: [propertyI18n.propertyId],
    references: [property.id]
  })
}));

/**
 * Property value relations
 * @remarks
 * Links property values to their translations
 */
export const propertyValueRelations = relations(propertyValue, ({ one, many }) => ({
  property: one(property, {
    fields: [propertyValue.propertyId],
    references: [property.id]
  }),
  i18n: many(propertyValueI18n)
}));

/**
 * Property value translation relations
 */
export const propertyValueI18nRelations = relations(propertyValueI18n, ({ one }) => ({
  propertyValue: one(propertyValue, {
    fields: [propertyValueI18n.propertyValueId],
    references: [propertyValue.id]
  })
}));

/**
 * Feature relations
 * @remarks
 * Links feature to its translations, properties, images, and metadata
 */
export const featureRelations = relations(feature, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [feature.organisationId],
    references: [organisation.id]
  }),
  project: one(project, {
    fields: [feature.projectId],
    references: [project.id]
  }),
  layer: one(layer, {
    fields: [feature.layerId],
    references: [layer.id]
  }),
  contributor: one(user, {
    fields: [feature.contributorId],
    references: [user.id]
  }),
  publisher: one(user, {
    fields: [feature.publisherId],
    references: [user.id]
  }),
  i18n: many(featureI18n),
  properties: many(featureProperty),
  images: many(featureImage),
  users: many(userFeature),
  tasks: many(task)
}));

/**
 * Feature translation relations
 */
export const featureI18nRelations = relations(featureI18n, ({ one }) => ({
  feature: one(feature, {
    fields: [featureI18n.featureId],
    references: [feature.id]
  })
}));

/**
 * Feature property relations
 * @remarks
 * Links feature properties to their translations and values
 */
export const featurePropertyRelations = relations(featureProperty, ({ one, many }) => ({
  feature: one(feature, {
    fields: [featureProperty.featureId],
    references: [feature.id]
  }),
  property: one(property, {
    fields: [featureProperty.propertyId],
    references: [property.id]
  }),
  propertyValue: one(propertyValue, {
    fields: [featureProperty.propertyValueId],
    references: [propertyValue.id]
  }),
  i18n: many(featurePropertyI18n)
}));

/**
 * Feature property translation relations
 */
export const featurePropertyI18nRelations = relations(
  featurePropertyI18n,
  ({ one }) => ({
    featureProperty: one(featureProperty, {
      fields: [featurePropertyI18n.featureId, featurePropertyI18n.propertyId],
      references: [featureProperty.featureId, featureProperty.propertyId]
    })
  })
);

/**
 * Image relations
 * @remarks
 * Links image to its contributor and feature/task assignments
 */
export const imageRelations = relations(image, ({ one, many }) => ({
  contributor: one(user, {
    relationName: 'contributor',
    fields: [image.contributorId],
    references: [user.id]
  }),
  featureImage: one(featureImage, {
    fields: [image.id],
    references: [featureImage.imageId]
  }),
  taskImages: many(taskImage)
}));

/**
 * Feature image relations
 */
export const featureImageRelations = relations(featureImage, ({ one }) => ({
  feature: one(feature, {
    fields: [featureImage.featureId],
    references: [feature.id]
  }),
  image: one(image, {
    fields: [featureImage.imageId],
    references: [image.id]
  })
}));

/**
 * User feature relations
 */
export const userFeatureRelations = relations(userFeature, ({ one }) => ({
  user: one(user, {
    fields: [userFeature.userId],
    references: [user.id]
  }),
  feature: one(feature, {
    fields: [userFeature.featureId],
    references: [feature.id]
  })
}));

/**
 * User layer relations
 */
export const userLayerRelations = relations(userLayer, ({ one }) => ({
  user: one(user, {
    fields: [userLayer.userId],
    references: [user.id]
  }),
  layer: one(layer, {
    fields: [userLayer.layerId],
    references: [layer.id]
  })
}));

/**
 * Task relations
 * @remarks
 * Links task to its organization, project, feature, and images
 */
export const taskRelations = relations(task, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [task.organisationId],
    references: [organisation.id]
  }),
  project: one(project, {
    fields: [task.projectId],
    references: [project.id]
  }),
  feature: one(feature, {
    fields: [task.featureId],
    references: [feature.id]
  }),
  contributor: one(user, {
    relationName: 'contributorTasks',
    fields: [task.contributorId],
    references: [user.id]
  }),
  reviewer: one(user, {
    relationName: 'reviewerTasks',
    fields: [task.reviewerId],
    references: [user.id]
  }),
  images: many(taskImage)
}));

/**
 * Task image relations
 */
export const taskImageRelations = relations(taskImage, ({ one }) => ({
  task: one(task, {
    fields: [taskImage.taskId],
    references: [task.id]
  }),
  image: one(image, {
    fields: [taskImage.imageId],
    references: [image.id]
  })
}));

/**
 * Hub relations
 * @remarks
 * Links hub to its organizations and translations
 */
export const hubRelations = relations(hub, ({ many }) => ({
  i18n: many(hubI18n),
  organisations: many(organisation)
}));

/**
 * Hub translation relations
 */
export const hubI18nRelations = relations(hubI18n, ({ one }) => ({
  hub: one(hub, {
    fields: [hubI18n.hubId],
    references: [hub.id]
  })
}));
