// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  FEATURE_CONTENT_MERGE_POLICY,
  applyFeatureTranslationPatch,
  validateFeatureRevisionContent,
} from '#lib/revisions/featureContent.js'
import { mergeRevisionContent, resolveRevisionContent } from '#lib/revisions/merge.js'
// SERVICES
import { buildFeatureRevisionBaselineContent } from '#lib/db/services/featureRevisionContent.js'
// FIXTURES
import {
  featureRevisionSourceFixture,
  featureRevisionContentFixture,
  featureRevisionLocationFixture,
} from './fixtures/featureRevisionContent'

const media = {
  revisions: { photo: 'image-r1', research: 'private-r1' },
  order: ['photo', 'research'],
}
const permission = {
  locales: ['en', 'zh-hant'],
  fields: ['title', 'description'] as const,
}

describe('Feature authored-content boundary', () => {
  it('retains every owned locale/value and selected field context without live controls', () => {
    const content = featureRevisionContentFixture()
    expect(content).toMatchObject({
      format: 'feature-content/v1',
      profile: {
        isIntangible: false,
        visitability: { isVisitable: true, asOf: '2026-11-06' },
      },
      translations: {
        en: {
          title: { value: 'Old', generated: true },
          description: { value: null, generated: false },
        },
      },
      properties: {
        choice: {
          selection: {
            propertyValueId: 'option',
            definition: {
              selectedOption: {
                id: 'option',
                translations: { en: { value: 'Shop', generated: false } },
              },
            },
          },
        },
        structured: { selection: { valueJson: '{"items":[1,2]}' } },
        private: {
          translations: { en: { value: 'Internal', generated: null } },
          selection: { definition: { audience: 'internal' } },
        },
      },
      gallery: {
        entries: { research: { isPublished: false, imageRevisionId: 'private-r1' } },
        order: ['photo', 'research'],
      },
    })
    const text = JSON.stringify(content)
    for (const forbidden of [
      'organisationId',
      'projectId',
      'layerId',
      'publisherId',
      'isArchived',
      'isDraft',
      'isPendingReview',
      'formWriteToken',
      'spatialIndex',
      'mtrDistance',
      'contributorId',
      'mutable-legacy-path',
    ])
      expect(text).not.toContain(forbidden)
  })

  it('captures accepted Location/correction/address/membership pins and omits the source actor', () => {
    const source = featureRevisionSourceFixture()
    const accepted = featureRevisionLocationFixture()
    source.location = [
      {
        featureId: 'f',
        actorId: 'historical-location-author',
        locationId: accepted.locationId,
        version: accepted.associationVersion,
        factsRevisionId: accepted.factsRevisionId,
        locationRevisionId: accepted.locationRevisionId,
        overrides: accepted.acceptedOverrides,
        factsOrganisationRevision: accepted.factsOrganisationRevision,
        locationOrganisationRevision: accepted.locationOrganisationRevision,
        occupancyRevisionId: accepted.occupancyRevisionId,
        addressRevisionId: accepted.addressRevisionId,
        membershipRevisionIds: accepted.membershipRevisionIds,
        placementOverrides: accepted.placementOverrides,
        acceptedGeometry: accepted.acceptedGeometry,
        acceptancePolicy: accepted.acceptancePolicy,
        acceptanceProposalId: accepted.acceptanceProposalId,
      },
    ]
    source.locationMemberships = accepted.memberships.map(row => ({
      ...row,
      featureId: 'f',
    }))
    const content = buildFeatureRevisionBaselineContent(source, media)
    expect(content.placement.location).toEqual(accepted)
    expect(JSON.stringify(content)).not.toContain('historical-location-author')
  })

  it('retains detached brand values without restoring their actor or concurrency token', () => {
    const source = featureRevisionSourceFixture()
    source.record.localLocationBrands = {
      brands: [{ names: { en: 'Brand' }, identifiers: {} }],
      revision: 'token',
      actorId: 'brand-author',
    }
    const content = buildFeatureRevisionBaselineContent(source, media)
    expect(content.detachedBrands).toEqual([
      { names: { en: 'Brand' }, identifiers: {} },
    ])
    expect(JSON.stringify(content)).not.toContain('brand-author')
  })

  it.each(['null', ' { "items": [null, false, ""] } '])(
    'preserves structured storage distinctly from SQL null: %s',
    valueJson => {
      const source = featureRevisionSourceFixture()
      source.properties[1].valueJson = valueJson
      expect(
        buildFeatureRevisionBaselineContent(source, media).properties.structured
          .selection.valueJson,
      ).toBe(valueJson)
    },
  )

  it('rejects missing media pins, mismatched order and unsupported revisions', () => {
    const source = featureRevisionSourceFixture()
    expect(() =>
      buildFeatureRevisionBaselineContent(source, { revisions: {}, order: [] }),
    ).toThrow('explicit verified revision')
    expect(() =>
      buildFeatureRevisionBaselineContent(source, {
        ...media,
        order: ['photo', 'photo'],
      }),
    ).toThrow()
    expect(() =>
      FeatureRevisionContentSchema.parse({
        ...featureRevisionContentFixture(),
        format: 'feature-content/v2',
      }),
    ).toThrow()
  })

  it('rejects ambiguous and cross-owner source rows instead of silently dropping them', () => {
    const duplicate = featureRevisionSourceFixture()
    duplicate.translations.push({ ...duplicate.translations[0] })
    expect(() => buildFeatureRevisionBaselineContent(duplicate, media)).toThrow(
      'duplicate source locale',
    )
    const otherFeature = featureRevisionSourceFixture()
    otherFeature.properties[0].featureId = 'other'
    expect(() => buildFeatureRevisionBaselineContent(otherFeature, media)).toThrow(
      'another Feature',
    )
    const otherField = featureRevisionSourceFixture()
    otherField.fieldOptions[0].propertyId = 'other'
    expect(() => buildFeatureRevisionBaselineContent(otherField, media)).toThrow(
      'another field',
    )
    const orphan = featureRevisionSourceFixture()
    orphan.propertyTranslations[0].propertyId = 'missing'
    expect(() => buildFeatureRevisionBaselineContent(orphan, media)).toThrow('Orphaned')
  })

  it('rejects mixed property storage and invalid structured JSON', () => {
    const legacy = featureRevisionSourceFixture()
    legacy.properties[0].value = ''
    expect(
      buildFeatureRevisionBaselineContent(legacy, media).properties.choice.selection
        .value,
    ).toBe('')
    const mixed = featureRevisionSourceFixture()
    mixed.properties[0].value = 'also a scalar'
    expect(() => buildFeatureRevisionBaselineContent(mixed, media)).toThrow(
      'mutually exclusive',
    )
    const malformed = featureRevisionSourceFixture()
    malformed.properties[1].valueJson = '{'
    expect(() => buildFeatureRevisionBaselineContent(malformed, media)).toThrow(
      'valid JSON',
    )
  })

  it('rejects control fields at every authored object boundary', () => {
    const content = featureRevisionContentFixture()
    expect(() =>
      FeatureRevisionContentSchema.parse({ ...content, isPublished: true }),
    ).toThrow()
    expect(() =>
      FeatureRevisionContentSchema.parse({
        ...content,
        profile: { ...content.profile, organisationId: 'other' },
      }),
    ).toThrow()
    expect(() =>
      FeatureRevisionContentSchema.parse({
        ...content,
        translations: { en: { ...content.translations.en, publisherId: 'other' } },
      }),
    ).toThrow()
    expect(validateFeatureRevisionContent(content)).toEqual([])
  })

  it('preserves GeometryCollection and bounding boxes without coercing coordinates', () => {
    const source = featureRevisionSourceFixture()
    source.record.geometry = {
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [114, 22], bbox: [114, 22, 114, 22] }],
    }
    expect(
      buildFeatureRevisionBaselineContent(source, media).placement.geometry,
    ).toEqual(source.record.geometry)
    source.record.geometry = { type: 'Point', coordinates: ['114', '22'] }
    expect(() => buildFeatureRevisionBaselineContent(source, media)).toThrow()
  })
})

describe('isolated Feature translation candidates', () => {
  it('changes text and its flag together while preserving hidden fields, other locales, placement and galleries', () => {
    const base = featureRevisionContentFixture()
    const candidate = applyFeatureTranslationPatch(
      base,
      { translations: { en: { title: 'Corrected' } } },
      permission,
    )
    expect(candidate.translations.en.title).toEqual({
      value: 'Corrected',
      generated: false,
    })
    expect(base.translations.en.title).toEqual({ value: 'Old', generated: true })
    expect(candidate.properties).toEqual(base.properties)
    expect(candidate.placement).toEqual(base.placement)
    expect(candidate.gallery).toEqual(base.gallery)
    expect(candidate.translations['zh-hant']).toEqual(base.translations['zh-hant'])
    expect(candidate.properties).not.toBe(base.properties)
  })

  it('rejects forbidden locales, fields and hidden nested payloads', () => {
    const base = featureRevisionContentFixture()
    expect(() =>
      applyFeatureTranslationPatch(
        base,
        { translations: { en: { title: 'New' } } },
        { ...permission, locales: ['zh-hant'] },
      ),
    ).toThrow('locale')
    expect(() =>
      applyFeatureTranslationPatch(
        base,
        { translations: { en: { title: 'New' } } },
        { ...permission, fields: ['description'] },
      ),
    ).toThrow('field')
    expect(() =>
      applyFeatureTranslationPatch(
        base,
        JSON.parse('{"translations":{"en":{"title":"New","isPublished":true}}}'),
        permission,
      ),
    ).toThrow()
    expect(() =>
      applyFeatureTranslationPatch(
        base,
        JSON.parse('{"translations":{},"properties":{}}'),
        permission,
      ),
    ).toThrow()
  })

  it('requires separate Location review for inherited names, while descriptions remain Feature-local', () => {
    const base = featureRevisionContentFixture()
    base.placement.location = featureRevisionLocationFixture()
    expect(() =>
      applyFeatureTranslationPatch(
        base,
        { translations: { en: { title: 'Shared correction' } } },
        permission,
      ),
    ).toThrow('separate Location correction review')
    const candidate = applyFeatureTranslationPatch(
      base,
      { translations: { en: { description: 'Feature description' } } },
      permission,
    )
    expect(candidate.placement.location).toEqual(base.placement.location)
    base.placement.location.acceptancePolicy = { nameMode: 'independent' }
    expect(
      applyFeatureTranslationPatch(
        base,
        { translations: { en: { title: 'Local name' } } },
        permission,
      ).translations.en.title.value,
    ).toBe('Local name')
  })

  it('distinguishes explicit clearing from omission', () => {
    const base = featureRevisionContentFixture()
    expect(
      applyFeatureTranslationPatch(base, { translations: {} }, permission),
    ).toEqual(base)
    const candidate = applyFeatureTranslationPatch(
      base,
      { translations: { 'zh-hant': { description: null } } },
      permission,
    )
    expect(candidate.translations['zh-hant'].description).toEqual({
      value: null,
      generated: false,
    })
  })
})

describe('format-owned merge boundaries', () => {
  it('merges different texts in one locale but never verifies a different concurrent text', () => {
    const base = featureRevisionContentFixture()
    const title = applyFeatureTranslationPatch(
      base,
      { translations: { en: { title: 'New' } } },
      permission,
    )
    const description = applyFeatureTranslationPatch(
      base,
      { translations: { en: { description: 'Description' } } },
      permission,
    )
    expect(
      mergeRevisionContent(base, title, description, FEATURE_CONTENT_MERGE_POLICY),
    ).toMatchObject({
      status: 'merged',
      value: {
        translations: {
          en: { title: { value: 'New' }, description: { value: 'Description' } },
        },
      },
    })
    const verifiedOld = structuredClone(base)
    verifiedOld.translations.en.title.generated = false
    expect(
      mergeRevisionContent(base, title, verifiedOld, FEATURE_CONTENT_MERGE_POLICY),
    ).toMatchObject({
      status: 'conflict',
      conflicts: [{ path: ['translations', 'en', 'title'] }],
    })
  })

  it('requires whole placement and visitability decisions when either dependent value changes concurrently', () => {
    const base = featureRevisionContentFixture()
    base.placement.location = featureRevisionLocationFixture()
    const moved = structuredClone(base),
      adopted = structuredClone(base)
    moved.placement.geometry = { type: 'Point', coordinates: [115, 23] }
    if (!adopted.placement.location) throw new Error('Expected linked fixture')
    adopted.placement.location.factsRevisionId = 'facts-v2'
    expect(
      mergeRevisionContent(base, moved, adopted, FEATURE_CONTENT_MERGE_POLICY),
    ).toMatchObject({ status: 'conflict', conflicts: [{ path: ['placement'] }] })
    const unavailable = structuredClone(base),
      dated = structuredClone(base)
    unavailable.profile.visitability.isVisitable = false
    dated.profile.visitability.asOf = '2026-11-07'
    expect(
      mergeRevisionContent(base, unavailable, dated, FEATURE_CONTENT_MERGE_POLICY),
    ).toMatchObject({
      status: 'conflict',
      conflicts: [{ path: ['profile', 'visitability'] }],
    })
    expect(
      resolveRevisionContent(
        base,
        unavailable,
        dated,
        [
          {
            path: ['profile', 'visitability'],
            result: {
              present: true,
              value: { isVisitable: false, asOf: '2026-11-07' },
            },
          },
        ],
        FEATURE_CONTENT_MERGE_POLICY,
      ),
    ).toMatchObject({
      profile: { visitability: { isVisitable: false, asOf: '2026-11-07' } },
    })
  })
})
