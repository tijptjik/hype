import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
  locationRulesForOrigin,
} from '../lib/locations/model'
import { evaluateLocationAdoption } from '../lib/locations/policy'
import { fillsMissingLocationValue } from '../lib/locations/missingValue'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
} from '../lib/locations/factsSnapshot'
import { applyFeatureLocationEdits } from '../lib/locations/edits'
import { seedCurationNames } from '../lib/locations/curationIdentity'
import { resolveFeatureLocation } from '../lib/locations/resolve'

const location = {
  geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
  address: {
    status: 'unresolved' as const,
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    snapshotId: null,
    rawSource: {},
    fallbackDisplay: {},
  },
}
const evidence = {
  before: location,
  after: location,
  addressChanged: false,
  unitChanged: false,
  establishmentChanged: false,
  origin: 'community' as const,
}

describe('community Location policy', () => {
  test('reviews identity while communications default to acceptance', () => {
    expect(
      evaluateLocationAdoption({ ...evidence, establishmentChanged: true }).facts,
    ).toBe('review')
    expect(
      evaluateLocationAdoption({ ...evidence, communicationsChanged: true }).facts,
    ).toBe('adopt')
  })
  test('upstream follow does not opt community into follow', () => {
    const policy = {
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      establishment: 'follow' as const,
    }
    expect(
      evaluateLocationAdoption({ ...evidence, establishmentChanged: true }, policy)
        .facts,
    ).toBe('review')
    expect(
      evaluateLocationAdoption(
        { ...evidence, establishmentChanged: true },
        { ...policy, sameSources: true },
      ).facts,
    ).toBe('adopt')
  })
  test('allows independent communications review without holding geometry', () => {
    const { version: _, ...community } = DEFAULT_PROJECT_LOCATION_POLICY
    const policy = ProjectLocationPolicySchema.parse({
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      community: { ...community, communications: 'review' },
    })
    const result = evaluateLocationAdoption(
      { ...evidence, communicationsChanged: true },
      policy,
    )
    expect(result.facts).toBe('review')
    expect(result.location).toBe('adopt')
    expect(locationRulesForOrigin(policy, 'saanseoi').communications).toBeUndefined()
  })
  test('empty exception requires evidence and explicit consent', () => {
    const { version: _, ...community } = DEFAULT_PROJECT_LOCATION_POLICY
    const policy = {
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      community: { ...community, acceptMissing: true },
    }
    expect(
      evaluateLocationAdoption(
        { ...evidence, establishmentChanged: true, missing: { establishment: true } },
        policy,
      ).facts,
    ).toBe('adopt')
    expect(
      evaluateLocationAdoption({ ...evidence, establishmentChanged: true }, policy)
        .facts,
    ).toBe('review')
    expect(fillsMissingLocationValue({ en: 'Shop' }, { en: 'Other', zh: '店' })).toBe(
      false,
    )
    expect(fillsMissingLocationValue({ en: 'Shop' }, { en: 'Shop', zh: '店' })).toBe(
      true,
    )
  })
  test('branch survives immutable storage and independent overrides', () => {
    const facts = {
      names: { en: 'Shop' },
      branch: { en: 'Central', 'zh-Hant': '中環' },
      brands: [],
      phoneNumber: [],
      location,
    }
    const stored = createLocationFactsSnapshot(facts, 'establishment')
    expect(readLocationFacts(stored).branch).toEqual(facts.branch)
    expect(
      resolveFeatureLocation(facts, location, {
        branch: { mode: 'override', value: { en: 'Old branch' } },
      }).branch,
    ).toEqual({ en: 'Old branch' })
    expect(
      resolveFeatureLocation(facts, location, { branch: { mode: 'clear' } }).branch,
    ).toBeNull()
  })
})

test('internal curation edits survive omission on an unrelated subsequent save', () => {
  const facts = { names: { en: 'Source' }, brands: [], phoneNumber: [], location }
  const before = resolveFeatureLocation(facts, location, {})
  const after = {
    ...before,
    branch: { en: 'Central', 'zh-Hant': '中環' },
    format: { en: 'AROME Bakery' },
    branchId: '0012',
  }
  const overrides = applyFeatureLocationEdits({}, before, after)
  expect(overrides.branch).toEqual({ mode: 'override', value: after.branch })
  expect(resolveFeatureLocation(facts, location, overrides).branchId).toBe('0012')
  expect(applyFeatureLocationEdits(overrides, after, before)).toEqual(overrides)
})
test('catalogue name seeding preserves supplied translations and fills missing locales', () => {
  expect(seedCurationNames({ en: 'AROME', 'zh-hant': '東海堂' })).toEqual({
    en: 'AROME',
    'zh-Hant': '東海堂',
    'zh-Hans': 'AROME',
  })
})
