import { describe, expect, it, vi } from 'vitest'

import { normalizeUploadFileForAssetPipeline } from '$lib/images/upload'

describe('image upload normalization', () => {
  it('leaves non-HEIC uploads unchanged', async () => {
    const file = new File(['jpeg'], 'example.jpg', { type: 'image/jpeg' })

    const result = await normalizeUploadFileForAssetPipeline(file, vi.fn())

    expect(result).toBe(file)
  })

  it('converts HEIC uploads to jpeg files', async () => {
    const file = new File(['heic'], 'example.heic', { type: 'image/heic' })
    const convert = vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' }))

    const result = await normalizeUploadFileForAssetPipeline(file, convert)

    expect(convert).toHaveBeenCalledWith({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })
    expect(result).not.toBe(file)
    expect(result.name).toBe('example.jpg')
    expect(result.type).toBe('image/jpeg')
    expect(await result.text()).toBe('jpeg')
  })
})
