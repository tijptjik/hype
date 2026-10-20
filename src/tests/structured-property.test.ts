import { describe, expect, it, vi } from 'vitest'
import {
  normalizeLinkValue,
  displayLinkValue,
  propertyValueRegistry,
  type LinkItem,
} from '#lib/properties/value.js'
import { validateFeaturePhoneProperties } from '#lib/db/services/feature-property-validation.js'
import {
  projectPropertyAudience,
  protectPropertyFilters,
  getInternalPropertyAccess,
} from '#lib/properties/audience.server.js'
import type { Database } from '#lib/types.js'
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const item = {
  id: 'one',
  url: 'https://example.org/book',
  label: { en: 'An edition', zhHant: '版本' },
}
const encode = (items: LinkItem[] = [item], version = 1) =>
  JSON.stringify({ version, items })

describe('structured property contract', () => {
  it('round trips labels, identity and ordering without touching destinations', () => {
    const raw = encode([{ ...item, id: 'two' }, item])
    expect(normalizeLinkValue({ cardinality: 'many' }, raw)).toBe(raw)
    expect(
      displayLinkValue(
        { cardinality: 'many', presentation: 'numberedReferences' },
        raw,
        ['zhHant'],
      ),
    ).toEqual({
      kind: 'links',
      numbered: true,
      links: [
        { id: 'two', url: item.url, label: '版本' },
        { id: 'one', url: item.url, label: '版本' },
      ],
    })
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    '//example.org',
    'https://a:b@example.org',
    'https://example.org/a b',
  ])('rejects unsafe destination %s', url => {
    expect(() => normalizeLinkValue({}, encode([{ ...item, url }]))).toThrow()
    expect(displayLinkValue({}, encode([{ ...item, url }]), ['en']).kind).toBe(
      'unavailable',
    )
  })
  it('enforces bounds, unique identity, required labels and cardinality', () => {
    for (const raw of [
      encode([item, item]),
      encode([{ ...item, label: { en: '' } }]),
      encode(Array.from({ length: 17 }, (_, i) => ({ ...item, id: String(i) }))),
    ])
      expect(() => normalizeLinkValue({ cardinality: 'many' }, raw)).toThrow()
    expect(() =>
      normalizeLinkValue({}, encode([item, { ...item, id: 'two' }])),
    ).toThrow()
    expect(normalizeLinkValue({}, encode([]))).toBeNull()
  })
  it('preserves unknown payloads on read and rejects their writes', () => {
    const raw = encode([item], 2)
    expect(displayLinkValue({}, raw, ['en']).kind).toBe('unavailable')
    expect(() => normalizeLinkValue({}, raw)).toThrow()
    expect(raw).toBe(encode([item], 2))
  })
  it('does not reinterpret legacy text or phone arrays and validates explicit scalar types', () => {
    expect(propertyValueRegistry.text.normalize('{not json')).toBe('{not json')
    expect(propertyValueRegistry.text.normalize('["+85223456789"]')).toBe(
      '["+85223456789"]',
    )
    expect(() => propertyValueRegistry.date.normalize('2025-02-30')).toThrow()
    expect(() => propertyValueRegistry.number.normalize('Infinity')).toThrow()
    expect(() => propertyValueRegistry.boolean.normalize('yes')).toThrow()
  })
  it('uses persisted definitions and rejects internal writes from public callers', async () => {
    const db = {
      query: {
        property: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'link',
              component: 'LinkField',
              dataType: 'link',
              cardinality: 'many',
            },
            { id: 'isbn', audience: 'internal', dataType: 'text' },
          ]),
        },
      },
    } as unknown as Database
    expect(
      await validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'link', valueJson: encode() }],
        new Set(),
      ),
    ).toMatchObject([{ value: null, valueJson: encode(), propertyValueId: null }])
    await expect(
      validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'link', value: 'text', valueJson: encode() }],
        new Set(),
      ),
    ).rejects.toThrow()
    await expect(
      validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'isbn', value: '9781234567890' }],
        new Set(['isbn']),
      ),
    ).resolves.toEqual([
      { propertyId: 'isbn', value: '9781234567890', valueJson: null },
    ])
    await expect(
      validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'isbn', value: 'secret' }],
        new Set(),
      ),
    ).rejects.toThrow('internal')
    await expect(
      validateFeaturePhoneProperties(
        db,
        [{ propertyId: 'unknown', valueJson: encode() }],
        new Set(),
      ),
    ).rejects.toThrow()
  })
})

describe('internal audience boundary', () => {
  it('removes metadata, assignments, nested values and keyed projections', () => {
    const input = {
      properties: [{ id: 'isbn', key: 'isbn' }, { id: 'author' }],
      feature: { properties: [{ propertyId: 'isbn', value: 'private' }] },
      keyed: { isbn: 'private', author: 'public' },
    }
    expect(projectPropertyAudience(input, new Set(['isbn']))).toEqual({
      properties: [{ id: 'author' }],
      feature: { properties: [] },
      keyed: { author: 'public' },
    })
    expect(input.properties).toHaveLength(2)
  })
  it('does not grant access from admin intent alone and rejects internal predicates', async () => {
    const ctx = {
      isAdminRequest: true,
      user: { id: 'stranger', isAnonymous: false },
      userRoles: [],
      db: {
        query: {
          property: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                { id: 'isbn', audience: 'internal', scope: 'project', projectId: 'p' },
              ]),
          },
          project: {
            findFirst: vi.fn().mockResolvedValue({ id: 'p', organisationId: 'org' }),
          },
          organisation: {
            findFirst: vi.fn().mockResolvedValue({ id: 'org', hubId: 'hub' }),
          },
        },
      },
    } as unknown as GuardedBaseContext
    expect((await getInternalPropertyAccess(ctx)).allowed.size).toBe(0)
    const editor = {
      ...ctx,
      userRoles: [
        { type: 'project', role: 'owner', projectId: 'p', userId: 'stranger' },
      ],
    } as GuardedBaseContext
    expect((await getInternalPropertyAccess(editor)).allowed.has('isbn')).toBe(true)
    expect(
      (await getInternalPropertyAccess({ ...editor, isAdminRequest: false })).allowed
        .size,
    ).toBe(0)
    expect(
      (
        await getInternalPropertyAccess({
          ...editor,
          userRoles: [
            { type: 'project', role: 'owner', projectId: 'other', userId: 'stranger' },
          ],
        } as GuardedBaseContext)
      ).allowed.size,
    ).toBe(0)
    await expect(
      protectPropertyFilters(
        { filters: { properties: { books: { isbn: ['secret'] } } } },
        ctx,
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      protectPropertyFilters(
        { filters: { properties: { books: { author: ['name'] } } } },
        ctx,
      ),
    ).resolves.toBeUndefined()
  })
})
