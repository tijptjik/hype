// @vitest-environment node
// TEST
import { expect, it } from 'vitest'
// REFERENCE
import { Converter as toTraditional } from 'opencc-js/cn2t'
import { Converter as toSimplified } from 'opencc-js/t2cn'
// APPLICATION
import { simplifiedChinese, traditionalChinese } from '#lib/addresses/chinese.js'

it('preserves the full presets normalization, phrases, and regional conversion', () => {
  const simplify = toSimplified({ from: 'hk', to: 'cn' })
  const traditionalize = toTraditional({ from: 'cn', to: 'hk' })
  const examples = [
    '香港九龍深水埗欽州街',
    '香港九龙深水埗钦州街',
    '軟件裏的出租車與頭髮',
    '软件里的出租车与头发',
    '乾隆年間的乾燥麪條',
    '干隆年间的干燥面条',
    '神福車',
    'Queen’s Road 123號地下A室',
    '',
    '台湾台风与后台开发',
  ]
  for (const text of examples) {
    expect(simplifiedChinese(text)).toBe(simplify(text))
    expect(traditionalChinese(text)).toBe(traditionalize(text))
  }
})
