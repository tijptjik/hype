// i18m
export const supportedLocales = ['en', 'zh-hant', 'zh-hans'] as const;

// Fields
export const fieldDiscriminators = ['classifier', 'specifier', 'display'] as const;

// Feature Card
export enum FeatureCardMode {
  Display = 'display',
  New = 'new',
  Missing = 'missing',
  AddPhoto = 'addPhoto'
}

export enum HierarchicalResource {
  organisation = 'organisation',
  project = 'project',
  layer = 'layer',
  feature = 'feature',
  task = 'task'
}

export enum HierarchicalResourcePath {
  organisation = 'organisations',
  project = 'projects',
  layer = 'layers',
  feature = 'features',
  task = 'tasks'
}

export enum HierarchicalResourceSeq {
  organisation = 1,
  project = 2,
  layer = 3,
  feature = 4,
  task = 5
}

export enum HierarchicalResourceRefKey {
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

export enum CollectionStatistic {
  total = 'total',
  access = 'access',
  filtered = 'filtered',
  selected = 'selected'
}

export enum GeoCoder {
  hkgov_als = 'hkgov_als',
  hkgov_identify = 'hkgov_identify',
  googlemaps = 'googlemaps'
}


/* ----------------- */
// ACCESS CONTROL
/* -------- */

// ACCESS CONTROL - OPTIONS
// - OPEN - No restrictions or filters, i.e. access is granted to all users
// - ROLE - Restricted by role, i.e. access is accepted/denied based on the user's role
// - STATE - Filtered by state, i.e. result set is filtered based on the state of the resource

// ACCESS CONTROL - OPEN
export const publicAccessOptions = ['Public', 'SuperAdmin', 'ResourceAll', 'EntityAny'];

// ACCESS CONTROL - RESTRICED BY ROLE - Note : Also used in hierarchicalResourceQuery() and hierarchicalEntityQuery()
export const hierarchicalOwnOptions = ['ResourceOwn', 'EntityOwn'];

export const hierarchicalChildrenOptions = ['ResourceOwnChildren', 'EntityOwnChild'];

export const hierarchicalGrandChildrenOptions = [
  'ResourceOwnGrandChildren',
  'EntityOwnGrandChild'
];

export const hierarchicalAccessOptions = [
  ...hierarchicalOwnOptions,
  ...hierarchicalChildrenOptions,
  ...hierarchicalGrandChildrenOptions
];

// ACCESS CONTROL - RESTRICED BY ROLE - Note : Also used in genericResourceQuery() and genericEntityQuery()
export const relationalAccessOptions = [
  'EntityFromEditableProject',
  'EntityFromEditableOrganisation',
  'ResourceFromEditableProject',
  'ResourceFromEditableOrganisation'
];

export const genericAccessOptions = ['GenericOwn', 'GenericSelf'];

export const statefulAccessOptions = ['Stateful'];
