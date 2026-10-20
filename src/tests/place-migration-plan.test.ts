import { describe, expect, it } from 'vitest'
import { planUnresolvedFeatureSplit } from '#lib/places/migrationPlan.js'
import { resolveFeaturePlace } from '#lib/places/resolve.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { PersistedPlaceBaseline } from '#lib/db/services/placeBaseline.js'

function baseline(): PersistedPlaceBaseline {
  return {
    featureId: 'f',
    projectId: 'p',
    modifiedAt: 'original',
    legacyPropertyIds: ['brand-property', 'phone-property'],
    address: emptyFeatureAddress({ en: 'Old address' }),
    effective: {
      names: { en: 'Shop', 'zh-hant': '店舖' },
      phoneNumber: ['2345 6789'],
      brands: [
        {
          identifiers: { hypePropertyValueId: 'legacy-brand' },
          names: { en: 'Brand' },
        },
      ],
      location: {
        geometry: { type: 'Point', coordinates: [114.1, 22.3] },
        address: {
          status: 'resolved',
          address2dId: 'address',
          address3dId: null,
          address3dUnitId: null,
          addressSnapshotId: 'snapshot',
          records: { original: 'retained' },
          fallbackDisplay: { en: 'Old address' },
        },
      },
    },
  }
}

describe('unresolved Feature split planning', () => {
  it('preserves every effective field while keeping local source claims unresolved', () => {
    const original = baseline()
    const result = planUnresolvedFeatureSplit(original)
    if (result.status !== 'planned') throw new Error(result.reason)
    expect(result.plan.state).toBe('unresolved')
    expect(result.plan.placeId).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(result.plan.facts.phoneNumber).toEqual(['+85223456789'])
    expect(result.plan.facts.location.address.address2dId).toBeNull()
    expect(result.plan.facts.location.address.records).toEqual({})
    expect(result.plan.overrides.location).toEqual({
      mode: 'override',
      value: original.effective.location,
    })
    expect(
      resolveFeaturePlace(
        result.plan.facts,
        result.plan.facts.location,
        result.plan.overrides,
      ),
    ).toEqual(original.effective)
    expect(result.plan.provenance.originalAddress).toEqual(original.address)
    expect(planUnresolvedFeatureSplit(original)).toEqual(result)
    expect(original).toEqual(baseline())
  })
  it('retains explicit null collections and cleared locales', () => {
    const original = baseline()
    original.effective.phoneNumber = null
    original.effective.brands = null
    original.effective.names['zh-hant'] = null
    const result = planUnresolvedFeatureSplit(original)
    if (result.status !== 'planned') throw new Error(result.reason)
    expect(
      resolveFeaturePlace(
        result.plan.facts,
        result.plan.facts.location,
        result.plan.overrides,
      ),
    ).toEqual(original.effective)
  })
  it('requires review for nameless, invalid-phone and location-less baselines', () => {
    const missingName = baseline()
    missingName.effective.names = { en: ' ' }
    expect(planUnresolvedFeatureSplit(missingName).status).toBe('review')
    const invalidPhone = baseline()
    invalidPhone.effective.phoneNumber = ['not a phone']
    expect(planUnresolvedFeatureSplit(invalidPhone).status).toBe('review')
    const missingLocation = baseline()
    missingLocation.effective.location = null
    expect(planUnresolvedFeatureSplit(missingLocation)).toEqual({
      status: 'review',
      reason: 'missing-location',
    })
  })
})
