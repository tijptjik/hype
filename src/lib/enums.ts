/* ----------------- */
// I18N

import type { Locale } from './types'

/* -------- */
export enum SupportedLocales {
  en = 'en',
  'zh-hant' = 'zh-hant',
  'zh-hans' = 'zh-hans',
}
export const supportedLocales = Object.values(SupportedLocales)

// The Locale type is already defined in ./types and inferred from SupportedLocales values
// This creates the union type: 'en' | 'zh-hant' | 'zh-hans'

export enum LocaleNamesEn {
  en = 'English',
  'zh-hant' = 'Traditional Chinese',
  'zh-hans' = 'Simplified Chinese',
}

export enum LocaleNamesZhHant {
  en = '英語',
  'zh-hant' = '繁體中文',
  'zh-hans' = '簡體中文',
}

export enum LocaleNamesZhHans {
  en = '英语',
  'zh-hant' = '繁体中文',
  'zh-hans' = '简体中文',
}

export const localeNames: Record<Locale, Record<Locale, string>> = {
  [SupportedLocales.en]: LocaleNamesEn,
  [SupportedLocales['zh-hant']]: LocaleNamesZhHant,
  [SupportedLocales['zh-hans']]: LocaleNamesZhHans,
}

export const localeCodes: Record<Locale, string> = {
  [SupportedLocales.en]: 'EN',
  [SupportedLocales['zh-hant']]: 'HK',
  [SupportedLocales['zh-hans']]: 'CN',
}

/* ----------------- */
// HIERARCHICAL RESOURCES
/* -------- */

export enum ResourcePath {
  organisation = 'organisations',
  project = 'projects',
  layer = 'layers',
  feature = 'features',
  task = 'tasks',
  hub = 'hubs',
  property = 'properties',
  user = 'users',
}

export enum FirstClassResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task',
  hub = 'hub',
  property = 'property',
  user = 'user',
}

export enum HierarchicalResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task',
}

export enum HierarchicalResourceSeq {
  organisation = 1,
  project = 2,
  layer = 3,
  feature = 4,
  task = 5,
}

export enum ResourceRefKey {
  hub = 'code',
  organisation = 'code',
  project = 'code',
  layer = 'id',
  feature = 'id',
  task = 'id',
  user = 'id',
}

export enum HierarchicalResourceParent {
  project = 'organisation',
  layer = 'project',
  feature = 'layer',
  task = 'feature',
}

export enum HierarchicalResourceParentRefKey {
  project = 'organisationId',
  layer = 'projectId',
  feature = 'layerId',
  task = 'featureId',
}

/* ----------------- */
// HUB
/* -------- */
export enum HubRoleType {
  admin = 'admin',
}

/* ----------------- */
// ORGANISATION
/* -------- */
export enum OrganisationRoleType {
  member = 'member',
  owner = 'owner',
}

/* ----------------- */
// PROJECT
/* -------- */
export enum ProjectRoleType {
  owner = 'owner',
  maintainer = 'maintainer',
  member = 'member',
  translator = 'translator',
  user = 'user',
}

/* ----------------- */
// IMAGE RESOURCES
/* -------- */
export enum ImageContextResource {
  hub = 'hub',
  organisation = 'organisation',
  project = 'project',
  feature = 'feature',
  user = 'user',
}

export enum ImageContextResourceExtended {
  task = 'task',
}

export enum ImageCDN {
  cloudinary = 'cloudinary',
  cloudflareR2 = 'cloudflareR2',
}

export enum ImageIntent {
  canonical = 'canonical',
  closeUp = 'closeUp',
  context = 'context',
  general = 'general',
  research = 'research',
  undefined = 'undefined',
}

export enum ImageIntentPublic {
  canonical = 'canonical',
  closeUp = 'closeUp',
  context = 'context',
  general = 'general',
}

export enum ImagePresentationMode {
  cover = 'cover',
  contain = 'contain',
}

export enum ImageEnv {
  dg6vtsga1 = 'dg6vtsga1',
}

/* ----------------- */
// TASK
/* -------- */
export enum TaskType {
  reportedMissing = 'reportedMissing',
  newPhoto = 'newPhoto',
  newFeature = 'newFeature',
}

export enum TaskReviewOutcome {
  rejected = 'rejected',
  accepted = 'accepted',
}

export enum TaskReviewAction {
  ignored = 'ignored',
  setUnpublished = 'set-unpublished',
  setIntangible = 'set-intangible',
  setArchived = 'set-archived',
  addedAllPhotos = 'added-all-photos',
  addedAllPhotosWithIntent = 'added-all-photos-with-intent',
  addedFeature = 'added-feature',
}

export enum TaskTypeColor {
  reportedMissing = 'border-error',
  newPhoto = 'border-info',
  newFeature = 'border-success',
}

/* ----------------- */
// FIELDS
/* -------- */
export enum FieldDiscriminator {
  classifier = 'classifier',
  specifier = 'specifier',
  display = 'display',
}
export const fieldDiscriminators = Object.values(FieldDiscriminator)

/* ----------------- */
// COMPONENT TYPES
/* -------- */
export enum PropertyComponentType {
  SelectField = 'SelectField',
  RangeField = 'RangeField',
  InputField = 'InputField',
  TextareaField = 'TextareaField',
  ToggleField = 'ToggleField',
}
export const propertyComponentTypes = Object.values(PropertyComponentType)
export enum PropertyScope {
  project = 'project',
  organisation = 'organisation',
  hub = 'hub',
}
export const propertyScopes = Object.values(PropertyScope)
export const classifierComponentTypes = ['SelectField', 'RangeField'] as const
export const specifierComponentTypes = ['InputField', 'TextareaField'] as const

/* ----------------- */
// FEATURE CARD
/* -------- */
export enum FeatureCardMode {
  Display = 'display',
  New = 'new',
  Missing = 'missing',
  AddPhoto = 'addPhoto',
  SubmissionSuccess = 'submissionSuccess',
}

/* ----------------- */
// FEATURE CARD :: NEW
/* -------- */
export enum NewFeatureMode {
  parents = 'parents',
  location = 'location',
  card = 'card',
}

/* ----------------- */
// COLLECTION STATISTICS
/* -------- */
export enum CollectionStatistic {
  total = 'total',
  access = 'access',
  filtered = 'filtered',
  selected = 'selected',
}

/* ----------------- */
// GEOCODING
/* -------- */
export enum GeoCoder {
  hkgov_als = 'hkgov_als',
  hkgov_identify = 'hkgov_identify',
  googlemaps = 'googlemaps',
}

/* ----------------- */
// QUERY PARAMETERS
/* -------- */
export const PRISM_PARAMETERS = ['organisation', 'project', 'layer']
export const SEARCH_PARAMETERS = ['q']
export const PAGINATION_PARAMETERS = ['offset', 'limit']
export const SORT_PARAMETERS = ['sortBy', 'sortOrder']
export const RESERVED_PARAMETERS = [
  ...PRISM_PARAMETERS,
  ...SEARCH_PARAMETERS,
  ...PAGINATION_PARAMETERS,
  ...SORT_PARAMETERS,
]

/* ----------------- */
// PANELS
/* -------- */

export enum Panel {
  filters = 'filters',
  prisms = 'prisms',
  stars = 'stars',
  plan = 'plan',
  passport = 'passport',
  eventCompanion = 'eventCompanion',
  settings = 'settings',
  profile = 'profile',
  admin = 'admin',
  hub = 'hub',
}

export enum PanelSide {
  left = 'left',
  right = 'right',
}

export enum PanelLeft {
  prisms = 'prisms',
  stars = 'stars',
  plan = 'plan',
  passport = 'passport',
  eventCompanion = 'eventCompanion',
  hub = 'hub',
}

export enum PanelRight {
  filters = 'filters',
  settings = 'settings',
  profile = 'profile',
}

/* ----------------- */
// OMNIBAR
/* -------- */

export enum PageState {
  NoTransition,
  NeedTransition,
  Transitioning,
  ReadyToNav,
}

export enum OmniMode {
  search = 'search',
  navigation = 'navigation',
  feature = 'feature',
  newFeature = 'new-feature',
}

export enum OmniCollection {
  walk = 'walk',
  neighbourhood = 'neighbourhood',
  feature = 'feature',
}
