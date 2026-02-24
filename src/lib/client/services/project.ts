// I18N
import { toLocaleFromOrganisationFormLocaleKey } from '$lib/i18n'
// ENUMS
import { OrganisationRoleType, ProjectRoleType } from '$lib/enums'
// TYPES
import type {
  Locale,
  Project,
  ProjectBooleanField,
  ProjectFormInput,
  ProjectParentOrganisationScope,
  ProjectOwnerRoleSeedOrganisation,
  ProjectSubmitUpdatesParams,
  User,
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
      organisationId: data.organisationId,
      code: data.code,
      i18n: {
        en: normalizeProjectFormLocale(data.i18n?.en),
        zhHans: normalizeProjectFormLocale(data.i18n?.['zh-hans']),
        zhHant: normalizeProjectFormLocale(data.i18n?.['zh-hant']),
      },
      userRoles: (data.userRoles ?? []).map(userRole => ({
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

export function resolveDefaultProjectOrganisationIdForCreate(params: {
  isNewProjectRef: boolean
  currentOrganisationId?: string | null
  scope: ProjectParentOrganisationScope
}): string | null {
  if (!params.isNewProjectRef) return null
  if (params.currentOrganisationId) return null
  if (params.scope.allowAll) return null
  if (params.scope.hubIds.length > 0) return null

  const uniqueOrganisationIds = Array.from(new Set(params.scope.organisationIds))
  if (uniqueOrganisationIds.length !== 1) return null
  return uniqueOrganisationIds[0] ?? null
}

export async function seedOwnerRolesForNewProject(params: {
  organisationId: string
  isNewProjectRef: boolean
  formUserRoleValues: Array<{ userId: string; role: string }>
  autoSeededOwnerOrganisationIds: Set<string>
  ownerRoleSeedAttempt: number
  validateAttempt: (attempt: number) => boolean
  getOrganisationById: (
    organisationId: string,
  ) => Promise<ProjectOwnerRoleSeedOrganisation>
}): Promise<{
  nextOwnerRoleSeedAttempt: number
  shouldApply: boolean
  shouldMarkSeeded: boolean
  ownerRoles: Array<{ userId: string; role: ProjectRoleType }>
  selectedOwners: Record<string, User>
}> {
  const shouldSkip =
    !params.organisationId ||
    !params.isNewProjectRef ||
    params.formUserRoleValues.length > 0 ||
    params.autoSeededOwnerOrganisationIds.has(params.organisationId)
  if (shouldSkip) {
    return {
      nextOwnerRoleSeedAttempt: params.ownerRoleSeedAttempt,
      shouldApply: false,
      shouldMarkSeeded: false,
      ownerRoles: [],
      selectedOwners: {},
    }
  }

  const nextOwnerRoleSeedAttempt = params.ownerRoleSeedAttempt + 1
  const result = await params
    .getOrganisationById(params.organisationId)
    .catch(() => null)
  if (!result?.data || !params.validateAttempt(nextOwnerRoleSeedAttempt)) {
    return {
      nextOwnerRoleSeedAttempt,
      shouldApply: false,
      shouldMarkSeeded: false,
      ownerRoles: [],
      selectedOwners: {},
    }
  }

  const ownerRoles = (result.data.userRoles ?? [])
    .filter(userRole => userRole.role === OrganisationRoleType.owner)
    .map(userRole => ({
      userId: userRole.userId,
      role: ProjectRoleType.owner,
    }))
  const selectedOwners = Object.fromEntries(
    (result.data.userRoles ?? [])
      .filter(userRole => userRole.role === OrganisationRoleType.owner && userRole.user)
      .map(userRole => [userRole.userId, userRole.user]),
  ) as Record<string, User>

  return {
    nextOwnerRoleSeedAttempt,
    shouldApply: ownerRoles.length > 0,
    shouldMarkSeeded: true,
    ownerRoles,
    selectedOwners,
  }
}
