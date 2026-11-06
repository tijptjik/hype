// TESTS
import { expect, it } from 'vitest'
// REVISIONS
import { changelogEntryActions } from './changelogFilters'
// TYPES
import type { ChangelogEntry } from './changelog'

const entry: ChangelogEntry = {
  key: 'entry',
  resourceType: 'feature',
  resourceId: 'f',
  name: 'Feature',
  category: 'publication',
  createdAt: '2026-11-06T00:00:00.000Z',
  actorId: 'editor',
  actorName: null,
  actorUsername: null,
  actorDisplayUsername: null,
  origin: 'user',
  reason: null,
  initial: false,
  baseline: false,
  unpublished: false,
  redacted: false,
  changes: [],
}
it('keeps initial snapshots, publications and creations distinct', () => {
  expect([
    ...changelogEntryActions({ ...entry, baseline: true, initial: true }),
  ]).toEqual(['baseline'])
  expect([...changelogEntryActions({ ...entry, initial: true })]).toEqual(['published'])
  expect([
    ...changelogEntryActions({ ...entry, category: 'profile', initial: true }),
  ]).toEqual(['created'])
  expect([...changelogEntryActions({ ...entry, unpublished: true })]).toEqual([
    'unpublished',
  ])
})
it('matches all visible operations without inferring hidden actions', () => {
  expect([...changelogEntryActions({ ...entry, redacted: true })]).toEqual(['updated'])
  expect(
    changelogEntryActions({
      ...entry,
      changes: [
        {
          path: ['record', 'isArchived'],
          before: { present: true, value: false },
          after: { present: true, value: true },
        },
        {
          path: ['properties', 'new'],
          before: { present: false },
          after: { present: true, value: 'Value' },
        },
        {
          path: ['properties', 'old'],
          before: { present: true, value: 'Value' },
          after: { present: false },
        },
      ],
    }),
  ).toEqual(new Set(['updated', 'archived', 'added', 'removed']))
})
