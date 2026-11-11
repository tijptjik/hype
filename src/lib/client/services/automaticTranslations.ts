// API
import { getAutomaticPropertyTranslations } from '#lib/api/translation.remote.js'
// CONTENT
import { adaptContentMap } from '#lib/i18n/contentRecords.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'

const requests = new WeakMap<ResourceViewCtx, Map<string, Promise<void>>>()

/** Fetch shared catalogue translations once per account, record version and language.
 * @param context Reader-owned resource cache. @param property Visible catalogue definition.
 * @param target Requested content language. @returns Completion; failures retain published text.
 * @remarks Automatic data never changes the authored fields or survives an account switch.
 */
export function requestAutomaticPropertyTranslations(
  context: ResourceViewCtx,
  property: Property,
  target: string,
): Promise<void> {
  let pending = requests.get(context)
  if (!pending) {
    pending = new Map()
    requests.set(context, pending)
  }
  const revision = context.account.revision
  const key = `${revision}:${property.id}:${property.modifiedAt}:${target}`
  const existing = pending.get(key)
  if (existing) return existing
  const task = getAutomaticPropertyTranslations({ id: property.id, target })
    .then(result => {
      if (context.account.revision !== revision) return
      const current = context.cache.property.get(property.id) ?? property
      if (current.modifiedAt !== property.modifiedAt) return
      context.cache.property.set(property.id, {
        ...current,
        i18n: { ...current.i18n, ...adaptContentMap(result.i18n) } as Property['i18n'],
        values: current.values?.map(value => ({
          ...value,
          i18n: {
            ...value.i18n,
            ...adaptContentMap(result.values[value.id] ?? {}),
          } as typeof value.i18n,
        })),
      })
    })
    .catch(() => {
      /* Published fallback remains available when a provider request fails. */
    })
  if (pending.size >= 500) pending.clear()
  pending.set(key, task)
  return task
}

const resourceRequests = new WeakMap<
  ResourceViewCtx,
  Map<string, Promise<Record<string, unknown>>>
>()

/** Share authorized automatic-content requests across resource labels on one surface.
 * @param context Account-scoped resource surface. @param resource Supported record type.
 * @param id Record identity. @param version Visible source version. @param target Reading language.
 * @returns Safe locale rows, or an empty map while the published fallback remains usable.
 */
export function requestAutomaticResourceTranslations(
  context: ResourceViewCtx,
  resource: 'feature' | 'hub' | 'organisation' | 'project' | 'layer',
  id: string,
  version: string,
  target: string,
): Promise<Record<string, unknown>> {
  let pending = resourceRequests.get(context)
  if (!pending) {
    pending = new Map()
    resourceRequests.set(context, pending)
  }
  const key = `${context.account.revision}:${resource}:${id}:${version}:${target}`
  const existing = pending.get(key)
  if (existing) return existing
  const task = import('#lib/api/translation.remote.js')
    .then(api => api.getAutomaticTranslations({ resource, id, target }))
    .catch(() => ({}))
  if (pending.size >= 500) pending.clear()
  pending.set(key, task)
  return task
}
