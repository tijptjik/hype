import { describe, expect, it } from 'vitest'
import { projectSaanSeoiPlace } from '#lib/places/saanseoi.js'

const resource = {
  type: 'places',
  id: 'canonical-place',
  attributes: {
    geometry: { type: 'Point', coordinates: [114.17, 22.3] },
    snapshotId: 'snapshot',
    resourceReleaseId: 'source-release',
    addressSnapshotId: 'addresses-snapshot',
    address2dId: 'address',
    address3dId: null,
    address3dUnitId: null,
    phones: ['2345 6789', '91234567', 'invalid'],
    identifiers: { wikidata: { brandId: 'Q123' } },
    i18n: {
      en: { name: 'Shop', brandName: 'Brand', freeformAddress: 'Early address' },
      'zh-Hant': { name: '店', brandName: '品牌' },
    },
    sources: [{ dataset: 'overture', license: 'source-license' }],
  },
}
const meta = {
  apiReleaseSet: 'publication',
  resolvedApiVersion: '0.1',
  schemaVersion: 'sv-place-v1',
}
const pin = { apiReleaseSet: 'publication', snapshotId: 'snapshot' }

describe('SaanSeoi full Place projection', () => {
  it('retains phone arrays, brand identity/locales and raw attribution without pretending addresses are resolved', () => {
    const result = projectSaanSeoiPlace(resource, meta, pin)
    expect(result.facts.phoneNumber).toEqual(['+85223456789', '+85291234567'])
    expect(result.facts.brands).toEqual([
      { identifiers: { wikidata: 'Q123' }, names: { en: 'Brand', 'zh-Hant': '品牌' } },
    ])
    expect(result.facts.names).toEqual({ en: 'Shop', 'zh-Hant': '店' })
    expect(result.facts.location.address).toMatchObject({
      status: 'unresolved',
      address2dId: 'address',
      addressSnapshotId: 'addresses-snapshot',
    })
    expect(result.issues).toEqual([
      { kind: 'invalidPhone', index: 2, value: 'invalid' },
      { kind: 'addressRecordsPending' },
    ])
    expect(result.payload).toEqual({ resource, meta })
    expect(result.releaseId).toBe('source-release')
  })
  it('rejects mixed publications and partial records rather than treating absent fields as empty', () => {
    expect(() =>
      projectSaanSeoiPlace(resource, meta, { ...pin, apiReleaseSet: 'other' }),
    ).toThrow('checkpoint')
    expect(() =>
      projectSaanSeoiPlace(resource, meta, { ...pin, snapshotId: 'other' }),
    ).toThrow('checkpoint')
    expect(() =>
      projectSaanSeoiPlace(
        { ...resource, attributes: { ...resource.attributes, phones: undefined } },
        meta,
        pin,
      ),
    ).toThrow()
  })
  it('accepts explicit empty collections and name-only brands without inventing identifiers', () => {
    const result = projectSaanSeoiPlace(
      {
        ...resource,
        attributes: { ...resource.attributes, phones: [], identifiers: null },
      },
      meta,
      pin,
    )
    expect(result.facts.phoneNumber).toEqual([])
    expect(result.facts.brands[0].identifiers).toEqual({})
    expect(result.issues).toEqual([{ kind: 'addressRecordsPending' }])
  })
})
