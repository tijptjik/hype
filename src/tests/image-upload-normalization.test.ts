import { describe, expect, it, vi } from 'vitest'

import {
  createPreviewableUploadFile,
  normalizeUploadFileForAssetPipeline,
} from '$lib/images/upload'

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

  it('converts TIFF uploads to jpeg files without native image decode support', async () => {
    installImageFailureStub()
    const file = new File(['tiff'], 'example.tiff', { type: 'image/tiff' })
    const convertTiff = vi.fn(async sourceFile => {
      expect(sourceFile).toBe(file)

      return new File(['jpeg'], 'example.jpg', {
        type: 'image/jpeg',
        lastModified: sourceFile.lastModified,
      })
    })

    const result = await normalizeUploadFileForAssetPipeline(file, null, convertTiff)

    expect(convertTiff).toHaveBeenCalledOnce()
    expect(result.file).not.toBe(file)
    expect(result.file.name).toBe('example.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.originalFilename).toBe('example.tiff')
    expect(result.originalExtension).toBe('tiff')
    expect(result.wasResized).toBe(false)
    expect(await result.file.text()).toBe('jpeg')
  })

  it('creates a previewable jpeg file for TIFF uploads', async () => {
    const file = new File(['tiff'], 'preview.tiff', { type: 'image/tiff' })
    const convertTiff = vi.fn(async sourceFile => {
      expect(sourceFile).toBe(file)

      return new File(['jpeg'], 'preview.jpg', {
        type: 'image/jpeg',
        lastModified: sourceFile.lastModified,
      })
    })

    const previewFile = await createPreviewableUploadFile(file, null, convertTiff)

    expect(convertTiff).toHaveBeenCalledOnce()
    expect(previewFile.name).toBe('preview.jpg')
    expect(previewFile.type).toBe('image/jpeg')
    expect(await previewFile.text()).toBe('jpeg')
  })

  it('converts JXL uploads to jpeg files', async () => {
    installImageFailureStub()
    const file = new File(['jxl'], 'example.jxl', { type: 'image/jxl' })
    const convertJxl = vi.fn(async sourceFile => {
      expect(sourceFile).toBe(file)

      return new File(['jpeg'], 'example.jpg', {
        type: 'image/jpeg',
        lastModified: sourceFile.lastModified,
      })
    })

    const result = await normalizeUploadFileForAssetPipeline(
      file,
      null,
      null,
      convertJxl,
    )

    expect(convertJxl).toHaveBeenCalledOnce()
    expect(result.file).not.toBe(file)
    expect(result.file.name).toBe('example.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.originalFilename).toBe('example.jxl')
    expect(result.originalExtension).toBe('jxl')
    expect(result.wasResized).toBe(false)
    expect(await result.file.text()).toBe('jpeg')
  })

  it('creates a previewable jpeg file for JXL uploads', async () => {
    const file = new File(['jxl'], 'preview.jxl', { type: 'image/jxl' })
    const convertJxl = vi.fn(async sourceFile => {
      expect(sourceFile).toBe(file)

      return new File(['jpeg'], 'preview.jpg', {
        type: 'image/jpeg',
        lastModified: sourceFile.lastModified,
      })
    })

    const previewFile = await createPreviewableUploadFile(file, null, null, convertJxl)

    expect(convertJxl).toHaveBeenCalledOnce()
    expect(previewFile.name).toBe('preview.jpg')
    expect(previewFile.type).toBe('image/jpeg')
    expect(await previewFile.text()).toBe('jpeg')
  })
})
