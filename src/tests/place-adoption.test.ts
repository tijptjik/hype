// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { planPlaceAdoption, type AdoptionSourceRevision } from '#lib/places/adoption.js'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'

const automatic = {
  ...DEFAULT_PROJECT_PLACE_POLICY,
  coordinates: { mode: 'automatic' },
  address: 'automatic',
  unit: 'automatic',
  establishment: 'automatic',
}
function source(id = 'old', sequence = 1): AdoptionSourceRevision {
  return {
    id,
    sequence,
    placeId: 'place',
    ssId: 'ss',
    origin: 'saanseoi',
    payload: {
      resource: {
        attributes: {
          basicCategory: 'bakery',
          taxonomy: { primary: 'bakery' },
          operatingStatus: 'open',
        },
      },
    },
    facts: {
      names: { en: 'Bakery', 'zh-hant': '麵包店' },
      phoneNumber: ['+85223456789'],
      brands: [{ identifiers: { wikidata: 'Q1' }, names: { en: 'Brand' } }],
      location: {
        geometry: { type: 'Point', coordinates: [114.17, 22.3] },
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          addressSnapshotId: null,
          records: {},
          fallbackDisplay: { en: 'Old address' },
        },
      },
    },
  }
}
const plan = (
  candidate: AdoptionSourceRevision,
  policy: unknown = DEFAULT_PROJECT_PLACE_POLICY,
) =>
  planPlaceAdoption({
    facts: source(),
    location: source(),
    candidate,
    policy,
    overrides: {},
  })

describe('source revision adoption evidence', () => {
  it('adopts phone-only updates under defaults while a moved location waits for review', () => {
    const next = source('new', 2)
    next.facts.phoneNumber = ['+85291234567']
    next.facts.location.geometry.coordinates[0] += 0.01
    const result = plan(next)
    expect(result.factsRevisionId).toBe('new')
    expect(result.locationRevisionId).toBe('old')
    expect(result.effective.phoneNumber).toEqual(next.facts.phoneNumber)
    expect(result.effective.location).toEqual(source().facts.location)
    expect(result.before.location).toEqual(source().facts.location)
    expect(result.candidate.location).toEqual(next.facts.location)
    expect(result.decision.reasons).toEqual(['coordinates'])
  })
  it('evaluates Project distance policies independently', () => {
    const next = source('new', 2)
    next.facts.location.geometry.coordinates[0] += 0.00001
    expect(
      plan(next, {
        ...DEFAULT_PROJECT_PLACE_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: 10 },
      }).locationRevisionId,
    ).toBe('new')
    expect(plan(next).locationRevisionId).toBe('old')
  })
  it('holds name/category identity changes and preserves explicit overrides when adopted', () => {
    const next = source('new', 2)
    next.payload = {
      resource: {
        attributes: {
          basicCategory: 'cafe',
          taxonomy: { primary: 'cafe' },
          operatingStatus: 'open',
        },
      },
    }
    expect(plan(next).decision.reasons).toContain('establishment')
    const overrides = {
      names: { en: { mode: 'override' as const, value: 'Local name' } },
      brands: { mode: 'clear' as const },
      phoneNumber: { mode: 'override' as const, value: [] },
    }
    const saved = structuredClone(overrides)
    const result = planPlaceAdoption({
      facts: source(),
      location: source(),
      candidate: next,
      policy: automatic,
      overrides,
    })
    expect(result.effective.names.en).toBe('Local name')
    expect(result.candidate.names.en).toBe('Local name')
    expect(result.source.candidate.names.en).toBe('Bakery')
    expect(result.effective.brands).toBeNull()
    expect(result.effective.phoneNumber).toEqual([])
    expect(overrides).toEqual(saved)
  })
  it('blocks missing establishment evidence, identity churn and omitted invalid phones even under automatic policy', () => {
    const next = source('new', 2)
    next.ssId = 'different'
    next.payload = { issues: [{ kind: 'invalidPhone', index: 0, value: 'bad' }] }
    const result = plan(next, automatic)
    expect(result.blockers).toEqual([
      'source-identity',
      'establishment-evidence',
      'source-phone-omissions',
    ])
    expect(result.factsRevisionId).toBe('old')
    expect(result.locationRevisionId).toBe('old')
  })
  it('keeps unresolved canonical address dependencies pending without holding valid facts', () => {
    const next = source('new', 2)
    next.facts.location.address.address2dId = 'address'
    expect(plan(next, automatic)).toMatchObject({
      blockers: ['address-dependencies'],
      factsRevisionId: 'new',
      locationRevisionId: 'old',
    })
  })
  it('compares selected unit contents independently of address publication and other shops', () => {
    const old = source()
    const address = old.facts.location.address
    Object.assign(address, {
      status: 'resolved',
      address2dId: 'a',
      address3dId: 'inventory',
      address3dUnitId: 'unit',
      addressSnapshotId: 'snapshot1',
      records: {
        meta: { apiReleaseSet: 'release1' },
        data: {
          id: 'a',
          attributes: {
            snapshotId: 'snapshot1',
            sources: ['old'],
            i18n: { en: 'Address' },
          },
        },
        included: [
          {
            id: 'inventory',
            attributes: {
              snapshotId: 'snapshot1',
              units: [
                { id: 'unit', floor: '1' },
                { id: 'other', floor: '2' },
              ],
            },
          },
        ],
      },
    })
    const next = structuredClone(old)
    next.id = 'new'
    next.sequence = 2
    next.facts.location.address.addressSnapshotId = 'snapshot2'
    const records = next.facts.location.address.records as {
      meta: unknown
      data: { attributes: Record<string, unknown> }
      included: Array<{
        attributes: { snapshotId: string; units: Array<{ id: string; floor: string }> }
      }>
    }
    records.meta = { apiReleaseSet: 'release2' }
    records.data.attributes.snapshotId = 'snapshot2'
    records.data.attributes.sources = ['new']
    records.included[0].attributes.snapshotId = 'snapshot2'
    records.included[0].attributes.units[1].floor = '9'
    const build = () =>
      planPlaceAdoption({
        facts: old,
        location: old,
        candidate: next,
        policy: DEFAULT_PROJECT_PLACE_POLICY,
        overrides: {},
      })
    expect(build().decision.reasons).toEqual([])
    records.included[0].attributes.units[0].floor = '3'
    expect(build().decision.reasons).toEqual(['unit'])
  })
  it('uses separate accepted location evidence and rejects cross-place or backwards revisions', () => {
    const location = source('location', 2)
    location.facts.location.geometry.coordinates[0] += 0.01
    const next = structuredClone(location)
    next.id = 'next'
    next.sequence = 3
    expect(
      planPlaceAdoption({
        facts: source(),
        location,
        candidate: next,
        policy: DEFAULT_PROJECT_PLACE_POLICY,
        overrides: {},
      }).decision.reasons,
    ).toEqual([])
    expect(() =>
      planPlaceAdoption({
        facts: source(),
        location,
        candidate: source(),
        policy: automatic,
        overrides: {},
      }),
    ).toThrow('backwards')
    next.placeId = 'other'
    expect(() => plan(next)).toThrow('identity')
  })
})
