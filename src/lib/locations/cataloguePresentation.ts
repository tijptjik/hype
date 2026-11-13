// SHARED FALLBACK ARTWORK
import { getFeatureIdenticonUrl } from '#lib/utils/identicon.js'
// I18N
import { resolveContentField } from '#lib/i18n/automatic.js'
// TYPES
import type { IdentityCatalogueRecord } from './identityCatalogue'

const groupArtwork: Readonly<Record<string, string>> = {
  'bl-group-cra': 'cra',
  'bl-group-dfi': 'dfi',
  'bl-group-jc': 'jc',
  'bl-group-maxims-group': 'maxims-group',
  'bl-group-hsh': 'hsh',
  'bl-group-wooloomooloo-group': 'wooloomooloo-group',
  'bl-group-yamazaki-group': 'yamazaki-group',
}

/** Supply approved artwork when an environment lacks an uploaded group image.
 * @param record Catalogue identity. @returns Artwork followed by a stable identicon.
 */
export function catalogueLogoFallbacks(record: IdentityCatalogueRecord): string[] {
  const code = record.kind === 'group' ? groupArtwork[record.id] : undefined
  return [
    ...(code ? [`/groups/breadline/${code}.svg`] : []),
    getFeatureIdenticonUrl(record.id),
  ]
}

/** Keep legal suffixes out of English group labels without altering source names.
 * @param record Catalogue identity. @returns Concise English display name.
 */
export function catalogueDisplayName(record: IdentityCatalogueRecord): string {
  const name =
    resolveContentField(record.i18n, 'name', 'en').value ?? record.code ?? record.id
  return record.kind === 'group'
    ? name.replace(/(?:,?\s+(?:Co\.?\s*,?\s*)?(?:Limited|Ltd\.?))$/i, '')
    : name
}
