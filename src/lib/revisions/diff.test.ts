import { expect, it } from 'vitest'
import { diffRevisionValues } from './diff'

it('distinguishes removals, nulls and ordered gallery changes', () => {
  expect(
    diffRevisionValues(
      { present: true, value: { name: 'Old', removed: null, gallery: ['a', 'b'] } },
      { present: true, value: { name: 'New', added: null, gallery: ['b', 'a'] } },
    ),
  ).toEqual([
    {
      path: ['added'],
      before: { present: false },
      after: { present: true, value: null },
    },
    {
      path: ['gallery'],
      before: { present: true, value: ['a', 'b'] },
      after: { present: true, value: ['b', 'a'] },
    },
    {
      path: ['name'],
      before: { present: true, value: 'Old' },
      after: { present: true, value: 'New' },
    },
    {
      path: ['removed'],
      before: { present: true, value: null },
      after: { present: false },
    },
  ])
})
it('ignores object key order and safely compares prototype-like keys', () => {
  expect(
    diffRevisionValues(
      { present: true, value: { a: 1, b: 2 } },
      { present: true, value: { b: 2, a: 1 } },
    ),
  ).toEqual([])
  expect(
    diffRevisionValues(
      { present: true, value: {} },
      { present: true, value: JSON.parse('{"__proto__":"value"}') },
    ),
  ).toHaveLength(1)
})
