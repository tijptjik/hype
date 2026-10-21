// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  effectiveAddressDivisions,
  groupAddressDivisions,
  localityParentPaths,
  localityPathOverrides,
  isApprovedLocalityPath,
  AddressDivisionOverridesSchema,
} from '#lib/addresses/divisions.js'
// TYPES
import type { AddressDivision } from '#lib/addresses/divisions.js'

const division = (
  id: string,
  kind: string,
  category: string,
  level: number | null = null,
): AddressDivision => ({
  id,
  class: kind,
  category,
  level,
  names: { en: { name: id } },
})
const ancestor = (item: AddressDivision, fullContainment: boolean | null = true) => ({
  id: item.id,
  class: item.class,
  fullContainment,
})
const ids = (members: AddressDivision[]) =>
  groupAddressDivisions(members).map(group => ({
    key: group.key,
    paths: group.paths.map(path => path.map(item => item.id)),
  }))

describe('address division relationships', () => {
  it('separates administrative, locality and physical island paths using source evidence', () => {
    const sar = division('Hong Kong', 'sar', 'administrative', 0)
    const area = division('Hong Kong Island area', 'area', 'administrative', 1)
    const district = division('Central and Western', 'district', 'administrative', 2)
    const macro = division('Central', 'macrohood', 'hood', 4)
    const micro = division('Lan Kwai Fong', 'microhood', 'hood', 6)
    const island = division('Hong Kong Island', 'major_island', 'landform')
    const city = division('Excluded city', 'city', 'locality')
    area.hierarchies = { administrative: [[ancestor(sar)]] }
    district.hierarchies = { administrative: [[ancestor(sar), ancestor(area)]] }
    micro.hierarchies = { locality: [[ancestor(city), ancestor(macro)]] }
    expect(ids([micro, district, island, area, macro, city, sar])).toEqual([
      { key: 'administrative', paths: [[sar.id, area.id, district.id]] },
      { key: 'locality', paths: [[macro.id, micro.id]] },
      { key: 'landform', paths: [[island.id]] },
    ])
  })
  it('does not infer ancestry from levels or matching names', () => {
    const area = division('same', 'area', 'administrative', 0)
    const district = division('district', 'district', 'administrative', 10)
    const island = {
      ...division('island', 'minor_island', 'landform'),
      names: area.names,
    }
    expect(ids([district, area, island])).toEqual([
      { key: 'administrative', paths: [[district.id], [area.id]] },
      { key: 'landform', paths: [[island.id]] },
    ])
  })
  it('keeps genuine alternative ancestry paths without inventing links between siblings', () => {
    const first = division('first', 'macrohood', 'hood')
    const second = division('second', 'macrohood', 'hood')
    const child = division('child', 'microhood', 'hood')
    child.hierarchies = { locality: [[ancestor(first)], [ancestor(second)]] }
    expect(ids([first, second, child])).toEqual([
      {
        key: 'locality',
        paths: [
          [first.id, child.id],
          [second.id, child.id],
        ],
      },
    ])
  })
  it.each([false, null, undefined])(
    'does not draw a containment link for %s evidence',
    fullContainment => {
      const group = division('group', 'island_group', 'landform')
      const island = division('island', 'minor_island', 'landform')
      island.hierarchies = {
        landform: [[{ id: group.id, class: group.class, fullContainment }]],
      }
      expect(ids([group, island])).toEqual([
        { key: 'landform', paths: [[group.id], [island.id]] },
      ])
    },
  )
  it('shows an island within its group despite both having null levels', () => {
    const group = division('Po Toi Islands', 'island_group', 'landform')
    const island = division('Po Toi', 'minor_island', 'landform')
    island.hierarchies = { landform: [[ancestor(group)]] }
    expect(ids([island, group])).toEqual([
      { key: 'landform', paths: [[group.id, island.id]] },
    ])
  })
  it('does not reintroduce a replaced locality through a surviving child hierarchy', () => {
    const old = division('old', 'macrohood', 'hood')
    const replacement = division('replacement', 'macrohood', 'hood')
    const child = division('child', 'microhood', 'hood')
    child.hierarchies = { locality: [[ancestor(old)]] }
    const effective = effectiveAddressDivisions(
      { available: true, memberships: [old, child], options: [old, replacement] },
      { macrohoodId: replacement.id },
    )
    const result = ids(effective)
    expect(result).toEqual([{ key: 'locality', paths: [[child.id], [replacement.id]] }])
  })
})

it('retains a selected source boundary path without rewriting geographic evidence', () => {
  const first = division('first', 'macrohood', 'hood', 4)
  const second = division('second', 'macrohood', 'hood', 4)
  const child = division('child', 'microhood', 'hood', 6)
  child.hierarchies = {
    locality: [[ancestor(first, false)], [ancestor(second, false)]],
  }
  const evidence = structuredClone(child)
  const overrides = localityPathOverrides([[second, child]])
  const effective = effectiveAddressDivisions(
    { available: true, memberships: [first, child], options: [first, second, child] },
    overrides,
  )
  expect(ids(effective)).toEqual([{ key: 'locality', paths: [[second.id, child.id]] }])
  expect(child).toEqual(evidence)
  expect(effective.find(item => item.id === child.id)?.hierarchies).toEqual(
    child.hierarchies,
  )
})

it('preserves standalone and overlapping source alternatives for boundary selection', () => {
  const parent = division('Mong Kok', 'macrohood', 'hood', 4)
  const child = division('Prince Edward', 'neighbourhood', 'hood', 5)
  child.hierarchies = { locality: [[ancestor(parent, false)], []] }
  expect(localityParentPaths(child, [parent, child])).toEqual([[parent], []])
})

it('rejects fabricated ancestry, skipped ancestors and multiple neighbourhood paths', () => {
  const original = division('original', 'macrohood', 'hood', 4)
  const custom = division('custom', 'macrohood', 'hood', 4)
  const child = division('child', 'microhood', 'hood', 6)
  child.hierarchies = { locality: [[ancestor(original)]] }
  const options = [original, custom, child]
  const definitions = new Map(options.map(item => [item.id, item]))
  expect(isApprovedLocalityPath([custom.id, child.id], definitions)).toBe(false)
  expect(isApprovedLocalityPath([child.id], definitions)).toBe(false)
  expect(isApprovedLocalityPath([original.id, child.id], definitions)).toBe(true)
  expect(
    AddressDivisionOverridesSchema.safeParse({
      localityPaths: [[original.id, child.id], [custom.id]],
    }).success,
  ).toBe(false)
  expect(() => localityPathOverrides([[original], [custom]])).toThrow(
    'MULTIPLE_LOCALITY_SELECTIONS',
  )
})
