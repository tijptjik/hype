// VALIDATION
import { z } from 'zod'
const assetPath = z.string().regex(/^\/api\/identity-catalogue\/logos\/[a-f0-9-]{36}$/)
/** Revisioned logo and marker variants; new artwork is active when saved. */
export const CatalogueArtworkSchema = z
  .record(
    z
      .string()
      .regex(/^(?:logo|marker)(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
      .max(100),
    z.strictObject({
      src: assetPath,
      background: z
        .string()
        .regex(/^(?:#[a-fA-F0-9]{6}|transparent)$/)
        .default('#ffffff'),
      sourceWidth: z.number().int().positive().optional(),
      sourceHeight: z.number().int().positive().optional(),
      format: z.enum(['png', 'svg']).optional(),
      composition: z.enum(['full-logo', 'brand-mark']).optional(),
      status: z.enum(['candidate', 'approved']).default('approved'),
      sourceUrl: z
        .string()
        .url()
        .max(2000)
        .refine(value => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS source URL')
        .optional(),
      attribution: z.string().max(2000).optional(),
      license: z.string().max(300).optional(),
      notes: z.string().max(2000).optional(),
    }),
  )
  .refine(v => Object.keys(v).length <= 40, 'At most forty artwork variants')
export type CatalogueArtwork = z.infer<typeof CatalogueArtworkSchema>
export type CatalogueArtworkOwner = {
  code?: string
  logo?: string | null
  artwork?: CatalogueArtwork
}
export type ResolvedCatalogueArtwork = {
  src: string
  background: string
  whiteRing: boolean
  slot: string
}
/** Resolve optional format artwork before falling back to the containing brand.
 * @param owner Brand and its artwork slots. @param format Localized establishment format.
 * @param theme Active theme. @param mode Active luminance.
 * @returns Approved format artwork or null when the brand fallback should be used.
 */
export function resolveCatalogueFormatArtwork(
  owner: CatalogueArtworkOwner,
  format?: string | Record<string, string>,
  theme?: string,
  mode?: 'light' | 'dark',
): (ResolvedCatalogueArtwork & CatalogueArtwork[string]) | null {
  const values =
    typeof format === 'string' ? [format] : [format?.en, ...Object.values(format ?? {})]
  const keys = [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map(value => {
          const key = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
          return owner.code && key.startsWith(`${owner.code}-`)
            ? key.slice(owner.code.length + 1)
            : key
        })
        .filter(Boolean),
    ),
  ]
  for (const suffix of [
    ...new Set([theme, mode, ''].filter(value => value !== undefined)),
  ]) {
    for (const key of keys) {
      for (const type of ['marker', 'logo']) {
        const slot = `${type}-format-${key}${suffix ? `-${suffix}` : ''}`
        const asset = owner.artwork?.[slot]
        if (asset?.status === 'approved') return { ...asset, slot, whiteRing: false }
      }
    }
  }
  return null
}
/** Resolve approved marker artwork in explicit priority order.
 * @param owner Catalogue content. @param theme Stable theme code, such as null-space or milk.
 * @param mode Theme luminance, independent of its name. @param genericIcon Last-resort icon.
 * @param format Optional localized establishment format, selected before brand artwork.
 * @returns Chosen asset and fallback ring treatment, or null without any asset.
 */
export function resolveCatalogueMarker(
  owner: CatalogueArtworkOwner,
  theme: string,
  mode: 'light' | 'dark',
  genericIcon?: string,
  format?: string | Record<string, string>,
): ResolvedCatalogueArtwork | null {
  const specific = resolveCatalogueFormatArtwork(owner, format, theme, mode)
  if (specific) return specific
  for (const slot of [...new Set([`marker-${theme}`, `marker-${mode}`, 'marker'])]) {
    const asset = owner.artwork?.[slot]
    if (asset?.status === 'approved') return { ...asset, slot, whiteRing: false }
  }
  const general = owner.artwork?.logo
  const src = general?.status === 'approved' ? general.src : (owner.logo ?? genericIcon)
  return src
    ? {
        src,
        background: general?.status === 'approved' ? general.background : '#ffffff',
        whiteRing: true,
        slot: 'logo',
      }
    : null
}
/** Resolve the general artwork, optionally showing candidates in the catalogue editor.
 * @param owner Catalogue content. @param review Whether candidate previews are allowed.
 * @returns General logo URL, leaving marker selection to the marker resolver.
 */
export function catalogueGeneralLogo(
  owner: CatalogueArtworkOwner,
  review = false,
): string | null {
  const asset = owner.artwork?.logo
  return asset && (review || asset.status === 'approved')
    ? asset.src
    : (owner.logo ?? null)
}

/** Select approved artwork for a catalogue card or profile, never research candidates.
 * @param owner Revisioned catalogue content. @param theme Effective theme ID.
 * @param mode Effective luminance. @param themeFallback Existing bundled treatment for this theme.
 * @returns Display logo URL or null when no reviewed artwork exists.
 */
export function resolveCatalogueDisplayLogo(
  owner: CatalogueArtworkOwner,
  theme: string,
  mode: 'light' | 'dark',
  themeFallback?: string,
): string | null {
  for (const slot of [`logo-${theme}`, `marker-${theme}`]) {
    const asset = owner.artwork?.[slot]
    if (asset?.status === 'approved') return asset.src
  }
  if (themeFallback) return themeFallback
  for (const slot of [`logo-${mode}`, `marker-${mode}`, 'marker', 'logo']) {
    const asset = owner.artwork?.[slot]
    if (asset?.status === 'approved') return asset.src
  }
  return owner.logo ?? null
}

/** Require source resolution rather than the dimensions of an enlarged preview.
 * @param asset Source metadata. @returns Whether the source meets the display minimum.
 */
export function catalogueArtworkMeetsMinimum(asset: CatalogueArtwork[string]): boolean {
  return (
    asset.format === 'svg' ||
    Math.min(asset.sourceWidth ?? 0, asset.sourceHeight ?? 0) >= 512
  )
}
