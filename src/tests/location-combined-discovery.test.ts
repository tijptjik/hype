// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { discoverLocations } from '#lib/locations/combinedDiscovery.js'
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

  it('qualifies source identity independently of locally authored entity kinds', () => {
    expect(locationSourceReference('id')).toEqual({
      provider: 'saanseoi',
      family: 'places',
      id: 'id',
    })
    expect(locationSourceReference(null)).toBeNull()
    expect(LocalLocationInputSchema.shape.kind.parse(undefined)).toBe('establishment')
    expect(LocalLocationInputSchema.shape.kind.safeParse('building').success).toBe(true)
    expect(LocalLocationInputSchema.shape.kind.safeParse('natural').success).toBe(true)
  })
})
