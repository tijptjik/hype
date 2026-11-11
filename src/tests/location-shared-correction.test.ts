// TESTS
import { expect, it } from 'vitest'
import {
  amendSharedCorrections,
  authorizeSharedCorrection,
  resolveSharedCorrections,
  SharedCorrectionPatchSchema,
} from '#lib/locations/sharedCorrection.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
} from '#lib/locations/factsSnapshot.js'
import type { LocationFacts } from '#lib/locations/model.js'
const source: LocationFacts = {
  names: { en: 'Source' },
  phoneNumber: ['+85221234567'],
  brands: [],
  location: {
    geometry: { type: 'Point', coordinates: [114, 22] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: {},
    },
  },
}
const edit = () =>
  amendSharedCorrections(
    {},
    { phoneNumber: { mode: 'override', value: ['+85229876543'] } },
    source,
    { actorId: 'editor', editedAt: '2026-11-10', sourceRevisionId: 'r1' },
  )
it('keeps human corrections when another sync repeats the same source evidence', () => {
  const shared = edit()
  expect(resolveSharedCorrections(source, shared).facts.phoneNumber).toEqual([
    '+85229876543',
  ])
  expect(shared.phoneNumber?.original.value).toEqual(source.phoneNumber)
  expect(source.phoneNumber).toEqual(['+85221234567'])
})
it('accepts changed source contacts and recognises agreement', () => {
  expect(
    resolveSharedCorrections({ ...source, phoneNumber: ['+85221111111'] }, edit())
      .status.phoneNumber,
  ).toBe('superseded')
  expect(
    resolveSharedCorrections({ ...source, phoneNumber: ['+85229876543'] }, edit())
      .status.phoneNumber,
  ).toBe('agreed')
})
it('does not resurrect retired corrections when upstream reverts', () => {
  const changes = edit()
  changes.phoneNumber!.supersededBy = 'r2'
  expect(resolveSharedCorrections(source, changes).facts.phoneNumber).toEqual(
    source.phoneNumber,
  )
})
it('distinguishes omitted contact data, explicit clear, and inheritance', () => {
  const changes = amendSharedCorrections(
    {},
    { websites: { mode: 'override', value: ['https://example.com'] } },
    source,
    { actorId: 'e', editedAt: 'now', sourceRevisionId: 'r1' },
  )
  expect(resolveSharedCorrections(source, changes).facts.websites).toEqual([
    'https://example.com',
  ])
  expect(
    resolveSharedCorrections({ ...source, websites: [] }, changes).facts.websites,
  ).toEqual([])
  expect(
    resolveSharedCorrections(
      source,
      amendSharedCorrections(changes, { websites: { mode: 'clear' } }, source, {
        actorId: 'e',
        editedAt: 'now',
        sourceRevisionId: 'r1',
      }),
    ).facts.websites,
  ).toEqual([])
})
it('applies Organisation suppression above a shared correction', () => {
  const facts = resolveSharedCorrections(source, edit()).facts
  expect(
    resolveFeatureLocation(facts, facts.location, { phoneNumber: { mode: 'clear' } })
      .phoneNumber,
  ).toBeNull()
})
it.each(['names', 'location', 'brands', 'footprint', 'entity', 'operatingStatus'])(
  'allows permissioned community %s edits without SuperAdmin',
  field => {
    expect(() =>
      authorizeSharedCorrection(
        { [field]: { mode: 'inherit' } },
        { canEdit: true, superAdmin: false },
      ),
    ).not.toThrow()
    expect(() =>
      authorizeSharedCorrection(
        { [field]: { mode: 'inherit' } },
        { canEdit: true, superAdmin: true },
      ),
    ).not.toThrow()
  },
)
it('allows project contact editors and rejects unauthorized writes and executable links', () => {
  expect(() =>
    authorizeSharedCorrection(
      { phoneNumber: { mode: 'clear' } },
      { canEdit: true, superAdmin: false },
    ),
  ).not.toThrow()
  expect(() =>
    authorizeSharedCorrection(
      { phoneNumber: { mode: 'clear' } },
      { canEdit: false, superAdmin: false },
    ),
  ).toThrow('FORBIDDEN')
  expect(
    SharedCorrectionPatchSchema.safeParse({
      websites: { mode: 'override', value: ['javascript:alert(1)'] },
    }).success,
  ).toBe(false)
})
it('round trips shared contacts in immutable facts snapshots', () => {
  const facts = {
    ...source,
    websites: ['https://example.com'],
    socials: { instagram: 'https://instagram.com/example' },
  }
  expect(
    readLocationFacts(createLocationFactsSnapshot(facts, 'establishment')),
  ).toMatchObject(facts)
})

it('retains a correction against omitted upstream phones without persisting parser metadata', () => {
  const changes = amendSharedCorrections(
    {},
    { phoneNumber: { mode: 'override', value: ['+85229876543'] } },
    { ...source, phoneNumber: [] },
    {
      actorId: 'editor',
      editedAt: 'now',
      sourceRevisionId: 'r1',
      omittedFields: ['phoneNumber'],
    },
  )
  expect(changes.phoneNumber?.original).toEqual({ present: false })
  expect(changes.phoneNumber).not.toHaveProperty('omittedFields')
  expect(
    resolveSharedCorrections({ ...source, phoneNumber: [] }, changes, true, [
      'phoneNumber',
    ]).facts.phoneNumber,
  ).toEqual(['+85229876543'])
  expect(resolveSharedCorrections(source, changes).status.phoneNumber).toBe(
    'superseded',
  )
})
it('rejects clearing required identity structures before preparing a write', () => {
  for (const field of ['location', 'entity'])
    expect(
      SharedCorrectionPatchSchema.safeParse({ [field]: { mode: 'clear' } }).success,
    ).toBe(false)
})

it('retains localized community identity, textual branch IDs and explicit clears', () => {
  const patch = SharedCorrectionPatchSchema.parse({
    branch: { mode: 'override', value: { en: 'Central', 'zh-Hant': '中環' } },
    format: { mode: 'override', value: { en: 'AROME Bakery' } },
    branchId: { mode: 'override', value: '0012' },
  })
  const metadata = { actorId: 'editor', editedAt: 'now', sourceRevisionId: 'r1' }
  const curated = amendSharedCorrections({}, patch, source, metadata)
  const facts = resolveSharedCorrections(source, curated).facts
  expect(facts.branch).toEqual({ en: 'Central', 'zh-Hant': '中環' })
  expect(facts.branchId).toBe('0012')
  expect(source).not.toHaveProperty('branch')
  const cleared = amendSharedCorrections(
    curated,
    { branch: { mode: 'clear' }, branchId: { mode: 'clear' } },
    source,
    metadata,
  )
  expect(resolveSharedCorrections(source, cleared).facts).toMatchObject({
    branch: {},
    branchId: '',
  })
})

it.each([false, true])(
  'keeps branch IDs internal even when SuperAdmin is %s',
  superAdmin => {
    for (const patch of [
      { branchId: { mode: 'override', value: '0012' } },
      { branchId: { mode: 'clear' } },
      { branchId: { mode: 'inherit' } },
      { entity: { mode: 'override', value: { details: { branchId: '0012' } } } },
    ])
      expect(() =>
        authorizeSharedCorrection(
          patch as Parameters<typeof authorizeSharedCorrection>[0],
          { canEdit: true, superAdmin },
        ),
      ).toThrow('BRANCH_ID_INTERNAL_ONLY')
  },
)
