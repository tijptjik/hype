// CONTENT LOCALES
import { ContentLocaleSchema, normalizeContentLocale } from './model'
// TYPES
import type { ContentLocale } from './model'

/**
 * Maintained authoring catalogue: reviewed language/script/region combinations.
 * Add entries here with an explicit autonym and search name; Intl is not a registry.
 * This list never restricts existing record translation keys.
 */
const entries = [
  ['en', 'English', 'English'],
  ['zh-Hant', '繁體中文', 'Traditional Chinese', 'zhHant', 'Cantonese', 'yue', '粵語', '粤语'],
  ['zh-Hans', '简体中文', 'Simplified Chinese', 'zhHans'],
  ['ja', '日本語', 'Japanese'],
  ['ko', '한국어', 'Korean'],
  ['pt-BR', 'Português (Brasil)', 'Brazilian Portuguese'],
  ['pt-PT', 'Português (Portugal)', 'European Portuguese'],
  ['pt', 'Português', 'Portuguese'],
  ['fr', 'Français', 'French'],
  ['de', 'Deutsch', 'German'],
  ['es', 'Español', 'Spanish'],
  ['it', 'Italiano', 'Italian'],
  ['nl', 'Nederlands', 'Dutch'],
  ['ar', 'العربية', 'Arabic'],
  ['he', 'עברית', 'Hebrew', 'iw'],
  ['hi', 'हिन्दी', 'Hindi'],
  ['bn', 'বাংলা', 'Bengali'],
  ['ur', 'اردو', 'Urdu'],
  ['pa', 'ਪੰਜਾਬੀ', 'Punjabi'],
  ['ta', 'தமிழ்', 'Tamil'],
  ['te', 'తెలుగు', 'Telugu'],
  ['ne', 'नेपाली', 'Nepali'],
  ['th', 'ไทย', 'Thai'],
  ['vi', 'Tiếng Việt', 'Vietnamese'],
  ['id', 'Bahasa Indonesia', 'Indonesian', 'in'],
  ['ms', 'Bahasa Melayu', 'Malay'],
  ['fil', 'Filipino', 'Filipino', 'tl', 'Tagalog'],
  ['my', 'မြန်မာဘာသာ', 'Burmese'],
  ['km', 'ភាសាខ្មែរ', 'Khmer'],
  ['lo', 'ລາວ', 'Lao'],
  ['ru', 'Русский', 'Russian'],
  ['uk', 'Українська', 'Ukrainian'],
  ['pl', 'Polski', 'Polish'],
  ['cs', 'Čeština', 'Czech'],
  ['sk', 'Slovenčina', 'Slovak'],
  ['hu', 'Magyar', 'Hungarian'],
  ['ro', 'Română', 'Romanian'],
  ['bg', 'Български', 'Bulgarian'],
  ['el', 'Ελληνικά', 'Greek'],
  ['tr', 'Türkçe', 'Turkish'],
  ['fa', 'فارسی', 'Persian'],
  ['sv', 'Svenska', 'Swedish'],
  ['da', 'Dansk', 'Danish'],
  ['nb', 'Norsk bokmål', 'Norwegian Bokmål'],
  ['fi', 'Suomi', 'Finnish'],
  ['is', 'Íslenska', 'Icelandic'],
  ['sw', 'Kiswahili', 'Swahili'],
  ['af', 'Afrikaans', 'Afrikaans'],
  ['ca', 'Català', 'Catalan'],
  ['eu', 'Euskara', 'Basque'],
  ['en-GB', 'English (United Kingdom)', 'British English'],
  ['en-US', 'English (United States)', 'American English'],
  ['zh', '中文', 'Chinese'],
  ['sr-Cyrl', 'Српски', 'Serbian (Cyrillic)'],
  ['sr-Latn', 'Srpski', 'Serbian (Latin)'],
] as const

export interface ContentLocaleSearchRecord {
  locale: ContentLocale
  autonym: string
  name: string
  aliases: readonly string[]
}

export const CONTENT_LOCALE_CATALOGUE = Object.freeze(
  entries.map(([tag, autonym, englishName, ...aliases]) =>
    Object.freeze({
      locale: ContentLocaleSchema.parse(tag),
      autonym,
      englishName,
      aliases: Object.freeze(aliases),
    }),
  ),
)
const eligibleTags = new Set<string>(
  [
    ...CONTENT_LOCALE_CATALOGUE.map(entry => entry.locale),
    // Retired search choices remain writable so existing settings can be saved unchanged.
    'zh-Hant-HK', 'zh-Hant-TW', 'zh-Hans-CN', 'zh-Hans-SG', 'yue',
  ],
)
export const SupportedContentLocaleSchema = ContentLocaleSchema.refine(
  locale => eligibleTags.has(locale),
  'Choose a language from the content locale catalogue.',
)

/**
 * Gets a localized name with a safe code fallback when runtime names are missing.
 * @param tag - Known or previously stored language tag.
 * @param displayLocale - UI language; legacy keys are accepted.
 * @returns Localized language name or the canonical/input code.
 */
export function getContentLocaleName(tag: string, displayLocale = 'en'): string {
  const locale = normalizeContentLocale(tag)
  if (!locale) return tag
  try {
    return (
      new Intl.DisplayNames([normalizeContentLocale(displayLocale) ?? 'en'], {
        type: 'language',
        fallback: 'none',
      }).of(locale) || locale
    )
  } catch {
    return locale
  }
}

/**
 * Builds a search/display record, including for tags absent from the catalogue.
 * @param tag - Valid content tag.
 * @param displayLocale - User interface language.
 * @returns Display record; unknown autonyms fall back to the code.
 */
export function getContentLocaleRecord(
  tag: string,
  displayLocale = 'en',
): ContentLocaleSearchRecord {
  const locale = ContentLocaleSchema.parse(tag)
  const entry = CONTENT_LOCALE_CATALOGUE.find(item => item.locale === locale)
  return {
    locale,
    autonym: entry?.autonym ?? locale,
    name: getContentLocaleName(locale, displayLocale),
    aliases: entry?.aliases ?? [],
  }
}

/**
 * Searches the maintained catalogue in stable catalogue order.
 * @param options - Query text, UI language, and optional maximum result count.
 * @returns Matching records with autonym, localized name, canonical tag and aliases.
 */
export function queryContentLocales(
  options: { query?: string; displayLocale?: string; limit?: number } = {},
): ContentLocaleSearchRecord[] {
  const query = (options.query ?? '').trim().toLocaleLowerCase()
  const matches = CONTENT_LOCALE_CATALOGUE.flatMap(entry => {
    const record = getContentLocaleRecord(entry.locale, options.displayLocale)
    const terms = [
      record.locale,
      record.autonym,
      record.name,
      entry.englishName,
      ...record.aliases,
    ]
    return terms.some(term => term.toLocaleLowerCase().includes(query)) ? [record] : []
  })
  return options.limit === undefined
    ? matches
    : matches.slice(0, Math.max(0, Math.floor(options.limit)))
}
