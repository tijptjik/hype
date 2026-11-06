// DOMAIN
import { buildFeatureRevisionBaselineContent } from '#lib/db/services/featureRevisionContent.js'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

type Row = Record<string, RevisionValue>
type Source = { record: Row } & Record<
  | 'translations'
  | 'properties'
  | 'propertyTranslations'
  | 'location'
  | 'locationMemberships'
  | 'galleryLinks'
  | 'images'
  | 'fieldDefinitions'
  | 'fieldTranslations'
  | 'fieldOptions'
  | 'fieldOptionTranslations',
  Row[]
>

/**
 * Provides owned content alongside deliberately sensitive/control/derived source fields.
 * @returns A fresh mutable source fixture with classifier, structured and translated values.
 */
export function featureRevisionSourceFixture(): Source {
  const definition = {
    key: 'field',
    type: 'specifier',
    component: 'TextField',
    dataType: 'text',
    dateResolution: 'day',
    timeMaxHour: 24,
    cardinality: 'one',
    presentation: 'text',
    min: null,
    max: null,
    audience: 'public',
    isTranslatable: true,
  }
  return {
    record: {
      id: 'f',
      organisationId: 'org',
      projectId: 'project',
      layerId: 'layer',
      contributorId: 'original-contributor',
      publisherId: 'publisher',
      isPublished: true,
      localIsPublished: true,
      isArchived: false,
      localIsArchived: false,
      isDraft: false,
      isPendingReview: false,
      publishedAt: 'publication-time',
      modifiedAt: 'token',
      formWriteToken: 'server-token',
      spatialIndex: { cells: [1] },
      mtrDistance: 100,
      createdAt: 'creation-time',
      geometry: { type: 'Point', coordinates: [114, 22] },
      addressMeta: { legacy: 'retained' },
      isIntangible: false,
      isVisitable: true,
      visitableAsOf: '2026-11-06',
      localLocationBrands: null,
    },
    translations: [
      {
        featureId: 'f',
        locale: 'en',
        title: 'Old',
        titleGen: true,
        description: null,
        descriptionGen: false,
        displayAddress: 'Street',
        displayAddressGen: false,
        addressProperties: { number: '1' },
      },
      {
        featureId: 'f',
        locale: 'zh-hant',
        title: '舊名',
        titleGen: false,
        description: '說明',
        descriptionGen: true,
        displayAddress: null,
        displayAddressGen: true,
        addressProperties: null,
      },
    ],
    properties: [
      {
        featureId: 'f',
        propertyId: 'choice',
        propertyValueId: 'option',
        value: null,
        valueJson: null,
      },
      {
        featureId: 'f',
        propertyId: 'structured',
        propertyValueId: null,
        value: null,
        valueJson: '{"items":[1,2]}',
      },
      {
        featureId: 'f',
        propertyId: 'private',
        propertyValueId: null,
        value: null,
        valueJson: null,
      },
    ],
    propertyTranslations: [
      {
        featureId: 'f',
        propertyId: 'private',
        locale: 'en',
        value: 'Internal',
        valueGen: null,
      },
    ],
    location: [],
    locationMemberships: [],
    galleryLinks: [
      {
        featureId: 'f',
        imageId: 'photo',
        intent: 'canonical',
        isPublished: true,
        localIsPublished: true,
      },
      {
        featureId: 'f',
        imageId: 'research',
        intent: 'research',
        isPublished: false,
        localIsPublished: false,
      },
    ],
    images: [
      { id: 'photo', publicId: 'mutable-legacy-path', isArchived: false },
      { id: 'research', publicId: 'private-legacy-path', isArchived: false },
    ],
    fieldDefinitions: [
      { ...definition, id: 'choice', type: 'classifier' },
      { ...definition, id: 'structured', isTranslatable: false },
      { ...definition, id: 'private', audience: 'internal' },
    ],
    fieldTranslations: [
      { propertyId: 'choice', locale: 'en', label: 'Kind', labelGen: false },
    ],
    fieldOptions: [{ id: 'option', propertyId: 'choice', value: 'shop', rank: 0 }],
    fieldOptionTranslations: [
      { propertyValueId: 'option', locale: 'en', value: 'Shop', valueGen: false },
    ],
  }
}

/**
 * Builds a synthetic typed aggregate with explicit image pins and order.
 * @returns Isolated content for merge, candidate and projection integration tests.
 */
export function featureRevisionContentFixture(): FeatureRevisionContent {
  return buildFeatureRevisionBaselineContent(featureRevisionSourceFixture(), {
    revisions: { photo: 'image-r1', research: 'private-r1' },
    order: ['photo', 'research'],
  })
}

/**
 * Supplies a linked accepted-reference bundle independently from shared mutable Location rows.
 * @returns Synthetic association with retained correction/occupancy/address evidence.
 */
export function featureRevisionLocationFixture(): NonNullable<
  FeatureRevisionContent['placement']['location']
> {
  return {
    locationId: 'place',
    associationVersion: 'association-v1',
    factsRevisionId: 'facts-v1',
    locationRevisionId: 'position-v1',
    acceptedOverrides: {},
    factsOrganisationRevision: 'correction-v1',
    locationOrganisationRevision: null,
    occupancyRevisionId: 'occupancy-v1',
    addressRevisionId: 'address-v1',
    membershipRevisionIds: ['membership-v1'],
    placementOverrides: {},
    acceptedGeometry: { type: 'Point', coordinates: [114, 22] },
    acceptancePolicy: { nameMode: 'inherit' },
    acceptanceProposalId: 'adoption-v1',
    memberships: [
      {
        containerLocationId: 'building',
        role: 'building',
        bindingVersion: 'binding-v1',
        occupancyRevisionId: 'occupancy-v1',
        membershipRevisionId: 'membership-v1',
      },
    ],
  }
}
