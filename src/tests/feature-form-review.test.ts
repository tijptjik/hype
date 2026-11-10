// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import { validateFeatureFormResult } from '#lib/db/services/featureFormReview.js'
import { validateFeatureGalleryResult } from '#lib/revisions/featureGalleryReview.js'
// FIXTURES
import {
  featureRevisionContentFixture,
  featureRevisionSourceFixture,
  featureRevisionLocationFixture,
} from './fixtures/featureRevisionContent'

describe('Feature publication field authority', () => {
  function setup() {
    const before = featureRevisionContentFixture()
    const after = structuredClone(before)
    const policy = {
      snapshot: featureRevisionSourceFixture(),
      allowedInternalIds: new Set<string>(),
      allowDescriptions: true,
      resourceHubId: 'hub',
    }
    return { before, after, policy }
  }
  it('permits an ordinary title edit while preserving unseen internal values', () => {
    const { before, after, policy } = setup()
    after.translations.en.title.value = 'Reviewed title'
    expect(validateFeatureFormResult(before, after, policy)).toEqual([])
  })
  it('allows per-feature name overrides but rejects replacement of the pinned rule', () => {
    const { before, after, policy } = setup()
    before.profile.nameTemplate = {
      rule: { base: 'location', conditions: [] },
      baseNames: { en: 'Base' },
      overrides: {},
    }
    after.profile.nameTemplate = {
      ...before.profile.nameTemplate,
      overrides: { en: 'My name' },
    }
    expect(validateFeatureFormResult(before, after, policy)).toEqual([])
    after.profile.nameTemplate = {
      ...after.profile.nameTemplate,
      rule: { base: 'feature', conditions: [] },
    }
    expect(validateFeatureFormResult(before, after, policy)).toEqual([
      'Naming rule changes require separate configuration review',
    ])
  })
  it.each(['before', 'after', 'current'] as const)(
    'enforces the %s sensitivity classification',
    where => {
      const { before, after, policy } = setup()
      before.properties.private.selection.definition.audience = 'public'
      after.properties.private.selection.definition.audience = 'public'
      required(
        policy.snapshot.fieldDefinitions.find(row => row.id === 'private'),
      ).audience = 'public'
      if (where === 'current')
        required(
          policy.snapshot.fieldDefinitions.find(row => row.id === 'private'),
        ).audience = 'internal'
      else
        (where === 'before'
          ? before
          : after
        ).properties.private.selection.definition.audience = 'internal'
      after.properties.private.translations.en.value = 'Restricted replacement'
      expect(validateFeatureFormResult(before, after, policy)).toEqual([
        'Proposal changes a field outside current permissions',
      ])
    },
  )
  it.each(['projectId', 'organisationId', 'hubId'])(
    'rejects a property moved out of the Feature %s scope',
    key => {
      const { before, after, policy } = setup()
      required(policy.snapshot.fieldDefinitions.find(row => row.id === 'structured'))[
        key
      ] = 'elsewhere'
      after.properties.structured.selection.valueJson = '{"items":[]}'
      expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
        'no longer available',
      )
    },
  )
  it('permits shared core catalogue fields across hubs while rejecting other hub fields', () => {
    const { before, after, policy } = setup()
    required(
      policy.snapshot.fieldDefinitions.find(row => row.id === 'structured'),
    ).hubId = 'core-hub'
    after.properties.structured.selection.valueJson = '{"items":[]}'
    expect(
      validateFeatureFormResult(before, after, { ...policy, coreHubId: 'core-hub' }),
    ).toEqual([])
    expect(
      validateFeatureFormResult(before, after, {
        ...policy,
        coreHubId: 'another-hub',
      })[0],
    ).toContain('no longer available')
  })
  it('rejects resurrection of a removed field', () => {
    const { before, after, policy } = setup()
    policy.snapshot.fieldDefinitions = policy.snapshot.fieldDefinitions.filter(
      row => row.id !== 'structured',
    )
    after.properties.structured.selection.valueJson = '{}'
    expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
      'no longer available',
    )
  })
  it.each(['labels', 'selectedOption'] as const)(
    'rejects forged property %s in a resolution',
    field => {
      const { before, after, policy } = setup()
      if (field === 'labels')
        after.properties.choice.selection.definition.labels.en.value = 'Forged'
      else
        required(after.properties.choice.selection.definition.selectedOption).value =
          'Forged'
      expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
        'interpretation changed',
      )
    },
  )
  it('rejects disabled descriptions and locale deletion', () => {
    const { before, after, policy } = setup()
    after.translations.en.description.value = 'New description'
    expect(
      validateFeatureFormResult(before, after, {
        ...policy,
        allowDescriptions: false,
      })[0],
    ).toContain('Descriptions are disabled')
    delete after.translations['zh-hant']
    expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
      'Removing a language',
    )
  })
  it('requires separate review for shared Location and inherited title changes', () => {
    const { before, after, policy } = setup()
    before.placement.location = featureRevisionLocationFixture()
    after.placement.location = structuredClone(before.placement.location)
    after.translations.en.title.value = 'Shared replacement'
    expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
      'Inherited names',
    )
    after.placement.location.associationVersion = 'different'
    expect(validateFeatureFormResult(before, after, policy)[0]).toContain(
      'Location changes',
    )
  })
})

describe('Feature gallery review boundary', () => {
  it('accepts order, caption and removal while preserving other content', () => {
    const before = featureRevisionContentFixture(),
      after = structuredClone(before)
    after.gallery.order.reverse()
    after.gallery.entries.photo.caption.en = 'New caption'
    expect(validateFeatureGalleryResult(before, after)).toEqual([])
    delete after.gallery.entries.research
    after.gallery.order = ['photo']
    expect(validateFeatureGalleryResult(before, after)).toEqual([])
  })
  it('requires a separate attachment grant for new photos', () => {
    const before = featureRevisionContentFixture(),
      after = structuredClone(before)
    after.gallery.entries.foreign = { ...after.gallery.entries.photo }
    after.gallery.order.push('foreign')
    expect(validateFeatureGalleryResult(before, after)[0]).toContain(
      'reviewed upload attachment',
    )
  })
  it('prevents the gallery editor from changing Feature fields', () => {
    const before = featureRevisionContentFixture(),
      after = structuredClone(before)
    after.profile.visitability.isVisitable = !after.profile.visitability.isVisitable
    expect(validateFeatureGalleryResult(before, after)[0]).toContain(
      'other Feature content',
    )
  })
})
