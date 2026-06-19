// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TYPES
import type { ALSResult } from '$lib/types'

const { mockTranslateText } = vi.hoisted(() => ({
  mockTranslateText: vi.fn(),
}))

vi.mock('$lib/api/external/translation', () => ({
  translateText: mockTranslateText,
}))

describe('processForwardGeocodeResult', () => {
  const previousPlatform = (globalThis as typeof globalThis & { platform?: unknown })
    .platform

  beforeEach(() => {
    mockTranslateText.mockReset()
    ;(globalThis as typeof globalThis & { platform?: unknown }).platform = {
      env: {
        PUBLIC_AZURE_TRANSLATION_REGION: 'eastasia',
        AZURE_TRANSLATION_KEY: 'key-1',
      },
    }
  })

  afterEach(() => {
    ;(globalThis as typeof globalThis & { platform?: unknown }).platform =
      previousPlatform
  })

  it('maps translated chinese address properties back by key and preserves missing values', async () => {
    mockTranslateText.mockResolvedValue(['简体展示地址', '简体楼名', '简体门牌'])

    const { processForwardGeocodeResult } = await import('$lib/api/external/geocoding')
    const alsResult: ALSResult = {
      RequestAddress: {
        AddressLine: ['原始地址'],
      },
      SuggestedAddress: [
        {
          Address: {
            PremisesAddress: {
              GeoAddress: 'GA-123',
              GeospatialInformation: {
                Easting: '0',
                Northing: '0',
                Longitude: '114.123',
                Latitude: '22.321',
              },
              EngPremisesAddress: {
                BuildingName: 'Test Building',
                EngStreet: {
                  BuildingNoFrom: '1',
                  BuildingNoTo: '3',
                  StreetName: 'Queen Road Central',
                },
                EngBlock: {
                  BlockDescriptor: 'Block',
                  BlockNo: 'A',
                  BlockDescriptorPrecedenceIndicator: 'Y',
                },
                EngEstate: {
                  EstateName: 'Test Estate',
                  EngPhase: {
                    PhaseName: 'Phase',
                    PhaseNo: '2',
                  },
                },
                EngDistrict: {
                  DcDistrict: 'CW',
                },
                Region: 'HK',
              },
              ChiPremisesAddress: {
                BuildingName: '測試大廈',
                ChiStreet: {
                  BuildingNoFrom: '1',
                  BuildingNoTo: '3',
                  StreetName: '皇后大道中',
                },
                ChiBlock: {
                  BlockDescriptor: '座',
                  BlockNo: 'A',
                },
                ChiEstate: {
                  EstateName: '測試屋苑',
                },
                ChiDistrict: {
                  DcDistrict: 'CW',
                },
                Region: '香港',
              },
            },
          },
          ValidationInformation: {
            Score: 92,
          },
        },
      ],
    }

    const result = await processForwardGeocodeResult(
      alsResult,
      null,
      false,
      114.12,
      22.32,
      null,
      '原始地址',
    )

    expect(mockTranslateText).toHaveBeenCalledOnce()
    expect(result?.i18n.zhHans.displayAddress).toBe('简体展示地址')
    expect(result?.i18n.zhHans.addressProperties.buildingName).toBe('简体楼名')
    expect(result?.i18n.zhHans.addressProperties.buildingNumberFrom).toBe('简体门牌')
    expect(result?.i18n.zhHans.addressProperties.buildingNumberTo).toBe('3')
    expect(result?.i18n.zhHans.addressProperties.rawAddress).toBe('原始地址')
  })
})
