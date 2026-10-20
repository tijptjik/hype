// DOMAIN
import { equalPlaceValue } from './baseline'

/**
 * Compare canonical Place evidence independently of JSON:API navigation links.
 * @param left Retained canonical resource from a verified source response.
 * @param right Candidate canonical resource from a verified source response.
 * @returns Whether data, attributes, relationship identities and other evidence match.
 * @remarks Only resource-level and relationship-level links are transport presentation.
 * Attribute fields, including business websites or embedded links, remain meaningful.
 * Publication validation and source record validation belong to the caller.
 */
export function equalPlaceSourceRecord(left: unknown, right: unknown): boolean {
  /** Omit navigation links at the JSON:API envelope boundaries only. @param value Resource. @returns Comparable evidence, or null for malformed input. */
  const evidence = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { links: _links, relationships, ...record } = value as Record<string, unknown>
    if (relationships === undefined) return record
    if (
      !relationships ||
      typeof relationships !== 'object' ||
      Array.isArray(relationships)
    )
      return { ...record, relationships }
    return {
      ...record,
      relationships: Object.fromEntries(
        Object.entries(relationships).map(([key, relation]) => {
          if (
            !relation ||
            typeof relation !== 'object' ||
            Array.isArray(relation) ||
            !Object.hasOwn(relation, 'data')
          )
            return [key, relation]
          const { links: _relationLinks, ...retained } = relation as Record<
            string,
            unknown
          >
          return [key, retained]
        }),
      ),
    }
  }
  const a = evidence(left),
    b = evidence(right)
  return a !== null && b !== null && equalPlaceValue(a, b)
}
