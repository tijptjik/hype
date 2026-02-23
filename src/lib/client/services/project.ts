// I18N
import { toLocaleFromOrganisationFormLocaleKey } from '$lib/i18n'
// TYPES
import type {
  Locale,
  Project,
  ProjectBooleanField,
  ProjectFormInput,
  ProjectSubmitUpdatesParams,
} from '$lib/types'

function normalizeProjectFormLocale(
  locale: Partial<ProjectFormInput['data']['i18n']['en']> | null | undefined,
): ProjectFormInput['data']['i18n']['en'] {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    license: locale?.license ?? '',
    attribution: locale?.attribution ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
    licenseGen: locale?.licenseGen ?? false,
    attributionGen: locale?.attributionGen ?? false,
  }
}

type ProjectFormDefaults = {
  organisationId?: string
}

export function toProjectFormInput(
  data?: Project | null,
  defaults?: ProjectFormDefaults,
): ProjectFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        organisationId: defaults?.organisationId ?? '',
        code: '',
        i18n: {
          en: normalizeProjectFormLocale(undefined),
          zhHans: normalizeProjectFormLocale(undefined),
          zhHant: normalizeProjectFormLocale(undefined),
        },
        maintainerRoles: [],
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
      organisationId: data.organisationId,
      code: data.code,
      i18n: {
        en: normalizeProjectFormLocale(data.i18n?.en),
        zhHans: normalizeProjectFormLocale(data.i18n?.['zh-hans']),
        zhHant: normalizeProjectFormLocale(data.i18n?.['zh-hant']),
      },
      maintainerRoles: (data.maintainerRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role,
      })),
      properties: data.properties ?? [],
    },
  }
}

export function overrideProjectEntityBoolean(
  field: ProjectBooleanField,
  value: boolean,
) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

export function overrideProjectListItemBoolean(
  projectId: string,
  field: ProjectBooleanField,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === projectId ? { ...item, [field]: value } : item,
    ),
  })
}

export function toProjectIdentityPatch(
  formData: ProjectFormInput,
  locale: Locale,
): {
  code: string
  locale: Locale
  name: string
  nameShort: string
} {
  const formLocale =
    locale === 'zh-hans' ? 'zhHans' : locale === 'zh-hant' ? 'zhHant' : 'en'
  const entityLocale = toLocaleFromOrganisationFormLocaleKey(formLocale)
  const localeData = formData.data?.i18n?.[formLocale]

  return {
    code: formData.data?.code ?? '',
    locale: entityLocale,
    name: localeData?.name ?? '',
    nameShort: localeData?.nameShort ?? '',
  }
}

export function getProjectSubmitUpdates<TEntityResult, TListResult>({
  projectId,
  entityQuery,
  listQuery,
}: ProjectSubmitUpdatesParams<TEntityResult, TListResult>): Array<
  TEntityResult | TListResult
> {
  if (!projectId) return []
  return [entityQuery, listQuery]
}
