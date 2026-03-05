// ENUMS
import type { OrganisationRoleType } from '$lib/enums'
import { CAPABILITY_I18N_BY_KEY, isProjectCapabilityKey } from '$lib/capabilities'
// I18N
import { toLocaleCode, toLocaleKey } from '$lib/i18n'
// TYPES
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
  Locale,
  OrganisationBooleanField,
  Organisation,
  OrganisationFormInput,
  OrganisationFormLocaleSource,
  OrganisationIdentityPatch,
  OrganisationSubmitUpdatesParams,
} from '$lib/types'

function normalizeOrganisationFormLocale(
  locale: OrganisationFormLocaleSource,
): OrganisationFormInput['data']['i18n']['en'] {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
  }
}

function normalizeOrganisationCapabilities(
  capabilities: CapabilityDefinitions | null | undefined,
): CapabilityDefinitions {
  if (!capabilities) return {}
  const normalized: CapabilityDefinitions = {}
  for (const [rawKey, rawDefinition] of Object.entries(capabilities)) {
    if (!isProjectCapabilityKey(rawKey)) continue
    const defaults = CAPABILITY_I18N_BY_KEY[rawKey]
    const definition = (rawDefinition ?? {}) as CapabilityDefinition
    const labels = definition.i18n ?? {}
    normalized[rawKey] = {
      i18n: {
        en: labels.en ?? defaults.en ?? rawKey,
        zhHans: labels.zhHans ?? defaults.zhHans ?? defaults.en ?? rawKey,
        zhHant: labels.zhHant ?? defaults.zhHant ?? defaults.en ?? rawKey,
      },
    }
  }
  return normalized
}

export function toOrganisationFormInput(
  data?: Organisation | null,
): OrganisationFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        code: '',
        url: '',
        capabilities: {},
        i18n: {
          en: normalizeOrganisationFormLocale(undefined),
          zhHans: normalizeOrganisationFormLocale(undefined),
          zhHant: normalizeOrganisationFormLocale(undefined),
        },
        userRoles: [],
      },
    }
  }

  return {
    meta: {
      id: data.id,
      updatedAt: data.modifiedAt,
      mode: 'update',
      isAdminRequest: true,
    },
    data: {
      code: data.code,
      url: data.url ?? '',
      capabilities: normalizeOrganisationCapabilities(data.capabilities),
      i18n: {
        en: normalizeOrganisationFormLocale(data.i18n?.en),
        zhHans: normalizeOrganisationFormLocale(data.i18n?.zhHans),
        zhHant: normalizeOrganisationFormLocale(data.i18n?.zhHant),
      },
      userRoles: (data.userRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role as OrganisationRoleType,
      })),
    },
  }
}

export function overrideOrganisationEntityBoolean(
  field: OrganisationBooleanField,
  value: boolean,
) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

export function overrideOrganisationListItemBoolean(
  organisationId: string,
  field: OrganisationBooleanField,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === organisationId ? { ...item, [field]: value } : item,
    ),
  })
}

export function toOrganisationIdentityPatch(
  formData: OrganisationFormInput,
  locale: Locale,
): OrganisationIdentityPatch {
  const formLocale = toLocaleKey(locale)
  const entityLocale = toLocaleCode(formLocale)
  const localeData = formData.data?.i18n?.[formLocale]

  return {
    code: formData.data?.code ?? '',
    locale: entityLocale,
    name: localeData?.name ?? '',
    nameShort: localeData?.nameShort ?? '',
  }
}

type OrganisationFormI18nValue = OrganisationFormInput['data']['i18n']['en']

function toOrganisationEntityI18nPatchFromFormInput(
  formData: OrganisationFormInput,
): Record<string, Partial<OrganisationFormI18nValue>> {
  const formLocaleKeys = ['en', 'zhHans', 'zhHant'] as const
  const formI18n = (formData.data?.i18n ?? {}) as Partial<
    Record<(typeof formLocaleKeys)[number], Partial<OrganisationFormI18nValue>>
  >
  const next: Record<string, Partial<OrganisationFormI18nValue>> = {}

  for (const formLocaleKey of formLocaleKeys) {
    const entityLocaleKey = toLocaleCode(formLocaleKey)
    const localeData = formI18n[formLocaleKey]
    if (!localeData || typeof localeData !== 'object') continue

    const patch: Partial<OrganisationFormI18nValue> = {}
    if ('name' in localeData && typeof localeData.name === 'string') {
      patch.name = localeData.name
    }
    if ('nameShort' in localeData && typeof localeData.nameShort === 'string') {
      patch.nameShort = localeData.nameShort
    }
    if ('description' in localeData && typeof localeData.description === 'string') {
      patch.description = localeData.description
    }
    if ('nameGen' in localeData && typeof localeData.nameGen === 'boolean') {
      patch.nameGen = localeData.nameGen
    }
    if ('nameShortGen' in localeData && typeof localeData.nameShortGen === 'boolean') {
      patch.nameShortGen = localeData.nameShortGen
    }
    if (
      'descriptionGen' in localeData &&
      typeof localeData.descriptionGen === 'boolean'
    ) {
      patch.descriptionGen = localeData.descriptionGen
    }

    if (Object.keys(patch).length > 0) {
      next[entityLocaleKey] = patch
    }
  }

  return next
}

export function overrideOrganisationEntityFromFormInput(
  formData: OrganisationFormInput,
) {
  const i18nPatch = toOrganisationEntityI18nPatchFromFormInput(formData)
  const nextCode =
    typeof (formData.data as { code?: unknown } | undefined)?.code === 'string'
      ? ((formData.data as { code?: string }).code ?? '')
      : undefined
  const nextUrl =
    typeof (formData.data as { url?: unknown } | undefined)?.url === 'string'
      ? ((formData.data as { url?: string }).url ?? '')
      : undefined
  const nextCapabilities = (formData.data as { capabilities?: unknown } | undefined)
    ?.capabilities as CapabilityDefinitions | undefined
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data
      ? {
          ...current.data,
          ...(nextCode !== undefined ? { code: nextCode } : {}),
          ...(nextUrl !== undefined ? { url: nextUrl } : {}),
          ...(nextCapabilities !== undefined
            ? { capabilities: normalizeOrganisationCapabilities(nextCapabilities) }
            : {}),
          i18n: {
            ...((current.data.i18n as Record<string, Record<string, unknown>>) ?? {}),
            ...Object.fromEntries(
              Object.entries(i18nPatch).map(([localeKey, patch]) => [
                localeKey,
                {
                  ...(((
                    current.data?.i18n as Record<string, Record<string, unknown>> | null
                  )?.[localeKey] ?? {}) as Record<string, unknown>),
                  ...patch,
                },
              ]),
            ),
          },
        }
      : current.data,
  })
}

function mergeOrganisationIdentityAtLocale(
  source: Record<string, unknown>,
  patch: OrganisationIdentityPatch,
): Record<string, unknown> {
  return {
    ...source,
    code: patch.code,
    i18n: {
      ...(source.i18n as Record<string, Record<string, unknown>> | undefined),
      [patch.locale]: {
        ...((source.i18n as Record<string, Record<string, unknown>> | undefined)?.[
          patch.locale
        ] ?? {}),
        name: patch.name,
        nameShort: patch.nameShort,
      },
    },
  }
}

export function overrideOrganisationEntityIdentity(patch: OrganisationIdentityPatch) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? mergeOrganisationIdentityAtLocale(current.data, patch) : null,
  })
}

export function overrideOrganisationListItemIdentity(
  organisationId: string,
  patch: OrganisationIdentityPatch,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === organisationId
        ? mergeOrganisationIdentityAtLocale(item, patch)
        : item,
    ),
  })
}

export function getOrganisationSubmitUpdates<
  TEntityCurrent,
  TListCurrent,
  TEntityResult,
  TListResult,
>({
  organisationId,
  entityQuery,
  listQuery,
}: OrganisationSubmitUpdatesParams<
  TEntityCurrent,
  TListCurrent,
  TEntityResult,
  TListResult
>): Array<TEntityResult | TListResult> {
  if (!organisationId) return []
  return [entityQuery as TEntityResult, listQuery as TListResult]
}
