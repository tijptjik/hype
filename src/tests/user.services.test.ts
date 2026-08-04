import { describe, expect, it } from 'vitest'
import {
  toUserProfileResponseShape,
  toUserRelationsWithContributionConstraints,
  userEntityWithRelations,
} from '$lib/api/services/user'
import { GetUserParamsSchema } from '$lib/db/zod/schema/user'
import { getUserFeaturesByUserId } from '$lib/db/services/user'
import type { UserRaw } from '$lib/db/zod/schema/user.types'
import type { SessionUser } from '$lib/types'

const contributedUser = {
  id: 'user-1',
  name: 'Contributor',
  username: 'contributor',
  email: 'contributor@example.com',
  emailVerified: true,
  image: null,
  locale: 'en',
  attribution: null,
  isAnonymous: false,
  isArchived: false,
  preferences: '{}',
  experimental: '{}',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  contributedFeatures: [
    { id: 'feature-1', isPublished: true, projectId: 'project-1' },
    { id: 'feature-2', isPublished: false, projectId: 'project-1' },
  ],
  contributedImages: [
    {
      id: 'image-1',
      featureImage: {
        isPublished: true,
        featureId: 'feature-1',
        feature: { projectId: 'project-1' },
      },
    },
    {
      id: 'image-2',
      featureImage: {
        isPublished: false,
        featureId: 'feature-2',
        feature: { projectId: 'project-1' },
      },
    },
  ],
  contributedTasks: [
    { id: 'task-1', type: 'reportedMissing' },
    { id: 'task-2', type: 'newPhoto' },
  ],
}

describe('user contribution profiles', () => {
  it('loads the ancestry required to group feature and image contributions', () => {
    expect(userEntityWithRelations.contributedFeatures).toMatchObject({
      columns: { id: true, isPublished: true, projectId: true },
    })
    expect(userEntityWithRelations.contributedImages).toMatchObject({
      with: {
        featureImage: {
          columns: { isPublished: true, featureId: true },
          with: { feature: { columns: { projectId: true } } },
        },
      },
    })
  })

  it('includes contribution summaries in the current user profile', () => {
    expect(
      toUserProfileResponseShape(contributedUser as unknown as UserRaw, 'self'),
    ).toMatchObject({
      contributedFeatures: { 'project-1': ['feature-1'] },
      contributedImages: { 'project-1': ['image-1'] },
      reportedMissingCount: 1,
      newPhotoCount: 1,
      newFeatureCount: 0,
    })
  })

  it('accepts active prism filters for contribution profile reads', () => {
    expect(
      GetUserParamsSchema.parse({
        ref: 'user-1',
        prisms: {
          organisation: ['organisation-1'],
          project: ['project-1'],
          layer: ['layer-1'],
        },
      }).prisms,
    ).toEqual({
      organisation: ['organisation-1'],
      project: ['project-1'],
      layer: ['layer-1'],
    })
  })

  it('applies public layer and feature visibility to every contribution type', () => {
    let whereCallCount = 0
    const where = () => {
      whereCallCount += 1
      return {}
    }
    const db = {
      select: () => ({ from: () => ({ where }) }),
    }

    const relations = toUserRelationsWithContributionConstraints(
      db as unknown as Parameters<typeof toUserRelationsWithContributionConstraints>[0],
      {
        sessionUser: { id: 'user-1', superAdmin: true } as unknown as SessionUser,
        isAdminRequest: true,
      },
    )

    expect(whereCallCount).toBe(2)
    expect(relations.contributedFeatures).toHaveProperty('where')
    expect(relations.contributedImages).toHaveProperty('with.featureImage.where')
    expect(relations.contributedTasks).toHaveProperty('where')
  })
})

describe('getUserFeaturesByUserId', () => {
  it('returns an empty result when the userFeature schema is missing', async () => {
    const missingTableError = new Error('D1_ERROR: no such table: userFeature')
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: async () => {
                  throw missingTableError
                },
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getUserFeaturesByUserId>[0]

    await expect(
      getUserFeaturesByUserId(db, {
        userId: 'user-1',
      }),
    ).resolves.toEqual({
      data: [],
      totalCount: 0,
    })
  })
})
