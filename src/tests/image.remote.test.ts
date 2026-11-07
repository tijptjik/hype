import { mockedRemoteModule, type MockedRemoteModule } from './remote-function-mock'
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import sharp from 'sharp'
import { withRemoteMeta } from './remote-function-mock'

// These legacy-path fixtures intentionally model a database before logo rollout.
// Enrolled logo transactions and permissions use SQLite fixtures in resource-logo tests.
vi.mock('#lib/db/services/resourceLogoSnapshot.js', () => ({ hasResourceLogoStorage: vi.fn(async () => false) }))

const {
  mockAuthorizeImageList,
  mockAuthorizeImageRead,
  mockAssertPermissionsToCreateImage,
  mockAssertPermissionsToDeleteImage,
  mockAssertPermissionsToUpdateImage,
  mockGetImageByIdsQueryContext,
  mockGetImageEntityQueryContext,
  mockGetImageQueryContext,
  mockEnqueueDerivedAssetWarmup,
  mockToImageProfile,
  mockToResponseShape,
  mockToResponseShapeProjectOrOrganisation,
  mockUpdateImageForContext,
  mockCreateFeatureImage,
  mockCreateUploadedFeatureImage,
  mockCreateUploadedResourceImage,
  mockGetResourceUploadSnapshot,
  mockCreateImageRecord,
  mockLoadFeatureCanonicalImageOccupancy,
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
  mockReadMetadataDocument,
  mockVerifyUploadToken,
  mockWaitUntil,
  mockHasImageStorageReference,
  mockRemoveOrganisationImage,
  mockReadImageRevisionDelivery,
  mockSaveFeatureImageMetadataDraft,
} = vi.hoisted(() => ({
  mockSaveFeatureImageMetadataDraft: vi.fn(async (): Promise<unknown> => ({ status: 'legacy' })),
  mockReadImageRevisionDelivery: vi.fn(async (): Promise<unknown> => null),
  mockRemoveOrganisationImage: vi.fn(async () => true),
  mockHasImageStorageReference: vi.fn(async () => false),
  mockAuthorizeImageList: vi.fn((): { allowed: boolean; code?: string } => ({
    allowed: true,
  })),
  mockAuthorizeImageRead: vi.fn((): { allowed: boolean; code?: string } => ({
    allowed: true,
  })),
  mockAssertPermissionsToCreateImage: vi.fn(async () => undefined),
  mockAssertPermissionsToDeleteImage: vi.fn(async () => undefined),
  mockAssertPermissionsToUpdateImage: vi.fn(async () => undefined),
  mockGetImageByIdsQueryContext: vi.fn(() => ({ conditions: [] })),
  mockGetImageEntityQueryContext: vi.fn(() => ({ conditions: [] })),
  mockGetImageQueryContext: vi.fn(() => ({ conditions: [] })),
  mockEnqueueDerivedAssetWarmup: vi.fn(async () => undefined),
  mockToImageProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  mockToResponseShape: vi.fn(async (image: unknown) => image),
  mockToResponseShapeProjectOrOrganisation: vi.fn(async (image: unknown) => image),
  mockUpdateImageForContext: vi.fn(async () => ({ data: { id: 'img-1' } })),
  mockCreateUploadedFeatureImage: vi.fn(),
  mockCreateUploadedResourceImage: vi.fn(),
  mockGetResourceUploadSnapshot: vi.fn(),
  mockCreateFeatureImage: vi.fn(async () => ({ id: 'fi-1' })),
  mockCreateImageRecord: vi.fn(async () => ({
    id: 'img-1',
    publicId: null as string | null,
  })),
  mockLoadFeatureCanonicalImageOccupancy: vi.fn(async () => ['feature-1']),
  mockLoadImageById: vi.fn(async (): Promise<unknown> => null),
  mockToImageEnvelope: vi.fn(
    (data: unknown, _profile: string, ctxType: string, ctxId: string) => ({
      data,
      ctxType,
      ctxId,
    }),
  ),
  mockGetImageForContextType: vi.fn(
    async (
      ..._args: Parameters<
        typeof import('#lib/db/services/image.js').getImageForContextType
      >
    ) => [],
  ),
  mockGetImagesByIds: vi.fn(async (): Promise<unknown[]> => []),
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
  mockGetOriginalsBucketNameForStage: vi.fn(() => 'hype-assets-raw-dev'),
  mockReadMetadataDocument: vi.fn(
    async (): Promise<{
      document: Record<string, unknown> | null
      resolvedEnv: string
      resolvedVersion: number | undefined
    }> => ({
      document: null,
      resolvedEnv: 'local',
      resolvedVersion: undefined,
    }),
  ),
  mockVerifyUploadToken: vi.fn(async (): Promise<unknown> => null),
  mockWaitUntil: vi.fn(),
}))

vi.mock('#lib/db/services/imageRevisionDelivery.js', () => ({
  readImageRevisionDelivery: mockReadImageRevisionDelivery,
}))
vi.mock('#lib/db/services/featureGalleryCommands.js', () => ({
  removeAcceptedFeatureImage: vi.fn(async () => 'legacy'),
  prepareFeatureGalleryAssignmentCapture: vi.fn(async () => ({ before: [], after: [], revisionId: null })),
}))
vi.mock('#lib/db/services/featureImageMetadataRevision.js', () => ({
  saveFeatureImageMetadataDraft: mockSaveFeatureImageMetadataDraft,
}))
vi.mock('#lib/db/services/featureImageUploadRevision.js', () => ({
  hasFeatureRevisionHead: vi.fn(async () => false),
  saveFeatureImageUploadDraft: vi.fn(),
}))

vi.mock('#lib/db/services/imageCleanup.js', async original => ({
  ...(await original<object>()),
  hasImageStorageReference: mockHasImageStorageReference,
}))

vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'query'),
  guardedCommand: (_schemaOrFn: unknown, maybeHandler?: unknown) => {
    const handler = typeof maybeHandler === 'function' ? maybeHandler : _schemaOrFn
    return withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'command')
  },
}))

vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeImageList: mockAuthorizeImageList,
  authorizeImageRead: mockAuthorizeImageRead,
  toAuthMessage: (code: string) => code,
}))

vi.mock('#lib/api/services/image.js', () => ({
  assertPermissionsToCreateImage: mockAssertPermissionsToCreateImage,
  assertPermissionsToDeleteImage: mockAssertPermissionsToDeleteImage,
  assertPermissionsToUpdateImage: mockAssertPermissionsToUpdateImage,
  getImageByIdsQueryContext: mockGetImageByIdsQueryContext,
  getImageEntityQueryContext: mockGetImageEntityQueryContext,
  getImageQueryContext: mockGetImageQueryContext,
  enqueueDerivedAssetWarmup: mockEnqueueDerivedAssetWarmup,
  toImageProfile: mockToImageProfile,
  toResponseShape: mockToResponseShape,
  toResponseShapeProjectOrOrganisation: mockToResponseShapeProjectOrOrganisation,
  updateImageForContext: mockUpdateImageForContext,
}))

vi.mock('#lib/db/services/imageUpload.js', () => ({
  createUploadedFeatureImage: mockCreateUploadedFeatureImage,
  getFeatureImageCreationScope: vi.fn(async () => ({
    projectId: 'project',
    organisationId: 'organisation',
    hubId: 'hub',
  })),
}))

vi.mock('#lib/db/services/image.js', () => ({
  createFeatureImage: mockCreateFeatureImage,
  createImage: mockCreateImageRecord,
  createUploadedImage: vi.fn(async () => mockCreateImageRecord()),
  getFeatureCanonicalImageOccupancy: mockLoadFeatureCanonicalImageOccupancy,
  getImageById: mockLoadImageById,
  toImageEnvelope: mockToImageEnvelope,
  getImageForContextType: mockGetImageForContextType,
  getImagesByIds: mockGetImagesByIds,
  toImageEntityResponseShape: mockToImageEntityResponseShape,
  toImageListResponseShape: mockToImageListResponseShape,
}))

vi.mock('#lib/db/services/organisation.js', () => ({
  updateOrganisationById: mockUpdateOrganisationById,
}))

vi.mock('#lib/db/services/project.js', () => ({
  updateProjectById: mockUpdateProjectById,
}))

vi.mock('#lib/db/services/user.js', () => ({
  getUserById: mockGetUserById,
}))

vi.mock('coordinate-parser', () => ({
  default: class Coordinates {
    getLatitude(): number {
      return 0
    }

    getLongitude(): number {
      return 0
    }
  },
}))

vi.mock('#lib/db/services/organisationImage.js', async () => ({
  removeOrganisationImage: mockRemoveOrganisationImage,
  organisationImageDeletionGuard: async () => (await import('drizzle-orm')).sql`1`,
}))

vi.mock('#lib/db/services/resourceImageUpload.js', () => ({
  createUploadedResourceImage: mockCreateUploadedResourceImage,
  getResourceUploadSnapshot: mockGetResourceUploadSnapshot,
}))

vi.mock('#lib/db/services/imageMutationScope.js', async () => {
  const { sql } = await import('drizzle-orm')
  return {
    getImageMutationSnapshot: vi.fn(async () => ({
      imageId: 'img-1',
      imageRevision: 'revision',
      assignmentRevision: 'assignment',
      scope: 'scope',
      source: { publicId: 'old-key', env: 'local', version: 1 },
    })),
    createImageMutationGuards: vi.fn(() => ({ before: sql`1`, after: sql`1` })),
  }
})

vi.mock('#lib/images/auth.js', () => ({
  createUploadToken: vi.fn(async () => 'signed-upload-token'),
  verifyUploadToken: mockVerifyUploadToken,
}))

vi.mock('#lib/images/delivery.js', () => ({
  toImageRawIntermediateWorkerPath: vi.fn(
    ({ publicId, version }) => `/image/raw/h_2048,w_2048/v${version}/${publicId}`,
  ),
  toImagePrerenderWorkerPaths: vi.fn(({ env, publicId, version }) => [
    `/${env}/image/upload/c_fill,h_256,w_256/g_auto/f_auto/q_auto/v${version}/${publicId}`,
    `/${env}/image/upload/c_fill,h_128,w_128/g_auto/f_auto/q_auto/v${version}/${publicId}`,
    `/${env}/image/upload/c_fit,h_1024,w_1024/g_auto/f_auto/q_auto/v${version}/${publicId}`,
  ]),
}))

vi.mock('#lib/images/storage.js', async importOriginal => {
  const actual = await importOriginal<typeof import('#lib/images/storage.js')>()

  return {
    ...actual,
    createPresignedR2UploadUrl: mockCreatePresignedR2UploadUrl,
    getOriginalsBucketNameForStage: mockGetOriginalsBucketNameForStage,
    readMetadataDocument: mockReadMetadataDocument,
  }
})

vi.mock('#lib/db/schema/index.js', async importOriginal => await importOriginal())

vi.mock('#lib/db/zod/index.js', async () => ({
  ImageMetadataFullSchema: (await import('#lib/db/zod/schema/image.js')).ImageMetadataFullSchema,
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
  RotateImageSchema: {},
  UpdateImageSchema: {},
}))

let remote: MockedRemoteModule<typeof import('#lib/api/image.remote.js')>

const buildDbWithContextRow = (row: Record<string, unknown>) => ({
  get: vi.fn(async () => ({ n: 0 })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
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
  // Hoisted factories are stable; reset request mocks without reloading dependencies.
  beforeAll(async () => {
    remote = mockedRemoteModule(await import('#lib/api/image.remote.js'))
  })

  beforeEach(() => {
    mockSaveFeatureImageMetadataDraft.mockReset().mockResolvedValue({ status: 'legacy' })
    mockReadImageRevisionDelivery.mockReset().mockResolvedValue(null)
    mockHasImageStorageReference.mockResolvedValue(false)
    mockCreateUploadedResourceImage
      .mockReset()
      .mockImplementation(() => mockCreateImageRecord())
    mockGetResourceUploadSnapshot.mockResolvedValue({
      imageId: null,
      modifiedAt: 'revision',
      organisationId: null,
      hubId: null,
    })
    vi.clearAllMocks()
    mockCreateImageRecord.mockReset()
    mockCreateImageRecord.mockResolvedValue({
      id: 'img-1',
      publicId: null as string | null,
    })
    mockCreateUploadedFeatureImage.mockReset().mockImplementation(async () => ({
      image: await mockCreateImageRecord(),
      featureImage: await mockCreateFeatureImage(),
    }))
    mockGetImagesByIds.mockReset()
    mockGetImagesByIds.mockResolvedValue([])
    mockLoadFeatureCanonicalImageOccupancy.mockReset()
    mockLoadFeatureCanonicalImageOccupancy.mockResolvedValue(['feature-1'])
    mockLoadImageById.mockReset()
    mockLoadImageById.mockResolvedValue(null)
    mockWaitUntil.mockReset()
    mockReadMetadataDocument.mockReset()
    mockReadMetadataDocument.mockResolvedValue({
      document: null,
      resolvedEnv: 'local',
      resolvedVersion: undefined,
    })
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
        locals: {
          platform: {
            env: {
              AUTH_SECRET: 'secret',
              CLOUDFLARE_ACCOUNT_ID: 'account-id',
              R2_S3_ACCESS_KEY_ID: 'access-key',
              R2_S3_SECRET_ACCESS_KEY: 'secret-key',
              ASSET_RAW_DEV: {
                head: vi.fn(async (): Promise<unknown> => null),
                put: vi.fn(async () => undefined),
              },
              ASSET_RAW_PREVIEW: {
                head: vi.fn(async (): Promise<unknown> => null),
                put: vi.fn(async () => undefined),
              },
              ASSET_RAW_PRODUCTION: {
                head: vi.fn(async (): Promise<unknown> => null),
                put: vi.fn(async () => undefined),
              },
              ASSET_PUBLIC_DEV: { put: vi.fn(async () => undefined), get: vi.fn() },
              ASSET_PUBLIC_PREVIEW: { put: vi.fn(async () => undefined), get: vi.fn() },
              ASSET_PUBLIC_PRODUCTION: {
                put: vi.fn(async () => undefined),
                get: vi.fn(),
              },
            },
            context: {
              waitUntil: mockWaitUntil,
            },
          },
          hub: null,
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

  it.each(['other-feature', null, undefined])(
    'rejects task narrowing outside the authorized feature (%s)',
    async featureId => {
      const ctx = await mockGuardedContext()
      mockGuardedContext.mockResolvedValue({
        ...ctx,
        db: buildDbWithContextRow({
          isPublished: true,
          isArchived: false,
          featureId,
        }),
      })
      await expect(
        remote.getImagesForContext({
          ctxType: 'feature',
          ctxId: 'feature-1',
          ctxNarrowingType: 'task',
          ctxNarrowingId: 'task-1',
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(mockGetImageForContextType).not.toHaveBeenCalled()
    },
  )

  it.each(['project', 'organisation', 'hub', 'user', 'task'])(
    'rejects replacing a primary %s context with task narrowing',
    async ctxType => {
      await expect(
        remote.getImagesForContext({
          ctxType,
          ctxId: 'parent-1',
          ctxNarrowingType: 'task',
          ctxNarrowingId: 'other-task',
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(mockGetImageForContextType).not.toHaveBeenCalled()
    },
  )

  it('rejects narrowing to a deleted task before fetching images', async () => {
    const ctx = await mockGuardedContext()
    const db = buildDbWithContextRow({ isPublished: true, isArchived: false })
    db.select.mockReturnValueOnce(db.select()).mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async (): Promise<unknown[]> => []) })),
      })),
    } as never)
    mockGuardedContext.mockResolvedValue({ ...ctx, db })
    await expect(
      remote.getImagesForContext({
        ctxType: 'feature',
        ctxId: 'feature-1',
        ctxNarrowingType: 'task',
        ctxNarrowingId: 'deleted-task',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockGetImageForContextType).not.toHaveBeenCalled()
  })

  it.each([{ ctxNarrowingType: 'task' }, { ctxNarrowingId: 'task-1' }])(
    'rejects incomplete narrowing (%j)',
    async narrowing => {
      await expect(
        remote.getImagesForContext({
          ctxType: 'feature',
          ctxId: 'feature-1',
          ...narrowing,
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(mockGetImageForContextType).not.toHaveBeenCalled()
    },
  )

  it('keeps valid task narrowing bound to its feature in the final query', async () => {
    const ctx = await mockGuardedContext()
    mockGuardedContext.mockResolvedValue({
      ...ctx,
      db: buildDbWithContextRow({
        isPublished: true,
        isArchived: false,
        featureId: 'feature-1', projectId: 'project-1', organisationId: 'org-1',
      }),
    })
    await remote.getImagesForContext({
      ctxType: 'feature',
      ctxId: 'feature-1',
      ctxNarrowingType: 'task',
      ctxNarrowingId: 'task-1',
    })
    expect(mockGetImageQueryContext).toHaveBeenCalledWith(
      expect.anything(),
      true,
      {},
      'task-1',
      'task',
    )
    const conditions = mockGetImageForContextType.mock.calls[0][2]
    const { task } = await import('#lib/db/schema/index.js')
    const { and } = await import('drizzle-orm')
    const query = drizzle({} as never)
      .select({ id: task.id })
      .from(task)
      .where(and(...conditions))
      .toSQL()
    expect(query.sql).toContain('"task"."featureId" = ?')
    expect(query.params).toContain('feature-1')
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`CREATE TABLE task (id TEXT, featureId TEXT, projectId TEXT, organisationId TEXT, isDraft INTEGER, contributorId TEXT);
        CREATE TABLE feature (id TEXT, projectId TEXT, organisationId TEXT);
        CREATE TABLE project (id TEXT, organisationId TEXT);
        CREATE TABLE organisation (id TEXT);
        INSERT INTO organisation VALUES ('org-1');
        INSERT INTO project VALUES ('project-1','org-1');
        INSERT INTO feature VALUES ('feature-1','project-1','org-1');
        INSERT INTO task VALUES ('task-1', 'feature-1','project-1','org-1',0,'u-1');`)
      expect(sqlite.prepare(query.sql).all(...(query.params as never[]))).toHaveLength(
        1,
      )
      // The final condition excludes a task reparented after the authorization probe.
      sqlite.exec("UPDATE task SET featureId = 'other-feature'")
      expect(sqlite.prepare(query.sql).all(...(query.params as never[]))).toHaveLength(
        0,
      )
    } finally {
      sqlite.close()
    }
  })

  it.each(['feature', 'task'])(
    'preserves primary %s reads without narrowing',
    async ctxType => {
      await remote.getImagesForContext({ ctxType, ctxId: 'context-1' })
      expect(mockGetImageQueryContext).toHaveBeenCalledWith(
        expect.anything(),
        true,
        {},
        'context-1',
        ctxType,
      )
      expect(mockGetImageForContextType).toHaveBeenCalled()
    },
  )

  it('denies getImageById when image read authz denies', async () => {
    mockGetImagesByIds.mockResolvedValueOnce([
      {
        id: 'img-1',
        featureId: 'feature-1',
        contributorId: 'u-1',
      },
    ] as never)
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

  it('returns the readable assignment when the first shared-image assignment is denied', async () => {
    const denied = {
      id: 'image',
      featureId: 'restricted',
      intent: 'canonical',
      isPublished: false,
    }
    const allowed = {
      id: 'image',
      featureId: 'readable',
      intent: 'general',
      isPublished: true,
    }
    mockGetImagesByIds.mockResolvedValueOnce([denied, allowed] as never)
    mockAuthorizeImageRead
      .mockReturnValueOnce({ allowed: false } as never)
      .mockReturnValueOnce({ allowed: true })
    await remote.getImageById({ id: 'image' })
    expect(mockToImageEntityResponseShape).toHaveBeenCalledWith(
      allowed,
      { ctxType: 'feature', ctxId: 'readable' },
      expect.anything(),
    )
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
    expect(mockCreateUploadedFeatureImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [],
      undefined,
      expect.any(String),
      { projectId: 'project', organisationId: 'organisation', hubId: 'hub' },
    )
    expect(result).toEqual({
      data: {
        data: { id: 'img-1', publicId: null },
        ctxType: 'feature',
        ctxId: 'feature-1',
      },
    })
  })


  it('captures Feature ancestry before legacy creation authorization', async () => {
    const { getFeatureImageCreationScope } = await import(
      '#lib/db/services/imageUpload.js'
    )
    await remote.createImage({
      data: { ctxType: 'feature', ctxId: 'feature-1', featureImage: {} },
    })
    expect(
      vi.mocked(getFeatureImageCreationScope).mock.invocationCallOrder[0],
    ).toBeLessThan(mockAssertPermissionsToCreateImage.mock.invocationCallOrder[0])
    expect(mockCreateUploadedFeatureImage.mock.calls[0][5]).toEqual({
      projectId: 'project',
      organisationId: 'organisation',
      hubId: 'hub',
    })
  })

  it('rejects missing Feature ancestry before legacy insertion', async () => {
    const { getFeatureImageCreationScope } = await import(
      '#lib/db/services/imageUpload.js'
    )
    vi.mocked(getFeatureImageCreationScope).mockResolvedValueOnce(null)
    await expect(
      remote.createImage({
        data: { ctxType: 'feature', ctxId: 'feature-1', featureImage: {} },
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockCreateUploadedFeatureImage).not.toHaveBeenCalled()
  })

  it.each(['project', 'organisation', 'hub'] as const)(
    'creates a legacy %s image through the guarded pointer transaction',
    async ctxType => {
      const snapshot = {
        imageId: 'previous',
        modifiedAt: 'revision',
        organisationId: null,
        hubId: null,
      }
      mockGetResourceUploadSnapshot.mockResolvedValueOnce(snapshot)
      await remote.createImage({
        data: {
          ctxType,
          ctxId: 'target',
          publicId: 'legacy-key',
          cdn: 'cloudflareR2',
          env: 'local',
        },
      })
      expect(mockGetResourceUploadSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
        mockAssertPermissionsToCreateImage.mock.invocationCallOrder[0],
      )
      expect(mockCreateUploadedResourceImage).toHaveBeenCalledWith(
        expect.anything(),
        ctxType,
        'target',
        expect.anything(),
        snapshot,
        expect.any(String),
        { actorId: 'u-1', reason: ctxType === 'hub' ? 'Hub image updated' : 'Resource image updated' },
        undefined,
      )
      expect(mockUpdateProjectById).not.toHaveBeenCalled()
      expect(mockUpdateOrganisationById).not.toHaveBeenCalled()
    },
  )

  it('rejects legacy creation after its resource disappears without inserting an image', async () => {
    mockGetResourceUploadSnapshot.mockResolvedValueOnce(null)
    await expect(
      remote.createImage({
        data: { ctxType: 'project', ctxId: 'missing', publicId: 'legacy-key' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockCreateUploadedResourceImage).not.toHaveBeenCalled()
    expect(mockCreateImageRecord).not.toHaveBeenCalled()
  })

  it('setImageIntent requires featureId', async () => {
    await expect(
      remote.setImageIntent({
        id: 'img-1',
        ctxType: 'project',
        ctxId: 'project-1',
        intent: 'gallery' as never, // Deliberately invalid input exercises server validation.
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

  it('authorizes each ID-based result using its persisted resource chain', async () => {
    const ctx = await mockGuardedContext()
    mockGuardedContext.mockResolvedValue({
      ...ctx,
      db: buildDbWithContextRow({
        isPublished: true,
        isArchived: false,
        resourceHubId: 'hub',
        projectId: 'project',
        organisationId: 'organisation',
      }),
    })
    const denied = { id: 'denied', featureId: 'feature-a', isPublished: false }
    const allowed = { id: 'allowed', featureId: 'feature-b', isPublished: false }
    mockGetImagesByIds.mockResolvedValueOnce([denied, allowed] as never)
    mockAuthorizeImageRead
      .mockReturnValueOnce({ allowed: false } as never)
      .mockReturnValueOnce({ allowed: true })
    await remote.getImagesForIds({ ids: ['denied', 'allowed'] })
    expect(mockToImageListResponseShape).toHaveBeenCalledWith(
      [allowed],
      expect.any(Function),
      expect.anything(),
    )
    expect(mockAuthorizeImageRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ctxType: 'feature',
        ctxId: 'feature-a',
        projectId: 'project',
        organisationId: 'organisation',
        resourceHubId: 'hub',
      }),
      expect.objectContaining({ isPublished: false }),
      { isAdminRequest: true },
    )
  })

  it.each(['missing-parent', 'database-error'])(
    'isolates stale batch rows without swallowing failures (%s)',
    async scenario => {
      const db = buildDbWithContextRow({
        isPublished: true,
        isArchived: false,
        resourceHubId: 'hub',
      })
      const chain = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async (): Promise<unknown[]> => []),
      }
      if (scenario === 'database-error')
        chain.limit.mockRejectedValue(new Error('database failed'))
      db.select.mockReturnValueOnce({ from: vi.fn(() => chain) } as never)
      const ctx = await mockGuardedContext()
      mockGuardedContext.mockResolvedValue({ ...ctx, db })
      const stale = { id: 'stale', featureId: 'removed' }
      const valid = { id: 'valid', featureId: 'present' }
      mockGetImagesByIds.mockResolvedValueOnce([stale, valid] as never)
      const result = remote.getImagesForIds({ ids: ['stale', 'valid'] })
      if (scenario === 'database-error') {
        await expect(result).rejects.toThrow('database failed')
        expect(mockToImageListResponseShape).not.toHaveBeenCalled()
      } else {
        await result
        expect(mockToImageListResponseShape).toHaveBeenCalledWith(
          [valid],
          expect.any(Function),
          expect.anything(),
        )
      }
    },
  )

  it('resolves a resource image from its parent link rather than treating it as the uploader collection', async () => {
    const db = buildDbWithContextRow({
      isPublished: false,
      isArchived: false,
      resourceHubId: 'hub',
      projectId: 'project',
      organisationId: 'organisation',
    })
    for (const parents of [[{ ctxId: 'project' }], [], []]) {
      db.select.mockReturnValueOnce({
        from: vi.fn(() => ({ where: vi.fn(async () => parents) })),
      } as never)
    }
    const ctx = await mockGuardedContext()
    mockGuardedContext.mockResolvedValue({ ...ctx, db })
    mockGetImagesByIds.mockResolvedValueOnce([
      {
        id: 'image',
        contributorId: 'another-user',
      },
    ] as never)
    await remote.getImageById({ id: 'image' })
    expect(mockAuthorizeImageRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ctxType: 'project',
        ctxId: 'project',
        projectId: 'project',
        organisationId: 'organisation',
      }),
      expect.objectContaining({ isPublished: false }),
      { isAdminRequest: true },
    )
  })

  it.each(['success', 'failure', 'skip', 'stale-scope'] as const)(
    'deletes image associations atomically (failure: %s)',
    async scenario => {
      const fail = scenario !== 'success'
      if (scenario === 'stale-scope') {
        const { sql } = await import('drizzle-orm')
        const { createImageMutationGuards } = await import(
          '#lib/db/services/imageMutationScope.js'
        )
        vi.mocked(createImageMutationGuards).mockReturnValueOnce({
          before: sql`0`,
          after: sql`0`,
        })
      }
      const sqlite = new DatabaseSync(':memory:')
      try {
        sqlite.exec(`CREATE TABLE image (id TEXT PRIMARY KEY);
        CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
        CREATE TABLE task(id TEXT PRIMARY KEY,isReviewed INTEGER,modifiedAt TEXT);
        INSERT INTO task VALUES('task',0,'2099-01-01T00:00:00.000Z');
        CREATE TABLE featureImage (featureId TEXT, imageId TEXT);
        INSERT INTO image VALUES ('img-1');
        INSERT INTO taskImage VALUES ('task', 'img-1');
        INSERT INTO featureImage VALUES ('feature', 'img-1');`)
        if (fail) {
          sqlite.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON image
          BEGIN SELECT RAISE(${scenario === 'skip' ? 'IGNORE' : "ABORT, 'delete failed'"}); END;`)
        }
        const db = drizzle({} as never)
        // Execute real generated SQL using D1's documented batch rollback semantics.
        vi.spyOn(db, 'batch').mockImplementation(async statements => {
          sqlite.exec('BEGIN')
          try {
            for (const statement of statements) {
              if (!('toSQL' in statement) || typeof statement.toSQL !== 'function')
                throw new Error('Expected SQL builder in batch fixture')
              const query = statement.toSQL() as { sql: string; params: unknown[] }
              sqlite.prepare(query.sql).run(...(query.params as never[]))
            }
            sqlite.exec('COMMIT')
            return [] as never
          } catch (error) {
            sqlite.exec('ROLLBACK')
            throw error
          }
        })
        const ctx = await mockGuardedContext()
        mockGuardedContext.mockResolvedValue({ ...ctx, db })
        mockLoadImageById.mockResolvedValue({
          id: 'img-1',
          publicId: 'image-key',
          env: 'local',
        } as never)
        const deletion = remote.deleteImage({
          id: 'img-1',
          ctxId: 'feature',
          ctxType: 'feature',
        })
        if (fail) {
          if (scenario === 'skip' || scenario === 'stale-scope')
            await expect(deletion).rejects.toMatchObject({ status: 409 })
          else await expect(deletion).rejects.toThrow('delete failed')
          expect(mockWaitUntil).not.toHaveBeenCalled()
        } else {
          await expect(deletion).resolves.toMatchObject({ type: 'success' })
          expect(mockWaitUntil).toHaveBeenCalledOnce()
        }
        const revision = sqlite
          .prepare("SELECT modifiedAt FROM task WHERE id='task'")
          .get()?.modifiedAt as string
        expect(revision > '2099-01-01T00:00:00.000Z').toBe(!fail)
        for (const table of ['image', 'taskImage', 'featureImage']) {
          expect(
            sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get(),
          ).toEqual({ count: fail ? 1 : 0 })
        }
      } finally {
        sqlite.close()
      }
    },
  )

  it.each([true, false])('detaches organisation logos without deleting retained assets: %s', async committed => {
    mockRemoveOrganisationImage.mockResolvedValueOnce(committed)
    mockLoadImageById.mockResolvedValue({ id: 'img-1', publicId: 'logo-key', env: 'local' } as never)
    const result = remote.deleteImage({ id: 'img-1', ctxId: 'org', ctxType: 'organisation' })
    if (committed) await expect(result).resolves.toMatchObject({ type: 'success' })
    else await expect(result).rejects.toMatchObject({ status: 409 })
    expect(mockRemoveOrganisationImage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      organisationId: 'org', imageId: 'img-1',
      actor: { actorId: 'u-1', reason: 'Organisation image removed' },
    }))
    expect(mockWaitUntil).not.toHaveBeenCalled()
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
      publicId: expect.stringContaining('h/features/feature-1/'),
      uploadUrl: 'https://upload.example.test/object',
      headers: expect.objectContaining({ 'if-none-match': '*' }),
      method: 'PUT',
      confirmToken: 'signed-upload-token',
    })
  })

  it.each(['project', 'organisation', 'hub'] as const)(
    'authImageUpload signs the original %s state before authorization',
    async ctxType => {
      const snapshot = {
        imageId: 'previous',
        modifiedAt: 'revision',
        organisationId: ctxType === 'project' ? 'org' : null,
        hubId: null,
      }
      mockGetResourceUploadSnapshot.mockResolvedValueOnce(snapshot)
      await remote.authImageUpload({
        cdn: 'cloudflareR2',
        env: 'local',
        ctxType,
        ctxId: 'target',
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
      })
      const { createUploadToken } = await import('#lib/images/auth.js')
      expect(createUploadToken).toHaveBeenCalledWith(
        expect.objectContaining({
          ctxType,
          ctxId: 'target',
          resourceSnapshot: snapshot,
        }),
        'secret',
      )
      expect(mockGetResourceUploadSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
        mockAssertPermissionsToCreateImage.mock.invocationCallOrder[0],
      )
    },
  )

  it('does not issue an upload grant for a missing resource snapshot', async () => {
    mockGetResourceUploadSnapshot.mockResolvedValueOnce(null)
    await expect(
      remote.authImageUpload({
        cdn: 'cloudflareR2',
        env: 'local',
        ctxType: 'project',
        ctxId: 'missing',
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockCreatePresignedR2UploadUrl).not.toHaveBeenCalled()
  })

  it.each(['feature', 'project', 'organisation', 'hub'] as const)(
    'authorizes a %s replacement on a fresh key with the original signed snapshot',
    async ctxType => {
      mockLoadImageById.mockResolvedValueOnce({
        id: 'img-1',
        publicId: 'old-key',
        env: 'local',
      } as never)
      const session = await remote.authImageUpload({
        cdn: 'cloudflareR2',
        env: 'local',
        ctxType,
        ctxId: 'context',
        replaceImageId: 'img-1',
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
      })
      expect(session.publicId).not.toBe('old-key')
      expect(session.publicId).toContain(`h/${ctxType}s/context/`)
      const { createUploadToken } = await import('#lib/images/auth.js')
      expect(createUploadToken).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: session.publicId,
          replaceImageId: 'img-1',
          replacementSnapshot: expect.objectContaining({
            imageId: 'img-1',
            source: { publicId: 'old-key', env: 'local', version: 1 },
          }),
        }),
        'secret',
      )
      expect(mockCreatePresignedR2UploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ objectKey: session.publicId }),
      )
      const { getImageMutationSnapshot } = await import(
        '#lib/db/services/imageMutationScope.js'
      )
      expect(
        vi.mocked(getImageMutationSnapshot).mock.invocationCallOrder[0],
      ).toBeLessThan(mockAssertPermissionsToDeleteImage.mock.invocationCallOrder[0])
    },
  )

  it.each(['fresh', 'retry', 'recover-sidecars', 'stale', 'missing-snapshot'] as const)(
    'finalizes isolated replacement storage safely: %s',
    async scenario => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(2000)
      try {
        const ctx = await mockGuardedContext()
        const bucket = ctx.event.locals.platform.env.ASSET_RAW_DEV
        bucket.head.mockResolvedValue({
          size: 1234,
          httpMetadata: { contentType: 'image/jpeg' },
        })
        const replacementSnapshot = {
          imageId: 'img-1',
          imageRevision: 'revision',
          assignmentRevision: 'assignment',
          scope: 'scope',
          source: { publicId: 'old-key', env: 'production', version: 1 },
        }
        mockVerifyUploadToken.mockResolvedValueOnce({
          publicId: 'new-key',
          env: 'local',
          ctxType: 'feature',
          ctxId: 'feature-1',
          replaceImageId: 'img-1',
          replacementSnapshot:
            scenario === 'missing-snapshot' ? undefined : replacementSnapshot,
          filename: 'image.jpg',
          contentType: 'image/jpeg',
          size: 1234,
          uploaderUserId: 'u-1',
          exp: 5000,
        })
        const replayed = scenario === 'retry' || scenario === 'recover-sidecars'
        const storedVersion = replayed ? 1000 : 2000
        if (scenario === 'stale')
          mockUpdateImageForContext.mockRejectedValueOnce({
            status: 409,
            body: { message: 'STALE_IMAGE_UPDATE' },
          })
        else if (scenario !== 'missing-snapshot')
          mockUpdateImageForContext.mockResolvedValueOnce({
            data: {
              image: { id: 'img-1', publicId: 'new-key', version: storedVersion },
            },
            replayed,
          } as never)
        mockReadMetadataDocument.mockResolvedValueOnce({
          document: {
            originalFilename: 'old.jpg',
            cameraModel: 'Old camera',
            sourceVersion: 1,
          },
          resolvedEnv: 'production',
          resolvedVersion: 1,
        })
        if (replayed)
          mockReadMetadataDocument.mockResolvedValueOnce({
            document:
              scenario === 'retry'
                ? { sourceVersion: 1000, originalFilename: 'already-saved.jpg' }
                : null,
            resolvedEnv: 'local',
            resolvedVersion: 1000,
          })
        const confirmation = remote.finalizeImageUpload({
          token: 'token',
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
        if (scenario === 'stale' || scenario === 'missing-snapshot') {
          await expect(confirmation).rejects.toMatchObject({ status: 409 })
          expect(bucket.put).not.toHaveBeenCalled()
          expect(mockWaitUntil).not.toHaveBeenCalled()
          return
        }
        expect((await confirmation).data.image.version).toBe(storedVersion)
        await Promise.all(mockWaitUntil.mock.calls.map(([promise]) => promise))
        expect(mockUpdateImageForContext).toHaveBeenCalledWith(
          expect.objectContaining({
            replacement: {
              snapshot: replacementSnapshot,
              publicId: 'new-key',
              env: 'local',
            },
          }),
        )
        expect(mockReadMetadataDocument).toHaveBeenCalledWith(
          expect.objectContaining({
            publicId: 'old-key',
            env: 'production',
            version: 1,
          }),
        )
        expect(bucket.put).toHaveBeenCalledTimes(3)
        for (const [key] of bucket.put.mock.calls) expect(key).toMatch(/^new-key/)
        if (scenario !== 'retry')
          expect(bucket.put).toHaveBeenCalledWith(
            expect.stringContaining(`.v${storedVersion}`),
            expect.stringContaining('Old camera'),
            expect.anything(),
          )
        if (scenario === 'recover-sidecars')
          expect(bucket.put).toHaveBeenCalledWith(
            expect.stringContaining('.v1000'),
            expect.stringContaining('"replacementEditedAt":"1970-01-01T00:00:01.000Z"'),
            expect.anything(),
          )
        expect(
          ctx.event.locals.platform.env.ASSET_RAW_PRODUCTION.put,
        ).not.toHaveBeenCalled()
        expect(mockEnqueueDerivedAssetWarmup).toHaveBeenCalledWith(
          expect.objectContaining({ publicId: 'new-key', version: storedVersion }),
        )
      } finally {
        now.mockRestore()
      }
    },
  )

  it.each(['concurrent', 'repair'] as const)(
    'preserves one canonical metadata document across %s confirmations',
    async scenario => {
      const ctx = await mockGuardedContext()
      const bucket = ctx.event.locals.platform.env.ASSET_RAW_DEV
      const stored = new Map<string, string>()
      bucket.head.mockResolvedValue({
        size: 1234,
        httpMetadata: { contentType: 'image/jpeg' },
      })
      bucket.put.mockImplementation(
        async (
          key: string,
          body: string,
          options: { onlyIf?: { etagDoesNotMatch?: string } },
        ) => {
          if (stored.has(key) && options.onlyIf?.etagDoesNotMatch === '*') return null
          stored.set(key, body)
          return { etag: 'stored' }
        },
      )
      Object.assign(bucket, {
        get: vi.fn(async (key: string) =>
          stored.has(key) ? { json: async () => JSON.parse(stored.get(key)!) } : null,
        ),
      })
      if (scenario === 'repair')
        stored.set(
          'new-key.v1000.json',
          JSON.stringify({ sourceVersion: 1000, credit: 'Original credit' }),
        )
      mockVerifyUploadToken.mockResolvedValue({
        publicId: 'new-key',
        env: 'local',
        ctxType: 'feature',
        ctxId: 'feature-1',
        replaceImageId: 'img-1',
        replacementSnapshot: {
          imageId: 'img-1',
          imageRevision: 'revision',
          assignmentRevision: 'assignment',
          scope: 'scope',
          source: { publicId: 'old-key', env: 'local', version: 1 },
        },
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
        uploaderUserId: 'u-1',
        exp: Date.now() + 5000,
      })
      for (let i = 0; i < 2; i++)
        mockUpdateImageForContext.mockResolvedValueOnce({
          data: { image: { id: 'img-1', publicId: 'new-key', version: 1000 } },
          replayed: true,
        } as never)
      mockReadMetadataDocument.mockResolvedValue({
        document: null,
        resolvedEnv: 'local',
        resolvedVersion: 1000,
      })
      const confirm = (credit: string) =>
        remote.finalizeImageUpload({
          token: 'token',
          metadata: {
            credit,
            originalFilename: 'image.jpg',
            originalExtension: 'jpg',
            originalWidth: 100,
            originalHeight: 200,
            cameraModel: null,
            capturedAt: null,
            latitude: null,
            longitude: null,
            metadata: null,
          },
        })
      await Promise.all([confirm('First credit'), confirm('Second credit')])
      await Promise.all(mockWaitUntil.mock.calls.map(([promise]) => promise))
      const canonical = stored.get('new-key.v1000.json')!
      expect(stored.get('new-key.json')).toBe(canonical)
      expect(JSON.parse(canonical).credit).toBe(
        scenario === 'repair' ? 'Original credit' : 'First credit',
      )
      expect(JSON.parse(stored.get('new-key.manifest.json')!).version).toBe(1000)
      expect(bucket.put).toHaveBeenCalledWith(
        'new-key.v1000.json',
        expect.any(String),
        expect.objectContaining({ onlyIf: { etagDoesNotMatch: '*' } }),
      )
    },
  )

  it('authImageUpload targets the dev raw bucket for local uploads', async () => {
    await remote.authImageUpload({
      cdn: 'cloudflareR2',
      env: 'local',
      ctxType: 'feature',
      ctxId: 'feature-1',
      filename: 'image.jpg',
      contentType: 'image/jpeg',
      size: 1234,
    })

    expect(mockGetOriginalsBucketNameForStage).toHaveBeenCalledWith('local')
    expect(mockCreatePresignedR2UploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'hype-assets-raw-dev',
      }),
    )
  })

  it('authImageUpload prefers the server runtime environment over the client env', async () => {
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
        locals: {
          platform: {
            env: {
              ENVIRONMENT: 'local',
              AUTH_SECRET: 'secret',
              CLOUDFLARE_ACCOUNT_ID: 'account-id',
              R2_S3_ACCESS_KEY_ID: 'access-key',
              R2_S3_SECRET_ACCESS_KEY: 'secret-key',
              ASSET_RAW_DEV: { head: vi.fn(async (): Promise<unknown> => null) },
              ASSET_RAW_PREVIEW: { head: vi.fn(async (): Promise<unknown> => null) },
              ASSET_RAW_PRODUCTION: { head: vi.fn(async (): Promise<unknown> => null) },
              ASSET_PUBLIC_DEV: { put: vi.fn(), get: vi.fn() },
              ASSET_PUBLIC_PREVIEW: { put: vi.fn(), get: vi.fn() },
              ASSET_PUBLIC_PRODUCTION: { put: vi.fn(), get: vi.fn() },
            },
            context: {
              waitUntil: mockWaitUntil,
            },
          },
          hub: null,
        },
      },
    })

    const result = await remote.authImageUpload({
      cdn: 'cloudflareR2',
      env: 'production',
      ctxType: 'feature',
      ctxId: 'feature-1',
      filename: 'image.jpg',
      contentType: 'image/jpeg',
      size: 1234,
    })

    expect(result.env).toBe('local')
    expect(mockGetOriginalsBucketNameForStage).toHaveBeenLastCalledWith('local')
    expect(mockCreatePresignedR2UploadUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bucket: 'hype-assets-raw-dev',
      }),
    )
  })

  it.each(['rotation', 'presentation'] as const)('saves enrolled %s edits without mutable image writes or sidecars', async kind => {
    mockLoadImageById.mockResolvedValue({ id: 'img-1', env: 'local', publicId: 'old-key', version: 1 })
    const draft = { status: 'saved', proposalId: 'p', candidateRevisionId: 'r', imageRevisionId: 'ir' }
    mockSaveFeatureImageMetadataDraft.mockResolvedValueOnce(draft)
    const result = kind === 'rotation'
      ? await remote.rotateImage({ id: 'img-1', ctxType: 'feature', ctxId: 'feature-1', imageRevisionId: 'ir-base', rotation: 90 })
      : await remote.updateImage({ id: 'img-1', ctxType: 'feature', ctxId: 'feature-1', imageRevisionId: 'ir-base', data: { presentationMode: 'cover' } })
    expect(result).toEqual({ data: null, revisionDraft: draft })
    expect(mockAssertPermissionsToUpdateImage).toHaveBeenCalled()
    expect(mockSaveFeatureImageMetadataDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      featureId: 'feature-1', expectedImageRevisionId: 'ir-base', actorId: 'u-1',
    }))
    expect(mockUpdateImageForContext).not.toHaveBeenCalled()
    expect(mockReadMetadataDocument).not.toHaveBeenCalled()
    expect(mockWaitUntil).not.toHaveBeenCalled()
    const ctx = await mockGuardedContext()
    expect(ctx.event.locals.platform.env.ASSET_RAW_DEV.put).not.toHaveBeenCalled()
  })

  it.each([
    'new',
    'retry-missing',
    'retry-existing',
    'failure',
    'draft-contribution',
    'stale-draft',
  ])(
    'finalizeImageUpload keeps sidecars aligned with persisted state (%s)',
    async scenario => {
      const put = vi.fn(async () => undefined)
      const head = vi.fn(async () => ({
        size: 1234,
        httpMetadata: { contentType: 'image/jpeg' },
      }))
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1768)
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }))

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
          locals: {
            platform: {
              env: {
                AUTH_SECRET: 'secret',
                CLOUDFLARE_ACCOUNT_ID: 'account-id',
                R2_S3_ACCESS_KEY_ID: 'access-key',
                R2_S3_SECRET_ACCESS_KEY: 'secret-key',
                PUBLIC_ASSET_BASE_URL: 'https://assets.example.test',
                ASSET_RAW_DEV: { head, put },
                ASSET_RAW_PREVIEW: {
                  head: vi.fn(async (): Promise<unknown> => null),
                  put,
                },
                ASSET_RAW_PRODUCTION: {
                  head: vi.fn(async (): Promise<unknown> => null),
                  put,
                },
                ASSET_PUBLIC_DEV: { put, get: vi.fn() },
                ASSET_PUBLIC_PREVIEW: { put, get: vi.fn() },
                ASSET_PUBLIC_PRODUCTION: { put, get: vi.fn() },
              },
              context: {
                waitUntil: mockWaitUntil,
              },
            },
            hub: null,
          },
        },
      })
      mockVerifyUploadToken.mockResolvedValue({
        publicId: 'h/features/feature-1/image-a',
        env: 'local',
        ctxType: 'feature',
        ctxId: 'feature-1',
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
        uploaderUserId: 'u-1',
        exp: Date.now() + 1000,
      })

      const isRetry = scenario.startsWith('retry')
      if (isRetry) {
        mockToImageEnvelope.mockReturnValueOnce({
          image: { id: 'img-1', version: 1000 },
          ctxType: 'feature',
          ctxId: 'feature-1',
        } as never)
        mockReadMetadataDocument.mockResolvedValue({
          document: scenario === 'retry-existing' ? { sourceVersion: 1000 } : null,
          resolvedEnv: 'local',
          resolvedVersion: 1000,
        } as never)
      }
      if (scenario === 'failure')
        mockCreateImageRecord.mockRejectedValueOnce(new Error('insert failed'))
      if (scenario === 'draft-contribution' || scenario === 'stale-draft') {
        mockAssertPermissionsToCreateImage.mockResolvedValueOnce(
          'draft-contribution' as never,
        )
      }
      if (scenario === 'stale-draft')
        mockCreateUploadedFeatureImage.mockResolvedValueOnce(null)
      const confirmation = remote.finalizeImageUpload({
        token: 'signed-upload-token',
        persist: {
          contributorId: 'other-account',
          links:
            scenario === 'draft-contribution' || scenario === 'stale-draft'
              ? [{ type: 'taskImage', taskId: 'task-1' }]
              : [],
          featureImage: {
            featureId: 'feature-1',
            intent: 'canonical',
            isPublished: true,
            localIsPublished: true,
            publisherId: 'other-account',
            publishedAt: '2026-01-01T00:00:00Z',
          },
        },
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

      if (scenario === 'stale-draft') {
        await expect(confirmation).rejects.toMatchObject({
          status: 409,
          body: { message: 'STALE_IMAGE_UPLOAD_CONTEXT' },
        })
        expect(put).not.toHaveBeenCalled()
        expect(mockWaitUntil).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      if (scenario === 'failure') {
        await expect(confirmation).rejects.toThrow('insert failed')
        expect(put).not.toHaveBeenCalled()
        expect(mockWaitUntil).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      const result = await confirmation
      const { getFeatureImageCreationScope } = await import(
        '#lib/db/services/imageUpload.js'
      )
      expect(
        vi.mocked(getFeatureImageCreationScope).mock.invocationCallOrder[0],
      ).toBeLessThan(mockAssertPermissionsToCreateImage.mock.invocationCallOrder[0])
      if (scenario === 'draft-contribution') {
        expect(mockCreateUploadedFeatureImage.mock.calls[0][1]).toEqual(
          expect.objectContaining({
            contributorId: 'u-1',
            featureImage: expect.objectContaining({
              intent: 'undefined',
              isPublished: false,
              localIsPublished: null,
              publisherId: null,
              publishedAt: null,
            }),
          }),
        )
      } else if (scenario === 'new') {
        expect(mockCreateUploadedFeatureImage.mock.calls[0][1]).toEqual(
          expect.objectContaining({
            contributorId: 'other-account',
            featureImage: expect.objectContaining({
              intent: 'canonical',
              isPublished: true,
            }),
          }),
        )
      }

      expect(mockCreateUploadedFeatureImage.mock.calls[0].slice(2)).toEqual([
        scenario === 'draft-contribution' ? ['task-1'] : [],
        scenario === 'draft-contribution' ? 'u-1' : undefined,
        undefined,
        { projectId: 'project', organisationId: 'organisation', hubId: 'hub' },
      ])
      expect(head).toHaveBeenCalledWith('h/features/feature-1/image-a')
      expect(mockCreateUploadedFeatureImage.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          publicId: 'h/features/feature-1/image-a',
          env: 'local',
        }),
      )
      expect(put).toHaveBeenCalledTimes(3)
      if (scenario === 'retry-missing') {
        expect(put).toHaveBeenCalledWith(
          expect.stringContaining('.v1000'),
          expect.stringContaining('"sourceVersion":1000'),
          expect.anything(),
        )
      }
      expect(mockWaitUntil).toHaveBeenCalledTimes(2)
      expect(mockEnqueueDerivedAssetWarmup).toHaveBeenCalledWith({
        event: expect.objectContaining({
          request: expect.any(Request),
        }),
        env: 'local',
        publicId: 'h/features/feature-1/image-a',
        version: isRetry ? 1000 : 1768,
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        data: {
          ctxType: 'feature',
          ctxId: 'feature-1',
        },
      })

      fetchSpy.mockRestore()
      dateNowSpy.mockRestore()
    },
  )

  it.each(
    [
      { failDatabase: false, sameAsset: false },
      { failDatabase: true, sameAsset: false },
      { failDatabase: false, sameAsset: false, sharedStorage: true },
      { failDatabase: false, sameAsset: false, referenceLookupFails: true },
      { failDatabase: false, sameAsset: true },
      { failDatabase: false, sameAsset: false, stillReferenced: true },
      { failDatabase: false, sameAsset: false, staleContext: true },
      { failDatabase: false, sameAsset: false, missingSnapshot: true },
    ].flatMap(scenario =>
      (['project', 'organisation', 'hub'] as const).map(ctxType => ({
        ...scenario,
        ctxType,
      })),
    ),
  )(
    'finalizeImageUpload safely cleans detached images (%j)',
    async ({
      ctxType,
      failDatabase,
      sameAsset,
      stillReferenced = false,
      staleContext = false,
      missingSnapshot = false,
      sharedStorage = false,
      referenceLookupFails = false,
    }) => {
      mockHasImageStorageReference.mockResolvedValue(sharedStorage)
      if (referenceLookupFails)
        mockHasImageStorageReference.mockRejectedValueOnce(
          new Error('reference lookup unavailable'),
        )
      const waitUntilPromises: Promise<unknown>[] = []
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const dbDeleteReturning = vi.fn(async () =>
        stillReferenced ? [] : [{ id: 'img-old' }],
      )
      const dbDeleteWhere = vi.fn(() => ({ returning: dbDeleteReturning }))
      if (failDatabase)
        dbDeleteReturning.mockRejectedValue(new Error('database delete failed'))
      const deleteAssets = vi.fn(async () => undefined)
      const listOriginals = vi.fn(async (options: { cursor?: string }) =>
        options.cursor
          ? {
              objects: [{ key: 'h/projects/project-1/image-old.v99.json' }],
              truncated: false,
            }
          : {
              objects: [
                { key: 'h/projects/project-1/image-old.variant' },
                { key: 'h/projects/project-1/image-old.v12.json/other' },
              ],
              truncated: true,
              cursor: 'metadata-page-two',
            },
      )
      const db = {
        ...buildDbWithContextRow({
          imageId: 'img-old',
          isPublished: true,
          isArchived: false,
          resourceHubId: 'hub-a',
        }),
        delete: vi.fn(() => ({
          where: dbDeleteWhere,
        })),
      }
      const put = vi.fn(async () => undefined)
      const head = vi.fn(async () => ({
        size: 1234,
        httpMetadata: { contentType: 'image/jpeg' },
      }))

      mockGuardedContext.mockResolvedValue({
        db,
        user: { id: 'u-1', isAnonymous: false },
        userId: 'u-1',
        userRoles: [],
        isAdminRequest: true,
        event: {
          request: new Request('https://example.test'),
          fetch: globalThis.fetch,
          locals: {
            platform: {
              env: {
                AUTH_SECRET: 'secret',
                CLOUDFLARE_ACCOUNT_ID: 'account-id',
                R2_S3_ACCESS_KEY_ID: 'access-key',
                R2_S3_SECRET_ACCESS_KEY: 'secret-key',
                PUBLIC_ASSET_BASE_URL: 'https://assets.example.test',
                ASSET_RAW_DEV: {
                  head,
                  put,
                  delete: deleteAssets,
                  list: listOriginals,
                },
                ASSET_RAW_PREVIEW: {
                  head: vi.fn(async (): Promise<unknown> => null),
                  put,
                },
                ASSET_RAW_PRODUCTION: {
                  head: vi.fn(async (): Promise<unknown> => null),
                  put,
                },
                ASSET_PUBLIC_DEV: {
                  put,
                  get: vi.fn(),
                  delete: deleteAssets,
                  list: vi.fn(async () => {
                    throw new Error('list: Unspecified error (0)')
                  }),
                },
                ASSET_PUBLIC_PREVIEW: { put, get: vi.fn() },
                ASSET_PUBLIC_PRODUCTION: { put, get: vi.fn() },
              },
              context: {
                waitUntil: vi.fn((promise: Promise<unknown>) => {
                  waitUntilPromises.push(promise)
                }),
              },
            },
            hub: null,
          },
        },
      })
      mockVerifyUploadToken.mockResolvedValue({
        publicId: 'h/projects/project-1/image-a',
        env: 'local',
        ctxType,
        ctxId: 'project-1',
        resourceSnapshot: missingSnapshot
          ? undefined
          : {
              imageId: 'img-old',
              modifiedAt: 'revision',
              organisationId: 'org-1',
              hubId: null,
            },
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1234,
        uploaderUserId: 'u-1',
        exp: Date.now() + 1000,
      })
      mockLoadImageById
        .mockResolvedValueOnce({
          id: 'img-old',
          publicId: sameAsset
            ? 'h/projects/project-1/image-a'
            : 'h/projects/project-1/image-old',
          env: 'local',
          version: 12,
        })
        .mockResolvedValueOnce(null)
      mockCreateImageRecord.mockResolvedValueOnce({
        id: 'img-new',
        publicId: 'h/projects/project-1/image-a',
      })

      if (staleContext) mockCreateUploadedResourceImage.mockResolvedValueOnce(null)
      const confirmation = remote.finalizeImageUpload({
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
      if (staleContext || missingSnapshot) {
        await expect(confirmation).rejects.toMatchObject({
          status: 409,
          body: { message: 'STALE_IMAGE_UPLOAD_CONTEXT' },
        })
        expect(waitUntilPromises).toHaveLength(0)
        expect(put).not.toHaveBeenCalled()
        expect(deleteAssets).not.toHaveBeenCalled()
        expect(db.delete).not.toHaveBeenCalled()
        consoleErrorSpy.mockRestore()
        return
      }
      await expect(confirmation).resolves.toMatchObject({
        data: {
          ctxType,
          ctxId: 'project-1',
        },
      })

      if (failDatabase) {
        await expect(Promise.all(waitUntilPromises)).rejects.toThrow(
          'database delete failed',
        )
        expect(deleteAssets).not.toHaveBeenCalled()
      } else if (
        sameAsset ||
        stillReferenced ||
        sharedStorage ||
        referenceLookupFails
      ) {
        await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined()
        expect(deleteAssets).not.toHaveBeenCalled()
      } else {
        // Storage-listing errors remain best-effort after the row has been removed.
        await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined()
        expect(deleteAssets).toHaveBeenCalled()
        expect(listOriginals).toHaveBeenCalledTimes(2)
        expect(listOriginals).toHaveBeenNthCalledWith(2, {
          prefix: 'h/projects/project-1/image-old.v',
          cursor: 'metadata-page-two',
        })
        expect(deleteAssets.mock.calls.flat(2)).toContain(
          'h/projects/project-1/image-old.v99.json',
        )
        expect(deleteAssets.mock.calls.flat(2)).not.toContain(
          'h/projects/project-1/image-old.variant',
        )
        expect(deleteAssets.mock.calls.flat(2)).not.toContain(
          'h/projects/project-1/image-old.v12.json/other',
        )
        expect(dbDeleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
          deleteAssets.mock.invocationCallOrder[0],
        )
      }
      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(dbDeleteWhere).toHaveBeenCalledTimes(1)
      if (sharedStorage || referenceLookupFails) {
        expect(mockHasImageStorageReference).toHaveBeenCalledWith(
          db,
          expect.objectContaining({
            env: 'local',
            publicId: 'h/projects/project-1/image-old',
          }),
        )
        expect(dbDeleteReturning.mock.invocationCallOrder[0]).toBeLessThan(
          mockHasImageStorageReference.mock.invocationCallOrder[0],
        )
      }
      if (referenceLookupFails)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[image.remote.cleanupDetachedResourceImage] storage cleanup failed',
          expect.objectContaining({
            error: expect.objectContaining({ message: 'reference lookup unavailable' }),
          }),
        )

      consoleErrorSpy.mockRestore()
    },
  )

  it('reads public pinned metadata without consulting mutable sidecars', async () => {
    mockGuardedContext.mockResolvedValue({ ...(await mockGuardedContext()), isAdminRequest: false })
    mockReadImageRevisionDelivery.mockResolvedValue({
      storageKey: 'retained/photo', storageNamespace: 'local', metadata: { rotation: 90, credit: 'Original credit' },
    })
    const response = await remote.getMetadata({
      publicId: 'retained/photo', env: 'local', imageRevisionId: 'retained-r1', profile: 'basic',
    })
    expect(response.data).toMatchObject({ rotation: 90, credit: 'Original credit' })
    expect(mockReadImageRevisionDelivery).toHaveBeenCalledWith(expect.anything(), 'retained-r1')
    expect(mockReadMetadataDocument).not.toHaveBeenCalled()
  })

  it.each(['missing', 'wrong-key', 'wrong-namespace'])('does not fall back from a %s pin', async scenario => {
    mockGuardedContext.mockResolvedValue({ ...(await mockGuardedContext()), isAdminRequest: false })
    if (scenario !== 'missing') mockReadImageRevisionDelivery.mockResolvedValue({
      storageKey: scenario === 'wrong-key' ? 'another/photo' : 'retained/photo',
      storageNamespace: scenario === 'wrong-namespace' ? 'production' : 'local', metadata: {},
    })
    await expect(remote.getMetadata({
      publicId: 'retained/photo', env: 'local', imageRevisionId: 'retained-r1', profile: 'basic',
    })).rejects.toMatchObject({ status: 404 })
    expect(mockReadMetadataDocument).not.toHaveBeenCalled()
  })

  it('refuses full pinned metadata without current admin intent', async () => {
    mockGuardedContext.mockResolvedValue({ ...(await mockGuardedContext()), isAdminRequest: false })
    await expect(remote.getMetadata({ publicId: 'retained/photo', imageRevisionId: 'retained-r1', profile: 'full' }))
      .rejects.toMatchObject({ status: 403 })
    expect(mockReadImageRevisionDelivery).not.toHaveBeenCalled()
  })

  it('does not use admin intent alone to reveal a private image revision', async () => {
    const current = await mockGuardedContext()
    mockGuardedContext.mockResolvedValue({ ...current, db: { ...current.db, get: vi.fn(async () => ({ imageId: 'private-image' })) } })
    mockGetImagesByIds.mockResolvedValue([])
    await expect(remote.getMetadata({ publicId: 'private/photo', imageRevisionId: 'private-r1', profile: 'full' }))
      .rejects.toMatchObject({ status: 404 })
    expect(mockReadMetadataDocument).not.toHaveBeenCalled()
  })

  it('getMetadata reads the metadata sidecar for the requested public id and env', async () => {
    mockGuardedContext.mockResolvedValue({
      ...(await mockGuardedContext()),
      db: buildDbWithContextRow({
        id: 'img-1',
        isPublished: true,
        isArchived: false,
        resourceHubId: 'hub-a',
        projectId: 'project-1',
        organisationId: 'org-1',
      }),
      userRoles: [{ type: 'organisation', organisationId: 'org-1', role: 'owner' }],
    })
    mockGetImagesByIds.mockResolvedValue([
      {
        id: 'img-1',
        publicId: 'h/hkghostsigns/example-id',
        env: 'production',
        featureId: 'feature-1',
        isPublished: true,
        isArchived: false,
      } as never,
    ])
    mockReadMetadataDocument.mockResolvedValue({
      document: {
        originalFilename: 'sample',
        originalExtension: 'jpg',
        originalWidth: 1200,
        originalHeight: 800,
        rotation: 90,
        cameraModel: 'Leica Q2',
        capturedAt: '2024-03-01T10:00:00.000Z',
        credit: 'Hype',
        metadata: null,
      },
      resolvedEnv: 'production',
      resolvedVersion: undefined,
    })

    const response = await remote.getMetadata({
      publicId: 'h/hkghostsigns/example-id',
      env: 'production',
      profile: 'basic',
    })

    expect(mockReadMetadataDocument).toHaveBeenCalledWith({
      platform: expect.any(Object),
      env: 'production',
      publicId: 'h/hkghostsigns/example-id',
      version: undefined,
    })
    expect(response.data).toEqual({
      originalFilename: 'sample',
      originalExtension: 'jpg',
      originalWidth: 1200,
      originalHeight: 800,
      rotation: 90,
      cameraModel: 'Leica Q2',
      capturedAt: '2024-03-01T10:00:00.000Z',
      credit: 'Hype',
      latitude: null,
      longitude: null,
    })
  })

  it('does not expose full metadata without explicit admin intent', async () => {
    mockGuardedContext.mockResolvedValue({
      ...(await mockGuardedContext()),
      isAdminRequest: false,
    })

    await expect(
      remote.getMetadata({
        publicId: 'h/hkghostsigns/example-id',
        profile: 'full',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockReadMetadataDocument).not.toHaveBeenCalled()
  })

  it('requires admin intent before checking canonical image occupancy', async () => {
    mockGuardedContext.mockResolvedValue({
      ...(await mockGuardedContext()),
      isAdminRequest: false,
    })

    await expect(
      remote.getFeatureCanonicalImageOccupancy({ featureIds: ['feature-1'] }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockLoadFeatureCanonicalImageOccupancy).not.toHaveBeenCalled()
  })

  it.each([false, true])('does not save unchanged logo metadata (stale=%s)', async stale => {
    const storage = await import('#lib/db/services/resourceLogoSnapshot.js')
    const editing = await import('#lib/api/services/resourceLogoEditing.js')
    vi.mocked(storage.hasResourceLogoStorage).mockResolvedValue(true)
    const baseline = vi.spyOn(editing, 'ensureLogoBaseline').mockResolvedValue({
      imageRevisionId: 'current', assetVersionId: 'asset',
      metadata: { version: 1234, presentationMode: 'contain' },
      asset: { storageNamespace: 'local', storageKey: 'logo', contentHash: 'a'.repeat(64), byteSize: 100, mediaType: 'image/png' },
    })
    const owners = vi.spyOn(editing, 'authorizeLogoOwners').mockResolvedValue(undefined as never)
    try {
      const operation = remote.updateImage({
        id: 'img-1', ctxType: 'project', ctxId: 'project-1',
        imageRevisionId: stale ? 'old' : 'current', data: { presentationMode: 'contain' },
      })
      if (stale) await expect(operation).rejects.toMatchObject({ status: 409 })
      else await expect(operation).resolves.toMatchObject({ unchanged: true })
      expect(mockUpdateImageForContext).not.toHaveBeenCalled()
    } finally {
      baseline.mockRestore()
      owners.mockRestore()
      vi.mocked(storage.hasResourceLogoStorage).mockResolvedValue(false)
    }
  })

  it.each([
    'success',
    'stale',
    'database-failure',
    'source-drift',
    'missing-metadata',
    'missing-source',
    'unchanged',
  ] as const)(
    'rotateImage preserves source objects while selecting metadata: %s',
    async scenario => {
      const put = vi.fn(async () => undefined)
      const originalGet = vi.fn(async (key: string) => {
        if (key === 'h/features/feature-1/image-a') {
          return {
            arrayBuffer: async () =>
              await sharp({
                create: {
                  width: 100,
                  height: 200,
                  channels: 3,
                  background: '#112233',
                },
              })
                .jpeg()
                .toBuffer(),
            httpMetadata: { contentType: 'image/jpeg' },
          }
        }

        return null
      })
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(2468)
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }))

      mockLoadImageById.mockResolvedValue({
        id: 'img-1',
        env: 'local',
        publicId: 'h/features/feature-1/image-a',
        version: 1234,
        featureId: 'feature-1',
      })

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
          locals: {
            platform: {
              env: {
                ENVIRONMENT: 'local',
                AUTH_SECRET: 'secret',
                CLOUDFLARE_ACCOUNT_ID: 'account-id',
                R2_S3_ACCESS_KEY_ID: 'access-key',
                R2_S3_SECRET_ACCESS_KEY: 'secret-key',
                PUBLIC_ASSET_BASE_URL: 'https://assets.example.test',
                ASSET_RAW_DEV: {
                  get: originalGet,
                  head: vi.fn(async () =>
                    scenario === 'missing-metadata'
                      ? { size: 1024, httpMetadata: { contentType: 'image/png' } }
                      : null,
                  ),
                  put,
                },
                ASSET_RAW_PREVIEW: { get: vi.fn(), head: vi.fn(), put },
                ASSET_RAW_PRODUCTION: { get: vi.fn(), head: vi.fn(), put },
                ASSET_PUBLIC_DEV: { put, get: vi.fn() },
                ASSET_PUBLIC_PREVIEW: { put, get: vi.fn() },
                ASSET_PUBLIC_PRODUCTION: { put, get: vi.fn() },
              },
              context: {
                waitUntil: mockWaitUntil,
              },
            },
            hub: null,
          },
        },
      })

      mockReadMetadataDocument.mockResolvedValue({
        document: {
          originalFilename: 'image.jpg',
          originalExtension: 'jpg',
          originalWidth: 100,
          originalHeight: 200,
          rotation: 0,
          cameraModel: null,
          capturedAt: null,
          credit: null,
          latitude: null,
          longitude: null,
          metadata: {
            uploadedWidth: '100',
            uploadedHeight: '200',
          },
          sourceVersion: 1234,
          uploadedAt: '2026-03-01T00:00:00.000Z',
          modifiedAt: '2026-03-01T00:00:00.000Z',
        },
        resolvedEnv: 'local',
        resolvedVersion: 1234,
      })

      if (scenario === 'missing-metadata' || scenario === 'missing-source') {
        mockReadMetadataDocument.mockResolvedValue({
          document: null,
          resolvedEnv: 'local',
          resolvedVersion: 1234,
        })
      }
      if (scenario === 'missing-source')
        fetchSpy.mockResolvedValue(new Response(null, { status: 404 }))

      const { getImageMutationSnapshot } = await import(
        '#lib/db/services/imageMutationScope.js'
      )
      vi.mocked(getImageMutationSnapshot).mockResolvedValueOnce({
        imageId: 'img-1',
        imageRevision: 'revision',
        assignmentRevision: 'assignment',
        scope: 'scope',
        source: {
          publicId:
            scenario === 'source-drift'
              ? 'changed-key'
              : 'h/features/feature-1/image-a',
          env: 'local',
          version: 1234,
        },
      })
      if (scenario === 'stale' || scenario === 'database-failure')
        mockUpdateImageForContext.mockRejectedValueOnce(
          scenario === 'stale' ? { status: 409 } : new Error('database unavailable'),
        )
      const operation = remote.rotateImage({
        id: 'img-1',
        ctxType: 'feature',
        ctxId: 'feature-1',
        rotation: scenario === 'unchanged' ? 0 : 90,
      })

      if (scenario === 'unchanged') {
        await expect(operation).resolves.toMatchObject({ unchanged: true })
        expect(put).not.toHaveBeenCalled()
        expect(mockUpdateImageForContext).not.toHaveBeenCalled()
        expect(mockEnqueueDerivedAssetWarmup).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      if (scenario === 'missing-source') {
        const rejected = expect(operation).rejects.toMatchObject({ status: 404 })
        await vi.runAllTimersAsync()
        await rejected
        expect(put).not.toHaveBeenCalled()
        expect(mockUpdateImageForContext).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      if (scenario === 'source-drift') {
        await expect(operation).rejects.toMatchObject({ status: 409 })
        expect(put).not.toHaveBeenCalled()
        expect(mockUpdateImageForContext).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      if (scenario === 'stale' || scenario === 'database-failure') {
        await expect(operation).rejects.toBeDefined()
        expect(put).toHaveBeenCalledTimes(1)
        for (const [key] of put.mock.calls as unknown as [string][])
          expect(key).toMatch(/^h\/features\/feature-1\/image-a\.v2468\.json$/)
        expect(mockEnqueueDerivedAssetWarmup).not.toHaveBeenCalled()
        expect(mockUpdateImageForContext).toHaveBeenCalledWith(
          expect.objectContaining({
            expectedSnapshot: expect.objectContaining({
              imageRevision: 'revision',
              assignmentRevision: 'assignment',
            }),
          }),
        )
        fetchSpy.mockRestore()
        dateNowSpy.mockRestore()
        return
      }
      const result = await operation
      for (const [key] of put.mock.calls as unknown as [string][])
        expect(key).toMatch(/^h\/features\/feature-1\/image-a.*\.json$/)
      expect(mockAssertPermissionsToUpdateImage).toHaveBeenCalled()
      expect(originalGet).not.toHaveBeenCalled()
      expect(put).toHaveBeenCalledTimes(4)
      expect(mockUpdateImageForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'img-1',
          ctxType: 'feature',
          ctxId: 'feature-1',
          data: {
            publicId: 'h/features/feature-1/image-a',
            env: 'local',
            version: 2468,
          },
        }),
      )
      expect(put).toHaveBeenCalledWith(
        'h/features/feature-1/image-a.v2468.json',
        expect.stringContaining('"rotation":90'),
        expect.any(Object),
      )
      if (scenario === 'missing-metadata') {
        const document = JSON.parse(
          (put.mock.calls as unknown as [string, string][])[0][1],
        )
        expect(document).toMatchObject({
          rotation: 90,
          sourceRotation: 0,
          renderRotation: 90,
        })
        expect(document.originalWidth).toBeNull()
        expect(document.originalHeight).toBeNull()
        expect(document.cameraModel).toBeUndefined()
      }
      expect(mockEnqueueDerivedAssetWarmup).toHaveBeenCalledWith({
        event: expect.objectContaining({
          request: expect.any(Request),
        }),
        env: 'local',
        publicId: 'h/features/feature-1/image-a',
        version: 2468,
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(result).toEqual({ data: { id: 'img-1' } })

      fetchSpy.mockRestore()
      dateNowSpy.mockRestore()
    },
  )

  it('rotateImage falls back to direct R2 metadata writes without reading the original', async () => {
    const put = vi
      .fn()
      .mockRejectedValueOnce(new Error('binding write unavailable'))
      .mockResolvedValue(undefined)
    const originalGet = vi.fn(async (): Promise<unknown> => null)
    const previewGet = vi.fn(async (): Promise<unknown> => null)
    const rotatedSource = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: '#445566',
      },
    })
      .jpeg()
      .toBuffer()
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(97531)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET')

        if (method === 'GET') {
          return new Response(rotatedSource, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
        }

        if (method === 'PUT') {
          return new Response(null, { status: 200 })
        }

        return new Response(null, { status: 500 })
      })

    mockLoadImageById.mockResolvedValue({
      id: 'img-2',
      env: 'local',
      publicId: 'h/features/feature-2/image-b',
      version: 4321,
      featureId: 'feature-2',
    })

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
        fetch: globalThis.fetch,
        locals: {
          platform: {
            env: {
              ENVIRONMENT: 'local',
              AUTH_SECRET: 'secret',
              CLOUDFLARE_ACCOUNT_ID: 'account-id',
              R2_S3_ACCESS_KEY_ID: 'access-key',
              R2_S3_SECRET_ACCESS_KEY: 'secret-key',
              PUBLIC_ASSET_BASE_URL: 'https://assets.example.test',
              ASSET_RAW_DEV: { get: originalGet, head: vi.fn(), put },
              ASSET_RAW_PREVIEW: { get: previewGet, head: vi.fn(), put },
              ASSET_RAW_PRODUCTION: { get: vi.fn(), head: vi.fn(), put },
              ASSET_PUBLIC_DEV: { put, get: vi.fn() },
              ASSET_PUBLIC_PREVIEW: { put, get: vi.fn() },
              ASSET_PUBLIC_PRODUCTION: { put, get: vi.fn() },
            },
            context: {
              waitUntil: mockWaitUntil,
            },
          },
          hub: null,
        },
      },
    })

    mockReadMetadataDocument.mockResolvedValue({
      document: {
        originalFilename: 'image.jpg',
        originalExtension: 'jpg',
        originalWidth: 120,
        originalHeight: 80,
        rotation: 0,
        cameraModel: null,
        capturedAt: null,
        credit: null,
        latitude: null,
        longitude: null,
        metadata: {
          uploadedWidth: '120',
          uploadedHeight: '80',
        },
        sourceVersion: 4321,
        uploadedAt: '2026-03-01T00:00:00.000Z',
        modifiedAt: '2026-03-01T00:00:00.000Z',
      },
      resolvedEnv: 'preview',
      resolvedVersion: 4321,
    })

    const { getImageMutationSnapshot } = await import(
      '#lib/db/services/imageMutationScope.js'
    )
    vi.mocked(getImageMutationSnapshot).mockResolvedValueOnce({
      imageId: 'img-2',
      imageRevision: 'revision',
      assignmentRevision: 'assignment',
      scope: 'scope',
      source: { publicId: 'h/features/feature-2/image-b', env: 'local', version: 4321 },
    })
    const result = await remote.rotateImage({
      id: 'img-2',
      ctxType: 'feature',
      ctxId: 'feature-2',
      rotation: 90,
    })

    expect(previewGet).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalled()
    expect(mockUpdateImageForContext).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'img-2',
        data: expect.objectContaining({
          env: 'preview',
          version: 97531,
        }),
      }),
    )
    expect(mockEnqueueDerivedAssetWarmup).toHaveBeenCalledWith({
      event: expect.objectContaining({
        request: expect.any(Request),
      }),
      env: 'preview',
      publicId: 'h/features/feature-2/image-b',
      version: 97531,
    })
    expect(result).toEqual({ data: { id: 'img-1' } })

    fetchSpy.mockRestore()
    dateNowSpy.mockRestore()
  })
})
