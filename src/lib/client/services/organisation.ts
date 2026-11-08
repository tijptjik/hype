// CONTENT LOCALES
import { propertyLocalesToForm } from '#lib/properties/locales.js'
// ROLE POLICY
import { DEFAULT_ORGANISATION_USER_POLICY } from '#lib/organisation-users/policy.js'
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
// ORGANISATION SETTINGS
import { toOrganisationSettingsForm } from '#lib/organisations/settings.js'
// ENUMS
import { CAPABILITY_I18N_BY_KEY, isProjectCapabilityKey } from '#lib/capabilities.js'
// I18N
import { toLocaleKebab } from '#lib/i18n.js'
import { adaptContentMap } from '#lib/i18n/contentRecords.js'
// SERVICES
// TYPES
import type {
  CapabilityDefinition,
  CapabilityDefinitions,
} from '#lib/capabilities.types.js'
import type {
  OrganisationFormInput,
  OrganisationFormLocaleSource,
  OrganisationFormSource,
  OrganisationPropertySource,
  OrganisationSubmitUpdatesParams,
} from '#lib/db/zod/schema/organisation.types.js'

/**
 * Converts persisted property locales and nullable values to editable form fields.
 * @param properties Stored or already editable organisation properties.
 * @returns Property inputs with all stored content locale buckets retained.
 */
function cloneOrganisationProperties(
  properties: OrganisationPropertySource[] | null | undefined,
): OrganisationFormInput['data']['properties'] {
  return (properties ?? []).map(property => {
    const locales = propertyLocalesToForm<{
      label: string
      labelGen?: boolean | 'true' | 'false'
      placeholder?: string | null
      placeholderGen?: boolean | 'true' | 'false'
    }>(property.i18n)
    // Initialize editable labels while retaining every locale and stored generation flag.
    const locale = (key: string) => ({
      label: locales?.[key]?.label ?? '',
      labelGen: locales?.[key]?.labelGen ?? false,
      placeholder: locales?.[key]?.placeholder ?? '',
      placeholderGen: locales?.[key]?.placeholderGen ?? false,
    })
    return {
      ...property,
      scope:
        property.scope === 'hub' || property.scope === 'organisation'
          ? property.scope
          : 'project',
      projectId: property.projectId ?? undefined,
      i18n: Object.fromEntries(Object.keys(locales).map(key => [key, locale(key)])),
      values: property.values?.map(value => {
        const valueLocales = propertyLocalesToForm<{
          value: string
          valueGen?: boolean | 'true' | 'false'
        }>(value.i18n)
        // Normalize nullable stored values into editable text.
        const valueLocale = (key: string) => ({
          value: valueLocales?.[key]?.value ?? '',
          valueGen: valueLocales?.[key]?.valueGen ?? false,
        })
        return {
          ...value,
          value: value.value ?? '',
          i18n: Object.fromEntries(
            Object.keys(valueLocales).map(key => [key, valueLocale(key)]),
          ),
        }
      }),
    }
  })
}

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

/** Restore editable capability labels, including added content languages.
 * @param capabilities Persisted or form-shaped capability definitions.
 * @returns Label maps with reversible form keys and defaults for the UI languages.
 * @remarks Additional language labels survive form reloads and optimistic updates.
 */
function normalizeOrganisationCapabilities(
  capabilities: CapabilityDefinitions | null | undefined,
): CapabilityDefinitions {
  if (!capabilities) return {}
  const normalized: CapabilityDefinitions = {}
  // Preserve stored languages while backfilling the three application-language defaults.
  for (const [rawKey, rawDefinition] of Object.entries(capabilities)) {
    if (!isProjectCapabilityKey(rawKey)) continue
    const defaults = CAPABILITY_I18N_BY_KEY[rawKey]
    const definition = (rawDefinition ?? {}) as CapabilityDefinition
    const labels = adaptContentMap(definition.i18n ?? {})
    normalized[rawKey] = {
      i18n: {
        ...labels,
        en: labels.en ?? defaults.en ?? rawKey,
        zhHans: labels.zhHans ?? defaults.zhHans ?? defaults.en ?? rawKey,
        zhHant: labels.zhHant ?? defaults.zhHant ?? defaults.en ?? rawKey,
      },
    }
  }
  return normalized
}

/**
 * Builds editable fields from committed Organisation data.
 * @param data - Committed resource, or absent for creation.
 * @returns Form baseline; missing locale settings inherit without persisting defaults.
 */
export function toOrganisationFormInput(
  data?: OrganisationFormSource | null,
): OrganisationFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        userPolicy: { ...DEFAULT_ORGANISATION_USER_POLICY },
        settings: {},
        code: '',
        url: '',
        capabilities: {},
        defaultLocationVisibility: 'shared',
        permitUserDetailsEdit: false,
        i18n: {
          en: normalizeOrganisationFormLocale(undefined),
          zhHans: normalizeOrganisationFormLocale(undefined),
          zhHant: normalizeOrganisationFormLocale(undefined),
        },
        userRoles: [],
        properties: [],
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
      userPolicy: { ...(data.userPolicy ?? DEFAULT_ORGANISATION_USER_POLICY) },
      code: data.code ?? '',
      url: data.url ?? '',
      settings: toOrganisationSettingsForm(data.settings),
      capabilities: normalizeOrganisationCapabilities(data.capabilities),
      defaultLocationVisibility: data.defaultLocationVisibility ?? 'shared',
      permitUserDetailsEdit: data.permitUserDetailsEdit === true,
      i18n: {
        en: normalizeOrganisationFormLocale(data.i18n?.en),
        zhHans: normalizeOrganisationFormLocale(data.i18n?.zhHans),
        zhHant: normalizeOrganisationFormLocale(data.i18n?.zhHant),
      },
      userRoles: (data.userRoles ?? [])
        .filter(userRole => isOrganisationStaffRole(userRole.role))
        .map(userRole => ({
          userId: userRole.userId ?? '',
          role: userRole.role as 'member' | 'owner',
          viewAnalytics: userRole.viewAnalytics === true,
        })),
      properties: cloneOrganisationProperties(data.properties),
    },
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
    const entityLocaleKey = toLocaleKebab(formLocaleKey)
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
          ...(formData.data.defaultLocationVisibility !== undefined
            ? { defaultLocationVisibility: formData.data.defaultLocationVisibility }
            : {}),
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
