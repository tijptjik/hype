import { describe, expect, it } from 'vitest'
import {
  filterProfileContributions,
  sortContributionGroups,
} from '#lib/contributions/presentation.js'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

describe('profile contribution presentation', () => {
  const profile = {
    contributedFeatures: {
      mixed: ['published', 'submitted', 'rejected'],
      private: ['unpublished'],
    },
    contributedImages: { mixed: ['public-photo', 'private-photo'] },
    privateContributions: {
      features: { submitted: {}, rejected: {}, unpublished: {} },
      images: { 'private-photo': {} },
    },
  } as unknown as UserProfile
  it('defaults to published entries and removes empty groups without mutating cached data', () => {
    const filtered = filterProfileContributions(profile)
    expect(filtered?.contributedFeatures).toEqual({ mixed: ['published'] })
    expect(filtered?.contributedImages).toEqual({ mixed: ['public-photo'] })
    expect(profile.contributedFeatures.mixed).toEqual([
      'published',
      'submitted',
      'rejected',
    ])
    expect(filterProfileContributions(null)).toBeUndefined()
  })
  it('restores every contribution when switched to All', () => {
    expect(filterProfileContributions(profile, true)).toBe(profile)
  })
  it('interleaves publication states by creation date before pagination', () => {
    const groups = {
      project: [
        'published-old',
        'submitted-new',
        'published-middle',
        'rejected-oldest',
      ],
    }
    const dates = new Map([
      ['published-old', '2026-03-01'],
      ['submitted-new', '2026-10-01'],
      ['published-middle', '2026-09-01'],
      ['rejected-oldest', '2025-12-01'],
    ])
    expect(sortContributionGroups(groups, dates).project).toEqual([
      'submitted-new',
      'published-middle',
      'published-old',
      'rejected-oldest',
    ])
    expect(groups.project[0]).toBe('published-old')
  })
})
