// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
  resolveRelocationPolicy,
} from '#lib/locations/model.js'
import {
  stageProjectPolicyDraft,
  stagedProjectRelocationPolicy,
} from '#lib/locations/policyDraft.js'
import { evaluateLocationAdoption } from '#lib/locations/policy.js'

const policy = {
  version: 1,
  discoveryRadiusMetres: 550,
  coordinates: { mode: 'follow' },
  address: 'follow',
  unit: 'review',
  establishment: 'follow',
}

describe('pre-release v1 Location policy and consent', () => {
  it('uses follow in the initial schema without changing the submitted policy', () => {
    const submitted = JSON.stringify(policy)
    expect(ProjectLocationPolicySchema.parse(policy)).toEqual({
      ...policy,
      relocation: 'review',
    })
    expect(JSON.stringify(policy)).toBe(submitted)
  })
  it('preserves distance/review rules and defaults missing relocation to review', () => {
    const coordinates = { mode: 'withinDistance', maxMetres: 12 }
    const normalized = ProjectLocationPolicySchema.parse({ ...policy, coordinates })
    expect(normalized.coordinates).toEqual(coordinates)
    const { relocation: _relocation, ...missing } = DEFAULT_PROJECT_LOCATION_POLICY
    expect(ProjectLocationPolicySchema.parse(missing).relocation).toBe('review')
    expect(DEFAULT_PROJECT_LOCATION_POLICY.version).toBe(1)
  })
  it('rejects mixed vocabulary, unknown versions and malformed distance policies', () => {
    for (const candidate of [
      { ...DEFAULT_PROJECT_LOCATION_POLICY, address: 'automatic' },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, coordinates: { mode: 'automatic' } },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, relocation: 'automatic' },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, unit: 'automatic' },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, establishment: 'automatic' },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, version: 2 },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, version: 3 },
      { ...DEFAULT_PROJECT_LOCATION_POLICY, coordinates: { mode: 'withinDistance' } },
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: -1 },
      },
    ])
      expect(ProjectLocationPolicySchema.safeParse(candidate).success).toBe(false)
  })
  it('resolves Layer override, then Project choice, then review', () => {
    expect(resolveRelocationPolicy(null)).toBe('review')
    expect(resolveRelocationPolicy(policy)).toBe('review')
    const parent = { ...DEFAULT_PROJECT_LOCATION_POLICY, relocation: 'follow' }
    expect(resolveRelocationPolicy(parent, null)).toBe('follow')
    expect(resolveRelocationPolicy(parent, 'fixed')).toBe('fixed')
  })
  it('adopts ordinary follow changes without activating relocation', () => {
    const before = {
      geometry: {
        type: 'Point' as const,
        coordinates: [114.17, 22.3] as [number, number],
      },
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
      before,
      after: {
        ...before,
        geometry: {
          ...before.geometry,
          coordinates: [114.171, 22.3] as [number, number],
        },
      },
      addressChanged: true,
      unitChanged: false,
      establishmentChanged: false,
    }
    expect(evaluateLocationAdoption(evidence, policy).location).toBe('adopt')
    expect(
      evaluateLocationAdoption(evidence, {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        relocation: 'follow',
      }).location,
    ).toBe('review')
  })
})

describe('shared Locations/Advanced form draft', () => {
  const initial = { policy: DEFAULT_PROJECT_LOCATION_POLICY, revision: 4 }
  it('preserves changes from either section in either edit order', () => {
    const advanced = stageProjectPolicyDraft(initial, undefined, {
      relocation: 'follow',
    })
    const both = stageProjectPolicyDraft(initial, advanced, { address: 'follow' })
    expect(JSON.parse(both ?? 'null')).toMatchObject({
      expectedRevision: 4,
      policy: { relocation: 'follow', address: 'follow' },
    })
    const updates = stageProjectPolicyDraft(initial, undefined, { address: 'follow' })
    expect(
      JSON.parse(
        stageProjectPolicyDraft(initial, updates, { relocation: 'fixed' }) ?? 'null',
      ),
    ).toMatchObject({ policy: { relocation: 'fixed', address: 'follow' } })
    expect(stagedProjectRelocationPolicy(initial, both)).toBe('follow')
  })
  it('preserves unfinished distance controls and an older dirty revision fence', () => {
    const incomplete = stageProjectPolicyDraft(initial, undefined, {
      coordinates: { mode: 'withinDistance' },
    })
    const refreshed = { ...initial, revision: 5 }
    const advanced = stageProjectPolicyDraft(refreshed, incomplete, {
      relocation: 'fixed',
    })
    expect(JSON.parse(advanced ?? '{}')).toMatchObject({
      expectedRevision: 4,
      policy: { coordinates: { mode: 'withinDistance' }, relocation: 'fixed' },
    })
    expect(
      ProjectLocationPolicySchema.safeParse(JSON.parse(advanced ?? '{}').policy)
        .success,
    ).toBe(false)
  })
  it('removes only redundant drafts and handles malformed transport without throwing', () => {
    expect(
      stageProjectPolicyDraft(initial, undefined, { discoveryRadiusMetres: undefined }),
    ).toBeUndefined()
    expect(
      stageProjectPolicyDraft(initial, undefined, { relocation: 'review' }),
    ).toBeUndefined()
    expect(stagedProjectRelocationPolicy(initial, '{invalid')).toBe('review')
    const advanced = stageProjectPolicyDraft(initial, undefined, {
      relocation: 'follow',
    })
    expect(
      stageProjectPolicyDraft(initial, advanced, { relocation: 'review' }),
    ).toBeUndefined()
  })
})
