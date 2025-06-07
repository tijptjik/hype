/* ----------------- */
// I18N

import type { Locale } from "./types";

/* -------- */
export enum SupportedLocales {
  en = 'en',
  'zh-hant' = 'zh-hant',
  'zh-hans' = 'zh-hans'
}
export const supportedLocales = Object.values(SupportedLocales) as [
  string,
  ...string[]
];

export enum LocaleNamesEn {
  en = 'English',
  'zh-hant' = 'Traditional Chinese',
  'zh-hans' = 'Simplified Chinese'
}

export enum LocaleNamesZhHant {
  en = '英語',
  'zh-hant' = '繁體字',
  'zh-hans' = '簡體字'
}

export enum LocaleNamesZhHans {
  en = '英语',
  'zh-hant' = '繁体字',
  'zh-hans' = '简体字'
}

export const localeNames: Record<Locale, Record<Locale, string>> = {
  [SupportedLocales.en]: LocaleNamesEn,
  [SupportedLocales['zh-hant']]: LocaleNamesZhHant,
  [SupportedLocales['zh-hans']]: LocaleNamesZhHans
};

/* ----------------- */
// HIERARCHICAL RESOURCES
/* -------- */

export enum ResourcePath {
  organisation = 'organisations',
  project = 'projects',
  layer = 'layers',
  feature = 'features',
  task = 'tasks',
  hub = 'hubs'
}

export enum FirstClassResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task',
  hub = 'hub'
}

export enum HierarchicalResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task'
}

export enum HierarchicalResourceSeq {
  organisation = 1,
  project = 2,
  layer = 3,
  feature = 4,
  task = 5
}

export enum ResourceRefKey {
  hub = 'code',
  organisation = 'code',
  project = 'code',
  layer = 'id',
  feature = 'id',
  task = 'id'
}

export enum HierarchicalResourceParent {
  project = 'organisation',
  layer = 'project',
  feature = 'layer',
  task = 'feature'
}

export enum HierarchicalResourceParentRefKey {
  project = 'organisationId',
  layer = 'projectId',
  feature = 'layerId',
  task = 'featureId'
}

/* ----------------- */
// ORGANISATION
/* -------- */
export enum OrganisationRoleType {
  member = 'member',
  owner = 'owner'
}

/* ----------------- */
// PROJECT
/* -------- */
export enum ProjectRoleType {
  maintainer = 'maintainer',
  member = 'member'
}

/* ----------------- */
// IMAGE RESOURCES
/* -------- */
export enum ImageContextResource {
  organisation = 'organisation',
  project = 'project',
  feature = 'feature'
}

export enum ImageContextResourceExtended {
  task = 'task'
}

export enum ImageCDN {
  cloudinary = 'cloudinary'
}

export enum ImageIntent {
  canonical = 'canonical',
  closeUp = 'closeUp',
  context = 'context',
  general = 'general',
  evidence = 'evidence',
  undefined = 'undefined'
}

export enum ImageEnv {
  dg6vtsga1 = 'dg6vtsga1'
}

/* ----------------- */
// TASK
/* -------- */
export enum TaskType {
  reportedMissing = 'reportedMissing',
  newPhoto = 'newPhoto',
  newFeature = 'newFeature'
}

export enum TaskReviewOutcome {
  rejected = 'rejected',
  accepted = 'accepted'
}

export enum TaskReviewAction {
  ignored = 'ignored',
  setUnpublished = 'set-unpublished',
  setIntangible = 'set-intangible',
  setArchived = 'set-archived',
  addedAllPhotos = 'added-all-photos',
  addedAllPhotosWithIntent = 'added-all-photos-with-intent',
  addedFeature = 'added-feature'
}

export enum TaskTypeColor {
  reportedMissing = 'border-error',
  newPhoto = 'border-info',
  newFeature = 'border-success'
}

/* ----------------- */
// FIELDS
/* -------- */
export enum FieldDiscriminator {
  classifier = 'classifier',
  specifier = 'specifier',
  display = 'display'
}
export const fieldDiscriminators = Object.values(FieldDiscriminator) as [
  string,
  ...string[]
];

/* ----------------- */
// COMPONENT TYPES
/* -------- */
export enum PropertyComponentType {
  SelectField = 'SelectField',
  RangeField = 'RangeField',
  InputField = 'InputField',
  TextareaField = 'TextareaField'
}
export const propertyComponentTypes = Object.values(PropertyComponentType) as [
  string,
  ...string[]
];
export const classifierComponentTypes = ['SelectField', 'RangeField'] as const;
export const specifierComponentTypes = ['InputField', 'TextareaField'] as const;

/* ----------------- */
// FEATURE CARD
/* -------- */
export enum FeatureCardMode {
  Display = 'display',
  New = 'new',
  Missing = 'missing',
  AddPhoto = 'addPhoto'
}

/* ----------------- */
// COLLECTION STATISTICS
/* -------- */
export enum CollectionStatistic {
  total = 'total',
  access = 'access',
  filtered = 'filtered',
  selected = 'selected'
}

/* ----------------- */
// GEOCODING
/* -------- */
export enum GeoCoder {
  hkgov_als = 'hkgov_als',
  hkgov_identify = 'hkgov_identify',
  googlemaps = 'googlemaps'
}

/* ----------------- */
// QUERY PARAMETERS
/* -------- */
export const PRISM_PARAMETERS = ['organisation', 'project', 'layer'];
export const SEARCH_PARAMETERS = ['q'];
export const PAGINATION_PARAMETERS = ['offset', 'limit'];
export const RESERVED_PARAMETERS = [
  ...PRISM_PARAMETERS,
  ...SEARCH_PARAMETERS,
  ...PAGINATION_PARAMETERS
];
