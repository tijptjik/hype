// DOMAIN
import { simplifiedChinese } from '../../src/lib/addresses/chinese'
import { DisplayTemplateDefinitionSchema } from '../../src/lib/templates/registry'
// TYPES
import type { DisplayTemplateDefinition } from '../../src/lib/templates/registry'

export const DONOR_LAYER = '1msQMcuqfHrP'
export const PAID_PROPERTY = '4ql4aG0vBWsc'
export const NAMING_MIGRATION = 'breadline-donor-naming:v1'
export const NAMING_TEMPLATE_ID = 'breadline-donor-generated-v1'
export const CANONICAL_DONOR_TEMPLATE_ID = '2966d49c-fa7d-4902-97c9-9e7b94f9c75a'
export type Names = Record<string, string>
export type DonorNaming = {
  branch: Names
  standalone: Names
  accessHints: Names
  format: Names
  paid: boolean | null
  notes: string[]
  review: string[]
}

/** Build the shared expression; project ownership follows the paid-area dependency.
 * @returns A localized, registry-valid template with complete naming precedence.
 */
export function donorNamingTemplate(): DisplayTemplateDefinition {
  return DisplayTemplateDefinitionSchema.parse({
    name: 'Breadline donor naming',
    code: 'breadline-donor-generated',
    target: 'feature',
    locales: Object.fromEntries(
      [
        ['en', 'Paid'],
        ['zh-Hant', '閘內'],
        ['zh-Hans', '闸内'],
      ].map(([locale, paid]) => [
        locale,
        '{{ pair(join(brand.name, format.name, " "), branch, " - ") ?? location.name ?? feature.name ?? join(brand.name, format.name, " ") }}' +
          `{{ optional(join(accessHint, cases(properties.${PAID_PROPERTY}, "${paid}", "", ""), " - "), " (", ")") }}`,
      ]),
    ),
  })
}

/** Normalize presentation whitespace without changing word boundaries.
 * @param value Authored name. @returns Trimmed, single-spaced text.
 */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Supply the three review languages, converting Chinese script from the Traditional source.
 * @param en English text. @param hant Traditional Chinese text. @returns Localized values.
 */
export function names(en: string, hant: string): Names {
  return {
    en: cleanName(en),
    'zh-Hant': cleanName(hant),
    'zh-Hans': simplifiedChinese(cleanName(hant)),
  }
}

/** Extract approved branch/access distinctions; ambiguous identity differences remain flagged.
 * @param id Donor identity. @param original Existing localized titles. @param address English address evidence.
 * @returns Proposed inputs, decisions and unresolved identity review notes.
 */
export function donorNamingInputs(
  id: string,
  original: Names,
  address: string,
): DonorNaming {
  const en = cleanName(original.en)
  const zh = cleanName(original['zh-Hant'] ?? original['zh-hant'] ?? '')
  const result: DonorNaming = {
    branch: {},
    standalone: {},
    accessHints: {},
    format: {},
    paid: null,
    notes: [],
    review: [],
  }
  if (
    Object.values(original).some(value => value !== cleanName(value)) ||
    /聖安娜-/.test(zh)
  )
    result.notes.push('Normalize whitespace and separator spacing')
  let branch = en.split(' - ').slice(1).join(' - ')
  let chineseBranch = zh.replace(/^(?:7-Eleven|.*?)\s*-\s*/, '')
  if (!branch) {
    result.standalone = names(
      id === 'blDc22e1a4ac' ? 'The Peninsula' : en,
      id === 'blDc22e1a4ac' ? '半島酒店' : zh,
    )
    result.notes.push('Use standalone name because no branch is supplied')
    if (id === 'blDc22e1a4ac')
      result.notes.push('Remove Hong Kong from Peninsula name as requested')
    return result
  }
  if (/Mayson Kayser/.test(en))
    result.notes.push('Correct Mayson Kayser to Maison Kayser using linked brand')
  for (const [before, after] of [
    ['Yau Mai Tei', 'Yau Ma Tei'],
    ['Sau Kei Wan', 'Shau Kei Wan'],
    ['Olympics MTR', 'Olympic MTR'],
  ]) {
    if (branch.includes(before)) {
      branch = branch.replace(before, after)
      result.notes.push(`Correct ${before} to ${after}`)
    }
  }
  if (/\bPAID\b/.test(branch)) {
    result.paid = true
    result.notes.push('Move PAID into the paid-area property; render in every language')
  } else if (/^unpaid$/i.test(address.trim())) {
    result.paid = false
    result.notes.push('Retain explicit unpaid address evidence as false')
  }
  branch = cleanName(branch.replace(/\bPAID\b/g, ''))
  chineseBranch = cleanName(chineseBranch.replace(/\bPAID\b/g, ''))
  let hint = ''
  let zhHint = ''
  // Station letters are store discriminators, never inferred exit identities.
  if (/\bMTR\b/.test(branch)) {
    let station = branch.startsWith('MTR ') ? branch.slice(4) : branch.split(' MTR')[0]
    let suffix = branch.startsWith('MTR ')
      ? ''
      : cleanName(branch.slice(branch.indexOf(' MTR') + 4))
    if (branch.startsWith('MTR ')) {
      const ending = station.match(
        / (A|B|C|D|E|F|G1|H|K|North Corner|North Corridor|Tickets|Princes Building)$/,
      )
      if (ending) {
        suffix = ending[1]
        station = station.slice(0, -ending[0].length)
      }
    }
    station = station
      .replace(/^Kowloon Station$/, 'Kowloon')
      .replace(/^Taikoo$/, 'Tai Koo')
    branch = `${station} MTR`
    hint = suffix
    const translations: Record<string, string> = {
      'North Corner': '北堂角店',
      'North Corridor': '北堂走廊店',
      Tickets: '售票處',
      'Princes Building': '太子大廈',
      'H (outside)': 'H；站外',
    }
    zhHint = translations[hint] ?? hint
    if (hint === 'H (outside)') hint = 'H; Outside station'
    chineseBranch = chineseBranch.replace(
      /(?:\s*(?:北堂角店|北堂走廊店|Tickets|售票處|太子大廈|[A-K]\d?(?:\s*\(站外\))?))$/,
      '',
    )
    chineseBranch = chineseBranch.replace(/([A-K]\d?)站$/, '站').trim()
    result.notes.push('Use station name followed by MTR')
  }
  if (id === 'blD87e50b287') {
    branch = 'Hong Kong MTR'
    chineseBranch = '香港站'
    hint = 'L1'
    zhHint = 'L1'
  }
  if (id === 'blDe9ad42e2c') {
    branch = 'Hong Kong MTR'
    chineseBranch = '香港站'
    hint = 'In-town Check-in'
    zhHint = '預辦登機大堂'
  }
  if (id === 'blD97a6d21df') {
    branch = 'Lohas Park MTR'
    result.notes.push('Retain station context already present in Chinese name')
  }
  if (id === 'blD61182f398') chineseBranch = '康城站'
  if (id === 'blDf8818b67a') chineseBranch = '坑口站'
  if (hint) {
    result.accessHints = names(hint, zhHint)
    result.notes.push('Move store discriminator or position into access hints')
  }
  // Blocks F/H belong to Whampoa Estate, not to the station discriminator scheme.
  if (id === 'blD87a4a78ec' || id === 'blD93411f44e')
    result.notes.push('Keep estate block in branch name')
  if (en.startsWith("Maxim's Cakes - ")) {
    result.format = names('Cakes', '')
    result.notes.push(
      'Compose Maxim’s plus the localized Cakes format; Chinese brand already includes 西餅',
    )
  }
  if (id === 'blD236b565af') {
    branch = 'Domain Mall'
    result.notes.push('Use Domain Mall instead of Yau Tong MTR as reviewed')
  }
  if (id === 'blD089ee14b9') {
    chineseBranch = '海港城'
    result.notes.push('Remove the extra final 港 from 海港城港 as reviewed')
  }
  result.branch = names(branch, chineseBranch)
  return result
}
