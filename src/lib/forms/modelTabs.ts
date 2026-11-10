// VALIDATION
import { z } from 'zod'

/** Independently replaceable resource-form sections; profile carries required identity dependencies. */
export const MODEL_FORM_TABS = {
  hub: {
    fields: ['properties'],
    members: ['userRoles'],
    organisations: ['organisations'],
    layers: ['layerDefaults'],
    location: ['featureIntentSettings'],
    images: ['imageIntentSettings'],
  },
  project: {
    fields: ['properties'],
    members: ['userRoles'],
    layers: ['layers'],
    location: ['featureIntentSettings', 'locationUpdatePolicy'],
    images: ['imageIntentSettings'],
  },
  layer: {
    fields: ['properties'],
    location: ['featureIntentSettings', 'relocationUpdatePolicy'],
  },
} as const
export type ModelFormResource = keyof typeof MODEL_FORM_TABS
export const SubmittedTabsSchema = z
  .preprocess(
    (value: string | string[] | undefined) => {
      if (typeof value !== 'string') return value
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    },
    z
      .array(z.string())
      .min(1)
      .refine(tabs => new Set(tabs).size === tabs.length, 'Duplicate submitted tab'),
  )
  .optional()

/** Recognize resource editors with a declared partial-submission contract.
 * @param value Resource type. @returns Whether tab gating is available.
 */
export function isModelFormResource(value: unknown): value is ModelFormResource {
  return typeof value === 'string' && Object.hasOwn(MODEL_FORM_TABS, value)
}
/** Select changed replaceable sections, retaining required profile/ownership dependencies.
 * @param resource Model resource. @param initial Committed values. @param current Draft values.
 * @returns Explicit tabs to submit; an empty array/string remains an intentional edit.
 */
export function changedModelTabs(
  resource: ModelFormResource,
  initial: unknown,
  current: unknown,
): string[] {
  const before = (initial as { data?: Record<string, unknown> })?.data ?? {}
  const after = (current as { data?: Record<string, unknown> })?.data ?? {}
  return [
    'profile',
    ...Object.entries(MODEL_FORM_TABS[resource])
      .filter(([, fields]) =>
        fields.some(
          (field: string) =>
            JSON.stringify(before[field]) !== JSON.stringify(after[field]),
        ),
      )
      .map(([tab]) => tab),
  ]
}
/** Trim native FormData before both remote preflight and transport serialization.
 * @param resource Model resource. @param packet Native submission. @param tabs Supplied sections.
 * @returns Nothing; omitted sections are removed without changing editor state.
 */
export function gateModelFormData(
  resource: ModelFormResource,
  packet: FormData,
  tabs: string[],
): void {
  const boundName = [...packet.keys()].find(
    name => /^(?:[bni]:)?(?:data|meta)\./.test(name) && name.includes('/'),
  )
  const suffix = boundName ? boundName.slice(boundName.indexOf('/')) : ''
  for (const [tab, fields] of Object.entries(MODEL_FORM_TABS[resource])) {
    if (tabs.includes(tab)) continue
    for (const name of [...packet.keys()]) {
      const path = name.replace(/^[bni]:/, '').split('/')[0]
      if (
        fields.some(
          (field: string) =>
            path === `data.${field}` ||
            path.startsWith(`data.${field}.`) ||
            path.startsWith(`data.${field}[`),
        )
      )
        packet.delete(name)
    }
  }
  packet.set(`meta.submittedTabs${suffix}`, JSON.stringify(tabs))
}
/** Validate an explicit tab manifest before persistence; legacy packets use field presence.
 * @param resource Model resource. @param value Parsed form. @param ctx Validation issue collector.
 * @returns Nothing. Unknown tabs and payloads smuggled under omitted tabs are rejected.
 */
export function validateModelTabs(
  resource: ModelFormResource,
  value: {
    meta?: { mode?: string; submittedTabs?: string[] }
    data: Record<string, unknown>
  },
  ctx: z.RefinementCtx,
): void {
  if (value.meta?.mode === 'create' && value.data.featureIntentSettings !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['data', 'featureIntentSettings'],
      message: 'Create the parent before configuring its Data Model.',
    })
  }
  const tabs = value.meta?.submittedTabs
  if (!tabs) return
  if (
    resource === 'hub' &&
    tabs.includes('members') &&
    value.data.userRoles === undefined
  ) {
    ctx.addIssue({ code: 'custom', path: ['data', 'userRoles'], message: 'Add a User' })
  }
  const policy = MODEL_FORM_TABS[resource]
  if (
    !tabs.includes('profile') ||
    tabs.some(tab => tab !== 'profile' && !Object.hasOwn(policy, tab))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['meta', 'submittedTabs'],
      message: 'Invalid supplied tabs; profile identity is required.',
    })
  }
  if (value.meta?.mode !== 'update') {
    ctx.addIssue({
      code: 'custom',
      path: ['meta', 'submittedTabs'],
      message: 'Partial tabs are only supported for updates.',
    })
  }
  for (const [tab, fields] of Object.entries(policy)) {
    if (
      !tabs.includes(tab) &&
      fields.some((field: string) => value.data[field] !== undefined)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'submittedTabs'],
        message: `Payload supplied for omitted tab: ${tab}`,
      })
  }
}
/** Distinguish an intentional empty replacement from an omitted section.
 * @param params Parsed form. @param tab Tab id. @param field Root data field.
 * @returns Whether the caller supplied this replacement boundary.
 */
export function suppliedModelTab(
  params: { meta?: { submittedTabs?: string[] }; data: object },
  tab: string,
  field: string,
): boolean {
  return params.meta?.submittedTabs
    ? params.meta.submittedTabs.includes(tab)
    : Object.hasOwn(params.data, field)
}
