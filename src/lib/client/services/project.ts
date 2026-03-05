// I18N
import { toLocaleCode, toFormLocaleRecord } from '$lib/i18n'
// ENUMS
import { OrganisationRoleType, ProjectRoleType } from '$lib/enums'
// TYPES
import type {
  Locale,
  Project,
  ProjectBooleanField,
  ProjectFormInput,
  ProjectParentOrganisationScope,
  PropertyDiscriminator,
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

function cloneProjectProperties(
  properties: Project['properties'] | null | undefined,
): ProjectFormInput['data']['properties'] {
  if (!properties) return []
  return properties.map(property => ({
    ...property,
    i18n: toFormLocaleRecord(property.i18n) as typeof property.i18n,
    values: Array.isArray(property.values)
      ? property.values.map(value => ({
          ...value,
          i18n: toFormLocaleRecord(value.i18n) as typeof value.i18n,
        }))
      : property.values,
  }))
}

function toNumericRank(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string' && input.trim() && !Number.isNaN(Number(input))) {
    return Number(input)
  }
  return Number.POSITIVE_INFINITY
}

/**
 * Build a deterministic JSON signature by recursively sorting object keys.
 * Used to compare nested form payloads (for example user roles/properties)
 * without false diffs caused by key ordering.
 */
export function toStableSignature(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(item => normalize(item))
    if (!input || typeof input !== 'object') return input
    const entries = Object.entries(input as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalize(item)])
    return Object.fromEntries(entries)
  }

  return JSON.stringify(normalize(value))
}

/**
 * Canonicalize user-role arrays before change detection.
 * Used during project form submit to avoid noisy diffs from UI ordering and
 * to compare only role identity (`userId`, `role`).
 */
export function toStableUserRoles(
  value: unknown,
): Array<{ userId: string; role: string }> {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is { userId: string; role: string } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { userId?: unknown }).userId === 'string' &&
        typeof (item as { role?: unknown }).role === 'string',
    )
    .map(item => ({ userId: item.userId, role: item.role }))
    .sort((a, b) => a.userId.localeCompare(b.userId) || a.role.localeCompare(b.role))
}

/**
 * Normalize project properties into canonical rank order for submission:
 * - value ranks are re-assigned by sorted order
 * - property ranks are re-assigned independently for classifier/specifier types
 *
 * This is used before diffing/sending `data.properties` so semantically identical
 * edits produce stable payloads and only real changes are submitted.
 */
export function normalizePropertiesForSubmit(
  value: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const normalized = value.map(item => {
    const property = { ...item }

    if (Array.isArray(property.values)) {
      const propertyValues = property.values as Array<Record<string, unknown>>
      property.values = propertyValues
        .map((propertyValue, index) => ({ propertyValue, index }))
        .sort((a, b) => {
          const aRank = toNumericRank(a.propertyValue.rank)
          const bRank = toNumericRank(b.propertyValue.rank)
          if (aRank !== bRank) return aRank - bRank
          return a.index - b.index
        })
        .map(({ propertyValue }, rank) => ({
          ...propertyValue,
          rank,
        }))
    }

    return property
  })

  const assignRankForType = (type: PropertyDiscriminator): void => {
    const items = normalized
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!item || typeof item !== 'object') return false
        return (item as Record<string, unknown>).type === type
      })
      .sort((a, b) => {
        const aRank = toNumericRank((a.item as Record<string, unknown>).rank)
        const bRank = toNumericRank((b.item as Record<string, unknown>).rank)
        if (aRank !== bRank) return aRank - bRank
        return a.index - b.index
      })

    items.forEach(({ item }, rank) => {
      ;(item as Record<string, unknown>).rank = rank
    })
  }

  assignRankForType('classifier')
  assignRankForType('specifier')

  return normalized
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
        zhHans: normalizeProjectFormLocale(data.i18n?.zhHans),
        zhHant: normalizeProjectFormLocale(data.i18n?.zhHant),
      },
      userRoles: (data.userRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role,
      })),
      properties: cloneProjectProperties(data.properties),
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
  const entityLocale = toLocaleCode(formLocale)
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
