import { describe, expect, it, vi } from 'vitest'

import { normalizeUploadFileForAssetPipeline } from '$lib/images/upload'

const installImageFailureStub = (): void => {
  vi.stubGlobal(
    'Image',
    class {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      naturalWidth = 0
      naturalHeight = 0
      width = 0
      height = 0

      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    },
  )

  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
}

describe('image upload normalization', () => {
  it('leaves non-HEIC uploads unchanged', async () => {
    installImageFailureStub()
    const file = new File(['jpeg'], 'example.jpg', { type: 'image/jpeg' })

    const result = await normalizeUploadFileForAssetPipeline(file, vi.fn())

    expect(result.file).toBe(file)
    expect(result.originalFilename).toBe('example.jpg')
    expect(result.originalExtension).toBe('jpg')
    expect(result.wasResized).toBe(false)
  })

  it('converts HEIC uploads to jpeg files', async () => {
    installImageFailureStub()
    const file = new File(['heic'], 'example.heic', { type: 'image/heic' })
    const convert = vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' }))

    const result = await normalizeUploadFileForAssetPipeline(file, convert)

    expect(convert).toHaveBeenCalledWith({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })
    expect(result.file).not.toBe(file)
    expect(result.file.name).toBe('example.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.originalFilename).toBe('example.heic')
    expect(result.originalExtension).toBe('heic')
    expect(result.wasResized).toBe(false)
    expect(await result.file.text()).toBe('jpeg')
  })
})
