// DOMAIN
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
// TYPES
import type { TargetContext } from '#lib/features/locationPolicy.js'

/** Resolve the location choices currently offered by the feature setup UI.
 * @param contexts Configured location contexts, including retained taxonomy values.
 * @returns Visible, deduplicated choices with legacy infrastructure normalized.
 * @remarks Geographic features and thoroughfares remain valid taxonomy values for later use.
 */
export function targetContextChoices(
  contexts: readonly TargetContext[],
): TargetContext[] {
  return [
    ...new Set(
      contexts
        .filter(context => {
          const taxonomy = locationTaxonomy(context)
          // Temporarily hide these choices without removing their taxonomy or configuration.
          return taxonomy.kind !== 'geographic' && taxonomy.class !== 'thoroughfare'
        })
        .map(context => (context === 'infrastructure' ? ('built' as const) : context)),
    ),
  ]
}
