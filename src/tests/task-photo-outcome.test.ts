// @vitest-environment node
import { expect, it } from 'vitest'
import { taskPhotoDecisionLabel } from '#lib/images/taskReviewOutcome.js'

const evidence = {
  status: 'accepted',
  imageIds: ['photo', 'research', 'unclassified'],
  submitted: { gallery: { order: ['existing', 'photo', 'research', 'unclassified'] } },
  content: {
    gallery: {
      entries: {
        existing: { intent: 'canonical' },
        photo: { intent: 'general' },
        research: { intent: 'research' },
        unclassified: { intent: 'undefined' },
      },
    },
  },
  excluded: [] as string[],
}

it('labels submitted accepted photos and research while leaving existing context unlabelled', () => {
  expect(taskPhotoDecisionLabel(evidence, 'photo')).toBe('ACCEPTED')
  expect(taskPhotoDecisionLabel(evidence, 'research')).toBe('ACCEPTED')
  expect(taskPhotoDecisionLabel(evidence, 'existing')).toBeNull()
})

it('labels rejected proposals and individually excluded photos as rejected', () => {
  expect(taskPhotoDecisionLabel({ ...evidence, status: 'rejected' }, 'photo')).toBe(
    'REJECTED',
  )
  expect(taskPhotoDecisionLabel({ ...evidence, excluded: ['photo'] }, 'photo')).toBe(
    'REJECTED',
  )
  expect(
    taskPhotoDecisionLabel({ ...evidence, status: 'rejected' }, 'existing'),
  ).toBeNull()
})

it('distinguishes classified-only acceptance from accepting all photos', () => {
  expect(
    taskPhotoDecisionLabel(evidence, 'unclassified', 'added-classified-photos'),
  ).toBe('REJECTED')
  expect(taskPhotoDecisionLabel(evidence, 'unclassified', 'added-all-photos')).toBe(
    'ACCEPTED',
  )
  expect(taskPhotoDecisionLabel(evidence, 'research', 'added-classified-photos')).toBe(
    'ACCEPTED',
  )
})

it('keeps pending exclusions provisional and handles initial proposals without imageIds', () => {
  expect(
    taskPhotoDecisionLabel({ ...evidence, status: 'submitted' }, 'photo'),
  ).toBeNull()
  expect(
    taskPhotoDecisionLabel(
      { ...evidence, status: 'submitted', excluded: ['photo'] },
      'photo',
    ),
  ).toBe('Excluded')
  expect(taskPhotoDecisionLabel({ ...evidence, imageIds: undefined }, 'photo')).toBe(
    'ACCEPTED',
  )
  expect(taskPhotoDecisionLabel(undefined, 'photo')).toBeNull()
})
