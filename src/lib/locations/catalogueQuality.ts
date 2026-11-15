// VALIDATION
import { z } from 'zod'
// DOMAIN
import { THEMES } from '#lib/themes/themes'
import type { CatalogueArtworkOwner } from './catalogueArtwork'

export const LOGO_QUALITIES = [
  {
    key: 'logo',
    label: 'Logo',
    badge: 'Logo',
    description: 'Has a live general or variant logo.',
  },
  { key: 'svg', label: 'SVG', badge: 'SVG', description: 'Has a live SVG logo.' },
  {
    key: 'resolution',
    label: '512 × 512',
    badge: '512',
    description:
      'Has an SVG logo or an original raster logo at least 512 pixels wide and tall. Unknown dimensions do not qualify.',
  },
  {
    key: 'modes',
    label: 'Light + dark',
    badge: 'L/D',
    description: 'Has dedicated marker-light and marker-dark artwork.',
  },
  {
    key: 'themes',
    label: 'All themes',
    badge: 'Themes',
    description:
      'Has a dedicated marker for every supported theme. Fallbacks do not count.',
  },
  {
    key: 'brandMark',
    label: 'Brand mark',
    badge: 'Mark',
    description: 'Has artwork explicitly classified as a standalone brand mark.',
  },
] as const
export type LogoQualityKey = (typeof LOGO_QUALITIES)[number]['key']
export const LogoQualityFiltersSchema = z.strictObject({
  logo: z.boolean().nullable().optional(),
  svg: z.boolean().nullable().optional(),
  resolution: z.boolean().nullable().optional(),
  modes: z.boolean().nullable().optional(),
  themes: z.boolean().nullable().optional(),
  brandMark: z.boolean().nullable().optional(),
})
export type LogoQualityFilters = z.infer<typeof LogoQualityFiltersSchema>
/** Read explicit artwork qualities without treating fallback artwork as dedicated coverage.
 * @param owner Catalogue artwork. @returns Quality flags for cards and filters.
 */
export function catalogueQuality(
  owner: CatalogueArtworkOwner,
): Record<LogoQualityKey, boolean> {
  const entries = Object.entries(owner.artwork ?? {}).filter(
    ([, a]) => a.src && a.status === 'approved',
  )
  const logos = entries
    .filter(([key]) => /^logo(?:-|$)/.test(key) && !key.includes('-format-'))
    .map(([, a]) => a)
  const slots = new Set(entries.map(([key]) => key))
  return {
    logo: Boolean(owner.logo) || logos.length > 0,
    svg: logos.some(a => a.format === 'svg'),
    resolution: logos.some(
      a =>
        a.format === 'svg' ||
        ((a.sourceWidth ?? 0) >= 512 && (a.sourceHeight ?? 0) >= 512),
    ),
    modes: slots.has('marker-light') && slots.has('marker-dark'),
    themes: THEMES.every(t => slots.has(`marker-${t.id}`)),
    brandMark: entries.some(([, a]) => a.composition === 'brand-mark'),
  }
}
/** Decode URL-backed three-way quality filters.
 * @param params Current query parameters. @returns Explicit yes/no choices only.
 */
export function qualityFiltersFromUrl(params: URLSearchParams): LogoQualityFilters {
  return Object.fromEntries(
    LOGO_QUALITIES.flatMap(({ key }) => {
      const value = params.get(`logo-${key}`)
      return value === 'yes' || value === 'no' ? [[key, value === 'yes']] : []
    }),
  )
}
