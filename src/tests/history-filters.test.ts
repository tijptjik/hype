import { expect, it } from 'vitest'
import {
  featureHistoryFilterEntry,
  historyFilterOptions,
  resourceHistoryFilterEntry,
} from '#lib/revisions/historyFilters.js'
import { matchesChangelogFilters } from '#lib/revisions/changelogFilters.js'

const entry = {
  id: 'revision',
  actorId: 'actor',
  actor: { name: 'Editor', username: 'editor', displayUsername: 'Editor', image: null },
  origin: 'user',
  reason: 'Updated title',
  createdAt: '2026-11-11T12:00:00.000Z',
  initial: false,
  changes: [
    {
      path: ['title'],
      before: { present: true as const, value: 'Old' },
      after: { present: true as const, value: 'New' },
    },
  ],
}
it('uses the shared actor, period, source, category and action rules for record history', () => {
  const evidence = resourceHistoryFilterEntry(entry, 'organisation', 'profile')
  expect(
    matchesChangelogFilters(evidence, {
      actor: { id: 'actor', origin: 'user' },
      from: '2026-11-11',
      to: '2026-11-11',
      action: 'updated',
      category: 'profile',
    }),
  ).toBe(true)
  expect(matchesChangelogFilters(evidence, { origin: 'migration' })).toBe(false)
  expect(matchesChangelogFilters(evidence, { from: '2026-11-12' })).toBe(false)
  expect(matchesChangelogFilters(evidence, { action: 'added' })).toBe(false)
})
it('uses visible comparison actions and original baseline attribution for feature history', () => {
  const evidence = featureHistoryFilterEntry({
    ...entry,
    revisionId: 'revision',
    generation: 0,
    origin: 'migration',
    baselineActor: {
      actorId: 'original',
      actorName: 'Contributor',
      actorUsername: null,
      actorDisplayUsername: null,
      role: 'contributor',
    },
  })
  expect(
    matchesChangelogFilters(evidence, {
      action: 'baseline',
      actor: { id: 'original', origin: 'user' },
    }),
  ).toBe(true)
  expect(historyFilterOptions([evidence]).actors[0]).toMatchObject({
    id: 'original',
    origin: 'user',
    label: 'Contributor',
  })
})
it('derives choices from unfiltered loaded evidence and deduplicates actors', () => {
  const evidence = resourceHistoryFilterEntry(entry, 'project', 'profile')
  const options = historyFilterOptions([
    evidence,
    { ...evidence, createdAt: '2026-11-10T12:00:00.000Z' },
  ])
  expect(options.actors).toHaveLength(1)
  expect(options.period).toEqual({
    from: '2026-11-10T12:00:00.000Z',
    to: entry.createdAt,
  })
})
