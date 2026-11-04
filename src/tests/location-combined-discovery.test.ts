// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  discoverLocations,
  discoverLocationKind,
} from '#lib/locations/combinedDiscovery.js'
import {
  locationSourceReference,
  type AvailableDiscoveryType,
} from '#lib/locations/kinds.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'

describe('unified Location discovery', () => {
  it('keeps establishment and address identities distinct and preserves incomplete coverage', async () => {
    const providers = {
      establishment: vi.fn(async () => ({
        rows: [{ type: 'establishment', id: 'same' }],
        partial: false,
        limited: true,
      })),
      address: vi.fn(async () => ({
        rows: [{ type: 'address', id: 'same' }],
        partial: true,
        limited: false,
      })),
    }
    const found = await discoverLocations(
      ['establishment', 'address', 'establishment'],
      providers,
    )
    expect(found.rows).toEqual([
      { type: 'establishment', id: 'same' },
      { type: 'address', id: 'same' },
    ])
    expect(found).toMatchObject({ partial: true, limited: true })
    expect(providers.establishment).toHaveBeenCalledTimes(1)
  })

  it('retains successful address results when the establishment source is unavailable', async () => {
    const found = await discoverLocations(['establishment', 'address'], {
      establishment: async () => {
        throw new Error('Source unavailable')
      },
      address: async () => ({ rows: ['address'], partial: false, limited: false }),
    })
    expect(found).toEqual({ rows: ['address'], partial: true, limited: false })
  })

  it('never calls deselected or unsupported source families', async () => {
    const providers = {
      establishment: vi.fn(async () => ({ rows: [], partial: false, limited: false })),
      address: vi.fn(async () => ({ rows: [], partial: false, limited: false })),
    }
    await discoverLocations(['address'], providers)
    expect(providers.establishment).not.toHaveBeenCalled()
    expect(providers.address).toHaveBeenCalledTimes(1)
    await expect(
      discoverLocations(['building' as AvailableDiscoveryType], providers),
    ).rejects.toThrow()
    expect(providers.establishment).not.toHaveBeenCalled()
    expect(providers.address).toHaveBeenCalledTimes(1)
    expect(await discoverLocations([], providers)).toEqual({
      rows: [],
      partial: false,
      limited: false,
    })
  })

  it('qualifies source identity independently of the supported authored entity kinds', () => {
    expect(locationSourceReference('id')).toEqual({
      provider: 'saanseoi',
      family: 'places',
      id: 'id',
    })
    expect(locationSourceReference(null)).toBeNull()
    expect(LocalLocationInputSchema.shape.kind.parse(undefined)).toBe('establishment')
    expect(LocalLocationInputSchema.shape.kind.safeParse('building').success).toBe(true)
    expect(LocalLocationInputSchema.shape.kind.safeParse('natural').success).toBe(true)
    expect(LocalLocationInputSchema.shape.kind.safeParse('address').success).toBe(true)
  })

  it.each([
    ['unknown', ['establishment', 'building', 'address']],
    ['establishment', ['establishment', 'building', 'address']],
    ['building', ['building', 'address']],
    ['address', ['address']],
    ['natural', ['natural']],
  ] as const)(
    'routes %s discovery to its compatible families',
    async (kind, families) => {
      const providers = {
        establishment: vi.fn(async () => ({
          rows: ['establishment'],
          partial: false,
          limited: false,
        })),
        building: vi.fn(async () => ({
          rows: ['building'],
          partial: false,
          limited: false,
        })),
        address: vi.fn(async () => ({
          rows: ['address'],
          partial: false,
          limited: false,
        })),
        natural: vi.fn(async () => ({
          rows: ['natural'],
          partial: false,
          limited: false,
        })),
      }
      const found = await discoverLocationKind(kind, providers)
      expect(found.rows).toEqual(families)
      expect(found.partial).toBe(false)
      for (const [family, provider] of Object.entries(providers))
        expect(provider).toHaveBeenCalledTimes(
          families.some(item => item === family) ? 1 : 0,
        )
    },
  )

  it('reports the missing Buildings adapter while retaining successful address results', async () => {
    const found = await discoverLocationKind('building', {
      address: async () => ({ rows: ['address'], partial: false, limited: false }),
    })
    expect(found).toEqual({
      rows: ['address'],
      partial: true,
      limited: false,
      unavailable: ['building'],
    })
  })
})
