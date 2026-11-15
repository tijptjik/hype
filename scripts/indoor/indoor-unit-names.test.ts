import { expect, test } from 'bun:test'
import { indoorUnitNames } from '../../src/lib/locations/indoorUnitNames'
test('unnamed polygons use physical category and supplied floor instead of an opaque ID', () => {
  expect(
    indoorUnitNames(
      {},
      { unit_category: 'room', level_name_en: 'Exit A Concourse Level' },
      [],
    ),
  ).toEqual({ en: 'Room · Exit A Concourse Level' })
  expect(
    indoorUnitNames(
      {},
      { unit_category: 'platform', unit_unitnumbername: 'Platform 2' },
      [],
    ),
  ).toEqual({ en: 'Platform 2' })
  expect(indoorUnitNames({}, { unit_category: 'lobby' }, [])).toEqual({ en: 'Lobby' })
})
test('tenant labels never become unit identity; original evidence remains unchanged', () => {
  const names = { en: '7-Eleven', 'zh-hant': '七.十一便利店\t' }
  expect(indoorUnitNames(names, {}, [{ names: { en: '7-Eleven' } }])).toEqual({
    en: 'Unit',
  })
  expect(names.en).toBe('7-Eleven')
  expect(
    indoorUnitNames(names, { unit_unitnumbername: 'KET 6' }, [
      { names: { en: '7-Eleven' } },
    ]),
  ).toEqual({ en: 'KET 6' })
})
test('physical codes survive even when occupant translations contain a tenant name', () => {
  expect(
    indoorUnitNames({ en: 'KOT 17', 'zh-hant': 'Tenant' }, {}, [
      { names: { en: 'Tenant' } },
    ]),
  ).toEqual({ en: 'KOT 17' })
  const names = { en: 'Stairs' }
  expect(indoorUnitNames(names, {}, [])).toBe(names)
})
