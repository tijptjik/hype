import { describe, expect, it } from 'vitest'
import { parseAddressContent, AddressContentSchema } from '@saanseoi/address'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { retainAuthoredAddress } from '#lib/locations/authoredAddress.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

describe('shared address parsing and local source overlays', () => {
  it('extracts units without inventing a building or dropping unresolved text', () => {
    const source = { en: 'Shop 18, G/F, Smithfield Court, 43 Smithfield' }
    const parsed = parseAddressContent(source)
    expect(AddressContentSchema.safeParse(parsed.content).success).toBe(true)
    expect(parsed.content.unit).toMatchObject({
      unitRef: '18',
      unitType: 'S',
      floorType: 'G',
    })
    expect(parsed.content.i18n.en.buildingName).toBeUndefined()
    expect(parsed.source).toEqual(source)
    expect(parsed.unresolved.en).toContain('SMITHFIELD')
    const address = emptyFeatureAddress()
    address.source.authored = parsed.content
    const display = getAddressDisplay(address, 'en')
    expect(display.match(/Shop 18/g)).toHaveLength(1)
    expect(display).toContain('Smithfield Court')
  })
  it('does not arbitrarily pick conflicting multilingual units', () => {
    const result = parseAddressContent({
      en: 'Shop 18, G/F, Example Road',
      'zh-hant': '地下19舖例子道',
    })
    expect(result.content.unit).toBeNull()
    expect(result.content.i18n.en.formattedAddress).toContain('Shop 18')
    expect(result.content.i18n['zh-hant'].formattedAddress).toContain('19')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
  it('keeps new upstream canonical address evidence while preserving the local overlay', () => {
    const authored = parseAddressContent({ en: 'Shop 18, G/F, Example Road' }).content
    const oldAddress = {
      status: 'unresolved' as const,
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: {},
      authored,
    }
    const facts = {
      names: { en: 'Shop' },
      phoneNumber: [],
      brands: [],
      location: {
        geometry: {
          type: 'Point' as const,
          coordinates: [114, 22] as [number, number],
        },
        address: oldAddress,
      },
    }
    const canonical = {
      ...oldAddress,
      authored: undefined,
      status: 'resolved' as const,
      address2dId: 'new-address',
      snapshotId: 'snapshot',
      rawSource: { retained: 'evidence' },
    }
    const projection = {
      facts: { ...facts, location: { ...facts.location, address: canonical } },
      rawSource: { resource: { id: 'source' } },
    } as unknown as SaanSeoiPlaceProjection
    const result = retainAuthoredAddress(projection, {
      facts,
      rawSource: { localAddress: { actorId: 'author' } },
    })
    expect(result.facts.location.address.authored).toEqual(authored)
    expect(result.rawSource.sourceAddress).toEqual(canonical)
    expect(result.rawSource.resource).toEqual(projection.rawSource.resource)
    expect(projection.facts.location.address).toEqual(canonical)
  })
})
