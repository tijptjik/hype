// SHARED FALLBACK ARTWORK
import { getFeatureIdenticonUrl } from '#lib/utils/identicon.js'
import { resolveBrandIdentity } from '#lib/features/brandIdentity.js'
import {
  resolveCatalogueDisplayLogo,
  type CatalogueArtworkOwner,
} from './catalogueArtwork'
// I18N
import { resolveContentField } from '#lib/i18n/automatic.js'
// TYPES
import type { IdentityCatalogueRecord } from './identityCatalogue'

type DisplayArtwork = CatalogueArtworkOwner & { kind?: IdentityCatalogueRecord['kind'] }

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

/** Resolve catalogue display artwork using the active theme and existing curated vectors.
 * @param record Catalogue identity. @param theme Effective theme ID. @param mode Theme luminance.
 * @returns Approved display artwork, excluding research previews.
 */
export function catalogueDisplayLogo(
  record: DisplayArtwork,
  theme: string,
  mode: 'light' | 'dark',
): string | null {
  const bundled =
    record.kind === 'brand' && record.code
      ? resolveBrandIdentity(record.code)?.logoSrc
      : undefined
  return resolveCatalogueDisplayLogo(
    record,
    theme,
    mode,
    theme === 'breadline-light' ? bundled : undefined,
  )
}

/** Choose the reviewed backing, including transparency, for the active artwork.
 * @param record Catalogue identity and its artwork variants. @param theme Effective theme ID.
 * @param mode Theme luminance. @returns Reviewed artwork background or a contrast-safe neutral.
 */
export function catalogueLogoBackground(
  record: DisplayArtwork,
  theme: string,
  mode: 'light' | 'dark',
): string {
  const source = catalogueDisplayLogo(record, theme, mode)
  const artwork = Object.values(record.artwork ?? {}).find(
    asset => asset.status === 'approved' && asset.src === source,
  )
  const background =
    artwork?.background ?? (theme === 'breadline-light' ? '#f5f0e5' : '#ffffff')
  const channels =
    background.match(/[a-f\d]{2}/gi)?.map(value => Number.parseInt(value, 16)) ?? []
  const lightNeutral =
    channels.length === 3 &&
    Math.min(...channels) >= 210 &&
    Math.max(...channels) - Math.min(...channels) < 35
  // Dim neutral backing in dark palettes without changing coloured brand backgrounds.
  if (mode === 'dark' && lightNeutral)
    return 'color-mix(in oklab, var(--theme-muted) 20%, var(--theme-surface))'
  return background
}
