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
