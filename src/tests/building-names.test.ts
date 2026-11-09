import { expect, it } from 'vitest'
import { buildingNames } from '#lib/addresses/buildingNames.js'

it('keeps published translations without presenting the combined title as a locale', () => {
  const names = {
    en: 'Golden Gate Commercial Building',
    'zh-Hant': '金門商業大廈',
    und: '金門商業大廈 Golden Gate Commercial Building',
  }
  expect(buildingNames(names)).toEqual({
    en: names.en,
    'zh-hant': names['zh-Hant'],
    'zh-hans': '金门商业大厦',
  })
  expect(names.und).toBeTruthy()
})
it('splits a bilingual fallback only into missing language names', () => {
  expect(buildingNames({}, '金門商業大廈 Golden Gate Commercial Building')).toEqual({
    en: 'Golden Gate Commercial Building',
    'zh-hant': '金門商業大廈',
    'zh-hans': '金门商业大厦',
  })
  expect(
    buildingNames(
      { en: 'Published name' },
      '金門商業大廈 Golden Gate Commercial Building',
    ).en,
  ).toBe('Published name')
  expect(buildingNames({}, 'パン屋')).toEqual({})
})
