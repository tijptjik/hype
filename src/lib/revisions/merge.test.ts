import { describe, expect, it } from 'vitest'
import { mergeRevisionContent, resolveRevisionContent } from './merge'

describe('dependent Feature values', () => {
  const policy = { isAtomic: (path: readonly string[]) => path.length === 1 && path[0] === 'location' }
  const base = { location: { locationId: 'old-place', factsRevisionId: 'old-facts' }, title: 'Old' }
  const current = { ...base, location: { ...base.location, locationId: 'new-place' }, title: 'Accepted' }
  const proposed = { ...base, location: { ...base.location, factsRevisionId: 'new-facts' } }

  it('does not construct an unreviewed combination of accepted Location references', () => {
    expect(mergeRevisionContent(base, current, proposed, policy)).toMatchObject({
      status: 'conflict', conflicts: [{ path: ['location'],
        current: { value: current.location }, proposed: { value: proposed.location } }],
    })
  })

  it('requires a decision for the whole dependent value and retains independent changes', () => {
    const location = { locationId: 'reviewed-place', factsRevisionId: 'reviewed-facts' }
    expect(resolveRevisionContent(base, current, proposed, [
      { path: ['location'], result: { present: true, value: location } },
    ], policy)).toEqual({ location, title: 'Accepted' })
    expect(() => resolveRevisionContent(base, current, proposed, [
      { path: ['location', 'factsRevisionId'], result: { present: true, value: 'new-facts' } },
    ], policy)).toThrow('Resolve every displayed conflict')
  })

  it('allows a whole-value change when the other branch leaves it alone or agrees', () => {
    expect(mergeRevisionContent(base, { ...base, title: 'Accepted' }, proposed, policy))
      .toEqual({ status: 'merged', value: { ...proposed, title: 'Accepted' } })
    expect(mergeRevisionContent(base, proposed, proposed, policy))
      .toEqual({ status: 'merged', value: proposed })
  })

  it('supports keyed property boundaries without treating all properties as one conflict', () => {
    const properties = { a: { selection: 'v1', value: null }, b: { value: 'Old' } }
    const result = mergeRevisionContent(
      { properties },
      { properties: { ...properties, a: { selection: 'v2', value: null } } },
      { properties: { ...properties, a: { selection: 'v1', value: 'Scalar' }, b: { value: 'New' } } },
      { isAtomic: path => path.length === 2 && path[0] === 'properties' },
    )
    expect(result).toMatchObject({ status: 'conflict', conflicts: [{ path: ['properties', 'a'] }] })
  })
})

describe('revision proposal reconciliation', () => {
  it('preserves accepted changes when a second proposal changes another locale', () => {
    const base = { en: { name: 'Bakery' }, zh: { name: '舊名' } }
    expect(
      mergeRevisionContent(
        base,
        { ...base, en: { name: 'Bakery Café' } },
        { ...base, zh: { name: '新名' } },
      ),
    ).toEqual({
      status: 'merged',
      value: { en: { name: 'Bakery Café' }, zh: { name: '新名' } },
    })
  })
  it('reports overlapping changes without returning content suitable for publication', () => {
    expect(mergeRevisionContent({ name: 'Old' }, { name: 'A' }, { name: 'B' })).toEqual(
      {
        status: 'conflict',
        conflicts: [
          {
            path: ['name'],
            base: { present: true, value: 'Old' },
            current: { present: true, value: 'A' },
            proposed: { present: true, value: 'B' },
          },
        ],
      },
    )
  })
  it('accepts identical concurrent edits', () => {
    expect(
      mergeRevisionContent({ name: 'Old' }, { name: 'New' }, { name: 'New' }),
    ).toEqual({ status: 'merged', value: { name: 'New' } })
  })
  it('distinguishes removal from null and detects gallery removal versus metadata edit', () => {
    expect(
      mergeRevisionContent({ caption: 'Old' }, {}, { caption: null }),
    ).toMatchObject({
      status: 'conflict',
      conflicts: [
        { current: { present: false }, proposed: { present: true, value: null } },
      ],
    })
    expect(
      mergeRevisionContent(
        { images: { a: { caption: 'Old' } } },
        { images: {} },
        { images: { a: { caption: 'New' } } },
      ),
    ).toMatchObject({ status: 'conflict', conflicts: [{ path: ['images', 'a'] }] })
  })
  it('merges gallery metadata independently but requires review for competing order changes', () => {
    const base = {
      images: { a: { caption: 'A' }, b: { caption: 'B' } },
      order: ['a', 'b'],
    }
    expect(
      mergeRevisionContent(
        base,
        { ...base, order: ['b', 'a'] },
        { ...base, images: { ...base.images, a: { caption: 'New' } } },
      ),
    ).toMatchObject({
      status: 'merged',
      value: { order: ['b', 'a'], images: { a: { caption: 'New' } } },
    })
    expect(
      mergeRevisionContent(['a', 'b', 'c'], ['b', 'a', 'c'], ['a', 'c', 'b']),
    ).toMatchObject({ status: 'conflict' })
  })
  it('retains independent additions and does not mutate input or alias output', () => {
    const base = { items: {} }
    const current = { items: { a: { value: 1 } } }
    const result = mergeRevisionContent(base, current, { items: { b: { value: 2 } } })
    expect(result).toEqual({
      status: 'merged',
      value: { items: { a: { value: 1 }, b: { value: 2 } } },
    })
    expect(current).toEqual({ items: { a: { value: 1 } } })
    if (result.status === 'merged') expect(result.value).not.toBe(current)
  })
  it('safely retains JSON property names without changing object prototypes', () => {
    const base = JSON.parse('{"__proto__":{"name":"old"},"x":1}')
    const current = JSON.parse('{"__proto__":{"name":"old"},"x":2}')
    const proposed = JSON.parse('{"__proto__":{"name":"new"},"x":1}')
    const result = mergeRevisionContent(base, current, proposed)
    expect(result.status).toBe('merged')
    if (result.status === 'merged') {
      expect(Object.hasOwn(result.value as object, '__proto__')).toBe(true)
      expect(JSON.stringify(result.value)).toBe('{"__proto__":{"name":"new"},"x":2}')
    }
  })
})

describe('explicit conflict resolution', () => {
  it('retains independent changes while recording a reviewer choice for the conflict', () => {
    expect(
      resolveRevisionContent(
        { name: 'Old', caption: 'Old' },
        { name: 'A', caption: 'Accepted' },
        { name: 'B', caption: 'Old' },
        [{ path: ['name'], result: { present: true, value: 'Resolved' } }],
      ),
    ).toEqual({ name: 'Resolved', caption: 'Accepted' })
  })
  it('supports removal and root gallery ordering decisions', () => {
    expect(
      resolveRevisionContent({ name: 'Old' }, { name: 'A' }, { name: 'B' }, [
        { path: ['name'], result: { present: false } },
      ]),
    ).toEqual({})
    expect(
      resolveRevisionContent(
        ['a', 'b', 'c'],
        ['b', 'a', 'c'],
        ['a', 'c', 'b'],
        [{ path: [], result: { present: true, value: ['c', 'a', 'b'] } }],
      ),
    ).toEqual(['c', 'a', 'b'])
  })
  it('rejects incomplete, duplicated or unrelated resolutions', () => {
    const base = { name: 'Old' },
      current = { name: 'A' },
      proposed = { name: 'B' }
    const choice = { path: ['name'], result: { present: false as const } }
    expect(() => resolveRevisionContent(base, current, proposed, [])).toThrow()
    expect(() =>
      resolveRevisionContent(base, current, proposed, [choice, choice]),
    ).toThrow()
    expect(() =>
      resolveRevisionContent(base, current, proposed, [{ ...choice, path: ['other'] }]),
    ).toThrow()
  })
})
