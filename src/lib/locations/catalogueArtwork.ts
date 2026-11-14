// VALIDATION
import { z } from 'zod'
const assetPath = z.string().regex(/^\/api\/identity-catalogue\/logos\/[a-f0-9-]{36}$/)
/** Revisioned source artwork; marker derivatives are added only after review. */
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
        .regex(/^#[a-fA-F0-9]{6}$/)
        .default('#ffffff'),
      status: z.enum(['candidate', 'approved']).default('candidate'),
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
export type CatalogueArtworkOwner = { logo?: string | null; artwork?: CatalogueArtwork }
export type ResolvedCatalogueArtwork = {
  src: string
  background: string
  whiteRing: boolean
  slot: string
}
/** Resolve approved marker artwork in explicit priority order.
 * @param owner Catalogue content. @param theme Stable theme code, such as null-space or milk.
 * @param mode Theme luminance, independent of its name. @param genericIcon Last-resort icon.
 * @returns Chosen asset and fallback ring treatment, or null without any asset.
 */
export function resolveCatalogueMarker(
  owner: CatalogueArtworkOwner,
  theme: string,
  mode: 'light' | 'dark',
  genericIcon?: string,
): ResolvedCatalogueArtwork | null {
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
