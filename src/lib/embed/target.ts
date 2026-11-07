// TYPES
import type { EmbedLayer } from './embed.types'

/** Resolves a saved admin route against the authorized public catalogue.
 * @param rows Shareable layers returned for the current administrator.
 * @param type Resource type of the admin route.
 * @param ref Stable ID or human-readable route code.
 * @returns Canonical resource ID, or null when no shareable descendant exists.
 * @remarks The route need not be present in the legacy client cache. URLs use IDs only.
 */
export function resolveEmbedTargetId(
  rows: EmbedLayer[],
  type: string,
  ref: string,
): string | null {
  const identities = rows.map(row =>
    type === 'hub'
      ? { id: row.hubId, code: row.hubCode }
      : type === 'organisation'
        ? { id: row.organisationId, code: row.organisationCode }
        : type === 'project'
          ? { id: row.projectId, code: row.projectCode }
          : type === 'layer'
            ? { id: row.id, code: row.code }
            : { id: null, code: null },
  )
  return (
    identities.find(item => item.id === ref)?.id ??
    identities.find(item => item.code === ref)?.id ??
    null
  )
}
