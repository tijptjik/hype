// THIRD-PARTY
import { ConverterBuilder } from 'opencc-js/core'
import * as t2cn from 'opencc-js/preset/t2cn'

let simplify: ((value: string) => string) | undefined

/** Convert Traditional Chinese presentation text without modifying source evidence.
 * @param value Published Traditional Chinese text.
 * @returns Simplified Chinese characters and vocabulary.
 */
export function simplifiedChinese(value: string): string {
  // Retain Hong Kong normalization and segmentation without the reverse direction's dictionaries.
  simplify ??= ConverterBuilder({
    from: { hk: t2cn.from.hk },
    to: { cn: t2cn.to.cn },
    configs: { hk2s: t2cn.configs.hk2s },
  })({ from: 'hk', to: 'cn' })
  return simplify(value)
}
