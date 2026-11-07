import { expect, it } from 'vitest'
import { historyOperation } from '#lib/bits/patterns/revisionHistory/presentation.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

const addition: RevisionDifference = {
  path: ['contact', 'values', 'option-id'],
  before: { present: false },
  after: {
    present: true,
    value: { record: { rank: 2 }, i18n: { en: { value: 'Telegram' } } },
  },
}

it('identifies whole-option additions and removals from absence, not the ID format', () => {
  expect(historyOperation(addition, true)).toEqual({
    label: 'New value',
    wholeEntity: true,
  })
  expect(
    historyOperation(
      { ...addition, before: addition.after, after: addition.before },
      true,
    ),
  ).toEqual({ label: 'Removed value', wholeEntity: true })
  expect(
    historyOperation({ ...addition, before: { present: true, value: null } }, true)
      .label,
  ).toBe('Updated value')
})

it('does not mistake a new translation or scalar for a new option', () => {
  expect(
    historyOperation(
      { ...addition, path: ['contact', 'values', 'option-id', 'i18n', 'ja'] },
      true,
    ).label,
  ).toBe('New translation')
  expect(
    historyOperation(
      { ...addition, path: ['contact', 'values', 'option-id', 'record', 'value'] },
      true,
    ).label,
  ).toBe('Updated value')
})

it('recognizes option ordering without treating arbitrary IDs as catalogue operations', () => {
  expect(
    historyOperation(
      {
        ...addition,
        path: ['contact', 'values', 'option-id', 'record', 'rank'],
        before: { present: true, value: 1 },
        after: { present: true, value: 2 },
      },
      true,
    ).label,
  ).toBe('Reordered value')
  expect(historyOperation(addition, false)).toEqual({
    label: 'Added',
    wholeEntity: false,
  })
})

import {
  groupHistoryLocales,
  localeGroupAction,
} from '#lib/revisions/historyLocaleGroups.js'
import { groupChanges } from '#lib/bits/patterns/revisionHistory/presentation.js'

it('groups gallery translations by photo and field rather than language', () => {
  const changes = ['alt', 'caption'].flatMap(field =>
    ['en', 'zh-Hans', 'zh-Hant'].map(locale => ({
      path: ['gallery', 'entries', 'photo-a', field, locale],
      before: { present: false as const },
      after: { present: true as const, value: `${field} ${locale}` },
    })),
  )
  const groups = groupHistoryLocales(changes)
  expect(groups).toHaveLength(2)
  expect(groups[0].path).toEqual(['gallery', 'entries', 'photo-a', 'alt'])
  expect(groups[0].rows.map(row => row.locale)).toEqual(['en', 'zh-Hans', 'zh-Hant'])
  expect(localeGroupAction(groups[0])).toBe('Added')
  expect(
    groupHistoryLocales([
      ...changes,
      { ...changes[0], path: ['gallery', 'entries', 'photo-b', 'alt', 'en'] },
    ]),
  ).toHaveLength(3)
})

it('groups newly added locale maps while preserving absence, null and empty text', () => {
  const groups = groupHistoryLocales([
    {
      path: ['i18n'],
      before: { present: false },
      after: {
        present: true,
        value: { en: { name: '', description: null }, ja: { name: '名前' } },
      },
    },
  ])
  expect(groups).toHaveLength(2)
  expect(groups[0].path).toEqual(['i18n', 'name'])
  expect(groups[0].rows[0].change.before).toEqual({ present: false })
  expect(groups[0].rows[0].change.after).toEqual({ present: true, value: '' })
  expect(groups[1].rows[0].change.after).toEqual({ present: true, value: null })
})

it('keeps property and option identities separate and handles mixed locale operations', () => {
  const change: RevisionDifference = {
    path: ['field', 'values', 'option-a', 'i18n', 'en', 'value'],
    before: { present: false },
    after: { present: true, value: 'New' },
  }
  const groups = groupHistoryLocales([
    change,
    {
      ...change,
      path: ['field', 'values', 'option-a', 'i18n', 'ja', 'value'],
      before: change.after,
      after: change.before,
    },
    { ...change, path: ['field', 'values', 'option-b', 'i18n', 'en', 'value'] },
  ])
  expect(groups).toHaveLength(2)
  expect(localeGroupAction(groups[0])).toBe('Updated')
  const presentation = groupChanges(
    groups.flatMap(group => group.rows.map(row => row.change)),
    { field: 'Contact' },
  )
  expect(presentation[0].fields).toHaveLength(2)
  expect(presentation[0].fields[0].rows).toHaveLength(2)
  expect(presentation[0].fields[0].label).not.toContain('English')
})
