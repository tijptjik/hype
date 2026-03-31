import { describe, expect, it } from 'vitest'

import { resolveAppStage } from '$lib/index'

describe('resolveAppStage', () => {
  it('classifies preview app and asset hosts as preview', () => {
    expect(resolveAppStage('https://preview.hype.hk')).toBe('preview')
    expect(resolveAppStage('https://breadline.preview.hype.hk')).toBe('preview')
    expect(resolveAppStage('https://assets.preview.hype.hk')).toBe('preview')
    expect(resolveAppStage('https://raw.assets.preview.hype.hk')).toBe('preview')
  })

  it('classifies production hosts as production', () => {
    expect(resolveAppStage('https://hype.hk')).toBe('production')
    expect(resolveAppStage('https://assets.hype.hk')).toBe('production')
    expect(resolveAppStage('https://breadline.hk')).toBe('production')
  })

  it('falls back to local for unknown hosts', () => {
    expect(resolveAppStage('http://localhost:5173')).toBe('local')
    expect(resolveAppStage('')).toBe('local')
  })
})
