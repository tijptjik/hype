import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAuthorizeImageList,
  mockAuthorizeImageRead,
  mockAssertPermissionsToCreateImage,
  mockAssertPermissionsToDeleteImage,
  mockGetImageByIdsQueryContext,
  mockGetImageEntityQueryContext,
  mockGetImageQueryContext,
  mockToImageProfile,
  mockToResponseShape,
  mockToResponseShapeProjectOrOrganisation,
  mockUpdateImageForContext,
  mockCreateFeatureImage,
  mockCreateImageRecord,
  mockLoadImageById,
  mockToImageEnvelope,
  mockGetImageForContextType,
  mockGetImagesByIds,
  mockToImageEntityResponseShape,
  mockToImageListResponseShape,
  mockUpdateOrganisationById,
  mockUpdateProjectById,
  mockGetUserById,
  mockGuardedContext,
  mockCreatePresignedR2UploadUrl,
  mockGetOriginalsBucketNameForStage,
  mockVerifyUploadToken,
} = vi.hoisted(() => ({
  mockAuthorizeImageList: vi.fn(() => ({ allowed: true })),
  mockAuthorizeImageRead: vi.fn(() => ({ allowed: true })),
  mockAssertPermissionsToCreateImage: vi.fn(async () => undefined),
  mockAssertPermissionsToDeleteImage: vi.fn(async () => undefined),
  mockGetImageByIdsQueryContext: vi.fn(() => ({ conditions: [] })),
  mockGetImageEntityQueryContext: vi.fn(() => ({ conditions: [] })),
  mockGetImageQueryContext: vi.fn(() => ({ conditions: [] })),
  mockToImageProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  mockToResponseShape: vi.fn(async (image: any) => image),
  mockToResponseShapeProjectOrOrganisation: vi.fn(async (image: any) => image),
  mockUpdateImageForContext: vi.fn(async () => ({ data: { id: 'img-1' } })),
  mockCreateFeatureImage: vi.fn(async () => ({ id: 'fi-1' })),
  mockCreateImageRecord: vi.fn(async () => ({ id: 'img-1', publicId: null })),
  mockLoadImageById: vi.fn(async () => null),
  mockToImageEnvelope: vi.fn(
    (data: unknown, _profile: string, ctxType: string, ctxId: string) => ({
      data,
      ctxType,
      ctxId,
    }),
  ),
  mockGetImageForContextType: vi.fn(async () => []),
  mockGetImagesByIds: vi.fn(async () => []),
  mockToImageEntityResponseShape: vi.fn((data: unknown, ctx: unknown) => ({
    data,
    ctx,
  })),
  mockToImageListResponseShape: vi.fn((data: unknown) => ({ data })),
  mockUpdateOrganisationById: vi.fn(async () => undefined),
  mockUpdateProjectById: vi.fn(async () => undefined),
  mockGetUserById: vi.fn(async () => ({ attribution: 'attrib' })),
  mockGuardedContext: vi.fn(),
  mockCreatePresignedR2UploadUrl: vi.fn(
    async () => 'https://upload.example.test/object',
  ),
  mockGetOriginalsBucketNameForStage: vi.fn(() => 'hype-images-local'),
  mockVerifyUploadToken: vi.fn(async () => null),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => async (input: unknown) =>
    (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
      input,
      await mockGuardedContext(),
    ),
  guardedCommand: (_schemaOrFn: unknown, maybeHandler?: unknown) => {
    const handler = typeof maybeHandler === 'function' ? maybeHandler : _schemaOrFn
    return async (input: unknown) =>
      (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
  },
}))

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeImageList: mockAuthorizeImageList,
  authorizeImageRead: mockAuthorizeImageRead,
  toAuthMessage: (code: string) => code,
}))

vi.mock('$lib/api/services/image', () => ({
  assertPermissionsToCreateImage: mockAssertPermissionsToCreateImage,
  assertPermissionsToDeleteImage: mockAssertPermissionsToDeleteImage,
  getImageByIdsQueryContext: mockGetImageByIdsQueryContext,
  getImageEntityQueryContext: mockGetImageEntityQueryContext,
  getImageQueryContext: mockGetImageQueryContext,
  toImageProfile: mockToImageProfile,
  toResponseShape: mockToResponseShape,
  toResponseShapeProjectOrOrganisation: mockToResponseShapeProjectOrOrganisation,
  updateImageForContext: mockUpdateImageForContext,
}))

vi.mock('$lib/db/services/image', () => ({
  createFeatureImage: mockCreateFeatureImage,
  createImage: mockCreateImageRecord,
  getImageById: mockLoadImageById,
  toImageEnvelope: mockToImageEnvelope,
  getImageForContextType: mockGetImageForContextType,
  getImagesByIds: mockGetImagesByIds,
  toImageEntityResponseShape: mockToImageEntityResponseShape,
  toImageListResponseShape: mockToImageListResponseShape,
}))

vi.mock('$lib/db/services/organisation', () => ({
  updateOrganisationById: mockUpdateOrganisationById,
}))

vi.mock('$lib/db/services/project', () => ({
  updateProjectById: mockUpdateProjectById,
}))

vi.mock('$lib/db/services/user', () => ({
  getUserById: mockGetUserById,
}))

vi.mock('$lib/server/image-upload-auth', () => ({
  createUploadToken: vi.fn(async () => 'signed-upload-token'),
  verifyUploadToken: mockVerifyUploadToken,
}))

vi.mock('$lib/server/image-storage', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/server/image-storage')>()

  return {
    ...actual,
    createPresignedR2UploadUrl: mockCreatePresignedR2UploadUrl,
    getOriginalsBucketNameForStage: mockGetOriginalsBucketNameForStage,
  }
})

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', () => ({
  AuthImageUploadSchema: {},
  DeleteImageSchema: {},
  FinalizeImageUploadSchema: {},
  GetImageMetadataSchema: {},
  ImageByIdSchema: {},
  ImageInsertWithHubAPI: { parse: (value: unknown) => value },
  ImageInsertWithFeatureAPI: { parse: (value: unknown) => value },
  ImageInsertWithProjectOrOrganisationAPI: { parse: (value: unknown) => value },
  ImagesByContextSchema: {},
  ImagesByIdsSchema: {},
  SetImageIntentSchema: {},
  SetImagePublishedSchema: {},
  UpdateImageSchema: {},
}))

let remote: Awaited<typeof import('$lib/api/server/image.remote')>

const buildDbWithContextRow = (row: Record<string, unknown>) => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [row]),
          })),
        })),
        where: vi.fn(() => ({
          limit: vi.fn(async () => [row]),
        })),
      })),
      where: vi.fn(() => ({
        limit: vi.fn(async () => [row]),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(async () => undefined),
  })),
})

describe('image.remote', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/image.remote')
    vi.clearAllMocks()
    mockGuardedContext.mockResolvedValue({
      db: buildDbWithContextRow({
        isPublished: true,
        isArchived: false,
        resourceHubId: 'hub-a',
      }),
      user: { id: 'u-1', isAnonymous: false },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: true,
      event: {
        request: new Request('https://example.test'),
        locals: { hub: null },
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            CLOUDFLARE_ACCOUNT_ID: 'account-id',
            R2_S3_ACCESS_KEY_ID: 'access-key',
            R2_S3_SECRET_ACCESS_KEY: 'secret-key',
            IMAGE_ORIGINALS_LOCAL: {
              head: vi.fn(async () => null),
              put: vi.fn(async () => undefined),
            },
            IMAGE_ORIGINALS_PREVIEW: {
              head: vi.fn(async () => null),
              put: vi.fn(async () => undefined),
            },
            IMAGE_ORIGINALS_PRODUCTION: {
              head: vi.fn(async () => null),
              put: vi.fn(async () => undefined),
            },
          },
        },
      },
    })
    mockAuthorizeImageList.mockReturnValue({ allowed: true })
    mockAuthorizeImageRead.mockReturnValue({ allowed: true })
  })

  it('denies getImagesForContext when image list authz denies', async () => {
    mockAuthorizeImageList.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getImagesForContext({
        ctxType: 'feature',
        ctxId: 'feature-1',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('denies getImageById when image read authz denies', async () => {
    mockLoadImageById.mockResolvedValue({
      id: 'img-1',
      featureId: 'feature-1',
      contributorId: 'u-1',
    })
    mockAuthorizeImageRead.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(remote.getImageById({ id: 'img-1' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('createImage rejects missing image payload', async () => {
    await expect(remote.createImage({})).rejects.toMatchObject({ status: 400 })
  })

  it('createImage rejects missing ctxType/ctxId', async () => {
    await expect(
      remote.createImage({ data: { title: 'Image' } }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('createImage creates feature-context images', async () => {
    const result = await remote.createImage({
      data: {
        ctxType: 'feature',
        ctxId: 'feature-1',
        featureImage: {},
      },
    })

    expect(mockAssertPermissionsToCreateImage).toHaveBeenCalled()
    expect(mockCreateImageRecord).toHaveBeenCalled()
    expect(mockCreateFeatureImage).toHaveBeenCalled()
    expect(result).toEqual({
      data: {
        data: { id: 'img-1', publicId: null },
        ctxType: 'feature',
        ctxId: 'feature-1',
      },
    })
  })

  it('setImageIntent requires featureId', async () => {
    await expect(
      remote.setImageIntent({
        id: 'img-1',
        ctxType: 'project',
        ctxId: 'project-1',
        intent: 'gallery',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('deleteImage returns 404 when image is missing', async () => {
    mockLoadImageById.mockResolvedValue(null)

    await expect(
      remote.deleteImage({
        id: 'img-1',
        ctxId: 'feature-1',
        ctxType: 'feature',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('authImageUpload returns a direct R2 upload session', async () => {
    const result = await remote.authImageUpload({
      cdn: 'cloudflareR2',
      env: 'local',
      ctxType: 'feature',
      ctxId: 'feature-1',
      filename: 'image.jpg',
      contentType: 'image/jpeg',
      size: 1234,
    })

    expect(mockCreatePresignedR2UploadUrl).toHaveBeenCalled()
    expect(result).toMatchObject({
      publicId: expect.stringContaining('features/feature-1/'),
      uploadUrl: 'https://upload.example.test/object',
      method: 'PUT',
      confirmToken: 'signed-upload-token',
    })
  })

  it('finalizeImageUpload writes metadata sidecars after a confirmed upload', async () => {
    const put = vi.fn(async () => undefined)
    const head = vi.fn(async () => ({
      size: 1234,
      httpMetadata: { contentType: 'image/jpeg' },
    }))

    mockGuardedContext.mockResolvedValue({
      db: buildDbWithContextRow({
        isPublished: true,
        isArchived: false,
        resourceHubId: 'hub-a',
      }),
      user: { id: 'u-1', isAnonymous: false },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: true,
      event: {
        request: new Request('https://example.test'),
        locals: { hub: null },
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            CLOUDFLARE_ACCOUNT_ID: 'account-id',
            R2_S3_ACCESS_KEY_ID: 'access-key',
            R2_S3_SECRET_ACCESS_KEY: 'secret-key',
            IMAGE_ORIGINALS_LOCAL: { head, put },
            IMAGE_ORIGINALS_PREVIEW: { head: vi.fn(async () => null), put },
            IMAGE_ORIGINALS_PRODUCTION: { head: vi.fn(async () => null), put },
          },
        },
      },
    })
    mockVerifyUploadToken.mockResolvedValue({
      publicId: 'features/feature-1/image-a',
      env: 'local',
      ctxType: 'feature',
      ctxId: 'feature-1',
      filename: 'image.jpg',
      contentType: 'image/jpeg',
      size: 1234,
      uploaderUserId: 'u-1',
      exp: Date.now() + 1000,
    })

    const result = await remote.finalizeImageUpload({
      token: 'signed-upload-token',
      metadata: {
        originalFilename: 'image.jpg',
        originalExtension: 'jpg',
        originalWidth: 100,
        originalHeight: 200,
        cameraModel: null,
        capturedAt: null,
        credit: null,
        latitude: null,
        longitude: null,
        metadata: null,
      },
    })

    expect(head).toHaveBeenCalledWith('features/feature-1/image-a')
    expect(put).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      cdn: 'cloudflareR2',
      env: 'local',
      publicId: 'features/feature-1/image-a',
      ctxType: 'feature',
      ctxId: 'feature-1',
    })
  })
})
