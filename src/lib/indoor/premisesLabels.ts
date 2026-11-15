// TYPES
import type { SymbolLayerSpecification } from 'maplibre-gl'

/** Resolve the catalogue name for the user's locale.
 * @param premises Bilingual database metadata. @param locale Active UI locale.
 * @returns Chinese names for Chinese locales, with a nonempty source-name fallback.
 * @remarks The catalogue currently stores one Chinese name shared by both scripts.
 */
export function premisesLabel(
  premises: { name?: string; nameZh?: string } | null | undefined,
  locale: string,
): string {
  const english = premises?.name?.trim() ?? ''
  const chinese = premises?.nameZh?.trim() ?? ''
  return locale.toLowerCase().startsWith('zh') ? chinese || english : english || chinese
}

/** Reuse the active major-road typography without its road placement rules.
 * @param road Major-road symbol layer in the active style.
 * @returns Text layout and paint properties for a premises label.
 */
export function premisesTypography(road?: SymbolLayerSpecification): {
  layout: SymbolLayerSpecification['layout']
  paint: SymbolLayerSpecification['paint']
} {
  return {
    layout: {
      'text-font': road?.layout?.['text-font'] ?? ['Noto Sans Regular'],
      'text-size': road?.layout?.['text-size'] ?? 15,
      'text-letter-spacing': road?.layout?.['text-letter-spacing'] ?? 0,
    },
    paint: {
      'text-color': road?.paint?.['text-color'] ?? '#263d49',
      'text-halo-color': road?.paint?.['text-halo-color'] ?? '#ffffff',
      'text-halo-width': road?.paint?.['text-halo-width'] ?? 1,
      'text-halo-blur': road?.paint?.['text-halo-blur'] ?? 0,
    },
  }
}
