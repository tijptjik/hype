// DOMAIN
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'

/** Convert a stored name rule into an editable shared expression without losing its fragments.
 * @param rule Stored naming rule. @param locale Requested content language.
 * @returns Expression with explicit, optional name and property references.
 */
export function namingRuleExpression(rule: FeatureNameRule, locale: string): string {
  let source = `{{ ${rule.base === 'location' ? 'location' : 'feature'}.name }}`
  for (const condition of rule.conditions) {
    // Read a locale fragment while accepting previous locale aliases.
    const text = Object.entries(condition.locales).find(
      ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
    )?.[1]
    if (!text) continue
    const path = `properties.${condition.propertyId}`
    const part =
      condition.test === 'hasValue'
        ? `${path} ?? ${JSON.stringify(text.false.trim())}`
        : `ternary(${path}, ${JSON.stringify(text.true.trim())}, ${JSON.stringify(text.false.trim())}, ${JSON.stringify(text.null.trim())})`
    const fragment = `{{ optional(${part}, ${JSON.stringify(text.placement === 'suffix' ? text.separator : '')}, ${JSON.stringify(text.placement === 'prefix' ? text.separator : '')}) }}`
    source = text.placement === 'prefix' ? fragment + source : source + fragment
  }
  return source
}

/** Shared field choices for all template entry points. */
export const FEATURE_TEMPLATE_FIELDS = [
  { path: 'feature.name', label: 'Feature name' },
  { path: 'location.name', label: 'Linked location name' },
  { path: 'brand.name', label: 'Linked location · Brand' },
  { path: 'group.name', label: 'Linked location · Group' },
  { path: 'format.name', label: 'Linked location · Format' },
  { path: 'branch', label: 'Linked location · Branch' },
  { path: 'address', label: 'Address' },
  { path: 'accessHint', label: 'Feature address · Access hint' },
  { path: 'phoneNumber', label: 'Linked location · Phone number' },
  { path: 'website', label: 'Linked location · Website' },
]
