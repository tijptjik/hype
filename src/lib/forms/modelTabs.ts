// VALIDATION
import { z } from 'zod'

/** Independently replaceable resource-form sections; identity and revision live in meta. */
export const MODEL_FORM_TABS = {
  organisation: {
    profile: [
      'code',
      'url',
      'i18n',
      'settings',
      'capabilities',
      'defaultLocationVisibility',
      'permitUserDetailsEdit',
    ],
    members: ['userRoles'],
    fields: ['properties'],
    users: ['userPolicy'],
  },
  feature: {
    profile: [
      'organisationId',
      'projectId',
      'layerId',
      'contributorId',
      'featureType',
      'kind',
      'targetContext',
      'associationRelation',
      'i18n',
      'nameOverrides',
      'isIntangible',
      'isVisitable',
      'isPendingReview',
      'isDraft',
    ],
    location: [
      'geometry',
      'addressMeta',
      'locationNameMode',
      'locationFieldModes',
      'locationNames',
      'locationReset',
      'locationBrandEdit',
    ],
    fields: ['properties'],
  },
  hub: {
    profile: [
      'code',
      'domain',
      'legalContactAddress',
      'isSubscriptionAvailable',
      'subscriptionService',
      'subscriptionId',
      'subscriptionSessionCookie',
      'subscriptionPlacement',
      'i18n',
    ],
    fields: ['properties'],
    members: ['userRoles'],
    organisations: ['organisations'],
    layers: ['layerDefaults'],
    location: ['featureIntentSettings'],
    images: ['imageIntentSettings'],
  },
  project: {
    profile: [
      'organisationId',
      'code',
      'i18n',
      'settings',
      'cardStyleCode',
      'markerStyleCode',
      'mapStyleCode',
      'useAllInOrgContext',
      'license',
      'flags',
      'capabilities',
    ],
    fields: ['properties'],
    members: ['userRoles'],
    layers: ['layers'],
    location: ['featureIntentSettings', 'locationUpdatePolicy'],
    images: ['imageIntentSettings'],
  },
  layer: {
    profile: ['organisationId', 'projectId', 'i18n', 'isDefaultVisible', 'metadata'],
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
      .refine(tabs => new Set(tabs).size === tabs.length, 'Duplicate submitted tab'),
  )
  .optional()

/** Recognize resource editors with a declared partial-submission contract.
 * @param value Resource type. @returns Whether tab gating is available.
 */
export function isModelFormResource(value: unknown): value is ModelFormResource {
  return typeof value === 'string' && Object.hasOwn(MODEL_FORM_TABS, value)
}
/** Select changed sections, including Profile, without resubmitting unchanged values.
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
  return Object.entries(MODEL_FORM_TABS[resource])
    .filter(([, fields]) =>
      fields.some(
        (field: string) =>
          JSON.stringify(before[field]) !== JSON.stringify(after[field]),
      ),
    )
    .map(([tab]) => tab)
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
  if (
    resource === 'hub' &&
    value.meta?.mode === 'create' &&
    (!Array.isArray(value.data.userRoles) || value.data.userRoles.length === 0)
  )
    ctx.addIssue({ code: 'custom', path: ['data', 'userRoles'], message: 'Add a User' })
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
  if (tabs.some(tab => !Object.hasOwn(policy, tab))) {
    ctx.addIssue({
      code: 'custom',
      path: ['meta', 'submittedTabs'],
      message: 'Invalid supplied tabs.',
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

/** Build a shared full-create/partial-update schema without validating or defaulting omitted tabs.
 * @param resource Resource tab contract. @param meta Identity and revision schema.
 * @param entity Complete resource data schema, including profile cross-field constraints.
 * @returns Validated supplied data; omitted fields remain absent.
 * @remarks Each submitted tab validates its complete field group. Creation and legacy packets
 * use the complete schema. Explicit tab packets require the persisted identity and revision.
 */
export function modelFormSchema<M extends z.ZodObject, E extends z.ZodObject>(
  resource: ModelFormResource,
  meta: M,
  entity: E,
) {
  return z
    .object({
      meta: meta.optional(),
      data: z
        .custom<Partial<z.input<E>>>(
          value => typeof value === 'object' && value !== null && !Array.isArray(value),
        )
        .default({} as Partial<z.input<E>>),
    })
    .transform((value, ctx) => {
      const metadata = value.meta as
        | {
            mode?: string
            submittedTabs?: string[]
            id?: string
            updatedAt?: string
          }
        | undefined
      const data = value.data as Record<string, unknown>
      // Check the original packet before parsing can strip forbidden omitted-tab fields.
      validateModelTabs(resource, { meta: metadata, data }, ctx)
      if (metadata?.submittedTabs && (!metadata.id || !metadata.updatedAt)) {
        ctx.addIssue({
          code: 'custom',
          path: ['meta'],
          message: 'Updates require an identity and revision token.',
        })
      }
      // Build only the selected validation shape: omitted tabs never apply defaults.
      const fields = metadata?.submittedTabs
        ? new Set(
            metadata.submittedTabs.flatMap(
              tab =>
                (MODEL_FORM_TABS[resource] as Record<string, readonly string[]>)[tab] ??
                [],
            ),
          )
        : undefined
      const schema = fields
        ? z.object(
            Object.fromEntries(
              Object.entries(entity.shape).filter(([field]) => fields.has(field)),
            ),
          )
        : entity
      const result = schema.safeParse(data)
      if (!result.success) {
        for (const issue of result.error.issues)
          ctx.addIssue({ ...issue, path: ['data', ...issue.path] })
        return z.NEVER
      }
      return { meta: value.meta, data: result.data as Partial<z.output<E>> }
    })
}
