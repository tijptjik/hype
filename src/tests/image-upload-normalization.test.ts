import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createPreviewableUploadFile,
  normalizeUploadFileForAssetPipeline,
} from '$lib/images/upload'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const installLargeImageStub = (): HTMLCanvasElement => {
  vi.stubGlobal(
    'Image',
    class {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      naturalWidth = 4096
      naturalHeight = 2048
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
  let nextUrl = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:test-${nextUrl++}`),
    revokeObjectURL: vi.fn(),
  })
  const canvas = document.createElement('canvas')
  vi.spyOn(document, 'createElement').mockReturnValue(canvas)
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback, type) => {
    callback(new Blob(['encoded'], { type }))
  })
  return canvas
}

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
  it('keeps PNG fallback bytes consistent with the resized MIME type and filename', async () => {
    const canvas = installLargeImageStub()
    vi.mocked(canvas.toBlob).mockImplementation(callback => {
      callback(new Blob(['png'], { type: 'image/png' }))
    })
    const result = await normalizeUploadFileForAssetPipeline(
      new File(['webp'], 'example.webp', { type: 'image/webp' }),
    )
    expect(result.file.type).toBe('image/png')
    expect(result.file.name).toBe('example.png')
    expect(result.originalFilename).toBe('example.webp')
    expect(result.originalExtension).toBe('webp')
  })

  it.each(['photo', 'photo.', '.photo'])(
    'does not invent an extension for %s',
    async name => {
      installImageFailureStub()
      const result = await normalizeUploadFileForAssetPipeline(
        new File(['jpeg'], name, { type: 'image/jpeg' }),
      )
      expect(result.originalExtension).toBeNull()
      expect(result.originalFilename).toBe(name)
    },
  )

  it('renames resized AVIF uploads to JPEG while retaining original metadata', async () => {
    installLargeImageStub()
    const file = new File(['avif'], 'example.AVIF', {
      type: 'image/avif',
      lastModified: 123,
    })
    const result = await normalizeUploadFileForAssetPipeline(file)

    expect(result.file.name).toBe('example.jpg')
    expect(result.file.type).toBe('image/jpeg')
    expect(result.file.lastModified).toBe(123)
    expect(result.originalFilename).toBe('example.AVIF')
    expect(result.originalExtension).toBe('avif')
    expect(result.uploadedWidth).toBe(2048)
    expect(result.uploadedHeight).toBe(1024)
    expect(result.wasResized).toBe(true)
  })

  it('releases every image URL when resize cannot obtain a canvas context', async () => {
    const canvas = installLargeImageStub()
    vi.mocked(canvas.getContext).mockReturnValue(null)

    await expect(
      normalizeUploadFileForAssetPipeline(
        new File(['jpeg'], 'example.jpg', { type: 'image/jpeg' }),
      ),
    ).rejects.toThrow('Could not initialize a 2D canvas context for image resize')

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    )
    for (const result of vi.mocked(URL.createObjectURL).mock.results) {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(result.value)
    }
  })

  it.each(['image/avif', 'image/jpeg'])(
    'rejects a throwing canvas encoder and releases URLs for %s',
    async type => {
      const canvas = installLargeImageStub()
      vi.mocked(canvas.toBlob).mockImplementation(() => {
        throw new Error('Encoder failed')
      })

      await expect(
        normalizeUploadFileForAssetPipeline(new File(['image'], 'example', { type })),
      ).rejects.toThrow('Encoder failed')
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(
        vi.mocked(URL.createObjectURL).mock.calls.length,
      )
    },
  )

  it('rejects AVIF drawing failures instead of leaving the upload pending', async () => {
    const canvas = installLargeImageStub()
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Missing test canvas context')
    vi.mocked(context.drawImage).mockImplementation(() => {
      throw new Error('Drawing failed')
    })

    await expect(
      normalizeUploadFileForAssetPipeline(
        new File(['avif'], 'example.avif', { type: 'image/avif' }),
      ),
    ).rejects.toThrow('Drawing failed')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    )
  })

  it.each(['image/avif', 'image/jpeg'])(
    'rejects empty encoder output and releases URLs for %s',
    async type => {
      const canvas = installLargeImageStub()
      vi.mocked(canvas.toBlob).mockImplementation(callback => callback(null))

      await expect(
        normalizeUploadFileForAssetPipeline(new File(['image'], 'example', { type })),
      ).rejects.toThrow('Canvas encoding did not produce an image blob')
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(
        vi.mocked(URL.createObjectURL).mock.calls.length,
      )
    },
  )

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
