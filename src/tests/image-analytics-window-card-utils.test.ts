import { describe, expect, it } from 'vitest'
import {
  buildAssetAnalyticsPreviewUrl,
  normalizeAssetAnalyticsPublicId,
  toAnalyticsTransformationBadges,
} from '$lib/bits/patterns/analytics/assetAnalyticsDashboard/assetAnalyticsDashboard.utils'

describe('analytics window card utils', () => {
  it('normalizes analytics public ids for asset delivery urls', () => {
    expect(normalizeAssetAnalyticsPublicId('h/ghostmappers/example')).toBe(
      'ghostmappers/example',
    )
    expect(normalizeAssetAnalyticsPublicId('ghostmappers/example')).toBe(
      'ghostmappers/example',
    )
  })

  it('builds preview urls against the environment asset host', () => {
    expect(
      buildAssetAnalyticsPreviewUrl({
        publicId: 'h/ghostmappers/example',
        environment: 'production',
      }),
    ).toBe(
      'https://assets.hype.hk/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/h/ghostmappers/example',
    )

    expect(
      buildAssetAnalyticsPreviewUrl({
        publicId: 'h/ghostmappers/example',
        environment: 'preview',
      }),
    ).toBe(
      'https://assets.preview.hype.hk/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/h/ghostmappers/example',
    )
  })

  it('formats transform keys into concise badges', () => {
    expect(
      toAnalyticsTransformationBadges('c_fill,h_630,w_1200,g_auto,f_webp,q_auto'),
    ).toEqual([
      { category: 'cropMode', label: 'Fill' },
      { category: 'dimensions', label: '1200x630' },
      { category: 'gravity', label: 'G:Auto' },
      { category: 'format', label: 'WEBP' },
      { category: 'quality', label: 'Q:Auto' },
    ])

    expect(
      toAnalyticsTransformationBadges(
        'w=1200,h=630,fit=cover,gravity=auto,format=webp,quality=auto',
      ),
    ).toEqual([
      { category: 'dimensions', label: '1200x630' },
      { category: 'cropMode', label: 'Cover' },
      { category: 'gravity', label: 'G:Auto' },
      { category: 'format', label: 'WEBP' },
      { category: 'quality', label: 'Q:Auto' },
    ])
  })
})
