// I18N
import { toLocaleCode, toFormLocaleRecord } from '$lib/i18n'
// ENUMS
import { OrganisationRoleType, ProjectRoleType } from '$lib/enums'
import { normalizeProjectLicense as normalizeSharedProjectLicense } from '$lib/project-license'
// CAPABILITIES
import {
  normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
// SERVICES
import {
  overrideResourceEntityBoolean,
  overrideResourceListItemBoolean,
} from '$lib/client/services/resource'
// TYPES
import type {
  CapabilityDefinitions,
  CapabilityKey,
  Locale,
  ProjectLicense,
} from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { User } from '$lib/db/zod/schema/user.types'
import type { ProjectParentOrganisationScope } from '$lib/api/services/authz/project'
import type {
  Project,
  ProjectBooleanField,
  ProjectCapabilities,
  ProjectFormInput,
  ProjectOwnerRoleSeedOrganisation,
  ProjectRoleCapabilities,
  ProjectSubmitUpdatesParams,
} from '$lib/db/zod/schema/project.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. BASE FORM SHAPING
//    - toDenseProperties
//    - toProjectFormInput
//    - toProjectIdentityPatch
//
// 2. STABLE NORMALIZATION
//    - toStableSignature
//    - toStableUserRoles
//    - normalizePropertiesForSubmit
//
// 3. SUBMIT UPDATE HELPERS
//    - getProjectSubmitUpdates
//    - resolveDefaultProjectOrganisationIdForCreate
//    - seedOwnerRolesForNewProject
//
// 4. PROJECT CAPABILITY HELPERS
//    - resolveProjectCapabilitySourceOrganisationId
//    - resolveProjectCapabilityDefinitionState
//    - normalizeProjectCapabilitiesForSubmit
//    - toComparableProjectUserRolesForSubmit
//    - toUserRolesWithRoleChange
//    - toProjectCapabilitiesAndRolesForToggle
//    - toUserRolesForCapabilityToggle

function normalizeProjectFormLocale(
  locale: Partial<ProjectFormInput['data']['i18n']['en']> | null | undefined,
): ProjectFormInput['data']['i18n']['en'] {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
  }
}

function normalizeProjectLicense(
  license: Project['license'] | null | undefined,
): ProjectLicense {
  return normalizeSharedProjectLicense(license)
}

type ProjectFormDefaults = {
  organisationId?: string
}

/**
 * Filters project form properties down to persisted property rows with concrete ids.
 * Used when callers need a dense property collection without draft/empty placeholders.
 */
export function toDenseProperties(
  properties: ProjectFormInput['data']['properties'] | undefined,
): Property[] {
  if (!Array.isArray(properties)) return []
  return properties.filter(
    property =>
      Boolean(property) &&
      typeof property === 'object' &&
      typeof (property as { id?: unknown }).id === 'string' &&
      ((property as { id: string }).id ?? '').length > 0,
  ) as Property[]
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
  })) as ProjectFormInput['data']['properties']
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
 * - property ranks are re-assigned as a single unified ordering
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

      if (property.type === 'classifier' && property.isTranslatable === false) {
        property.values = (property.values as Array<Record<string, unknown>>).map(
          propertyValue => {
            const valueI18n =
              propertyValue.i18n && typeof propertyValue.i18n === 'object'
                ? (propertyValue.i18n as Record<string, { value?: unknown }>)
                : {}
            const directValue =
              typeof propertyValue.value === 'string'
                ? propertyValue.value
                : (['en', 'zhHans', 'zhHant']
                    .map(localeKey => valueI18n[localeKey]?.value)
                    .find(
                      candidate =>
                        typeof candidate === 'string' && candidate.trim().length > 0,
                    ) ??
                  Object.values(valueI18n)
                    .map(entry => entry?.value)
                    .find(
                      candidate =>
                        typeof candidate === 'string' && candidate.trim().length > 0,
                    ) ??
                  '')

            return {
              ...propertyValue,
              value: directValue,
            }
          },
        )

        for (const propertyValue of property.values as Array<Record<string, unknown>>) {
          delete propertyValue.i18n
        }
      }
    }

    return property
  })

  return normalized
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRank = toNumericRank((a.item as Record<string, unknown>).rank)
      const bRank = toNumericRank((b.item as Record<string, unknown>).rank)
      if (aRank !== bRank) return aRank - bRank
      return a.index - b.index
    })
    .map(({ item }, rank) => ({
      ...(item as Record<string, unknown>),
      rank,
    }))
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
        mapStyleCode: '',
        code: '',
        i18n: {
          en: normalizeProjectFormLocale(undefined),
          zhHans: normalizeProjectFormLocale(undefined),
          zhHant: normalizeProjectFormLocale(undefined),
        },
        license: normalizeProjectLicense(undefined),
        capabilities: normalizeProjectCapabilities(undefined),
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
      mapStyleCode: data.mapStyle?.code ?? '',
      code: data.code,
      i18n: {
        en: normalizeProjectFormLocale(data.i18n?.en),
        zhHans: normalizeProjectFormLocale(data.i18n?.zhHans),
        zhHant: normalizeProjectFormLocale(data.i18n?.zhHant),
      },
      license: normalizeProjectLicense(data.license),
      capabilities: normalizeProjectCapabilities(data.capabilities),
      userRoles: (data.userRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role,
        capabilities: normalizeProjectRoleCapabilities(userRole.capabilities),
      })),
      properties: cloneProjectProperties(data.properties),
    },
  }
}

export function overrideProjectEntityBoolean(
  field: ProjectBooleanField,
  value: boolean,
) {
  return overrideResourceEntityBoolean(field, value)
}

export function overrideProjectListItemBoolean(
  projectId: string,
  field: ProjectBooleanField,
  value: boolean,
) {
  return overrideResourceListItemBoolean(projectId, field, value)
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
  const localeKey =
    locale === 'zh-hans' ? 'zhHans' : locale === 'zh-hant' ? 'zhHant' : 'en'
  const entityLocale = toLocaleCode(localeKey)
  const localeData = formData.data?.i18n?.[localeKey]

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
  extraQueries = [],
}: ProjectSubmitUpdatesParams<TEntityResult, TListResult>): Array<
  TEntityResult | TListResult | unknown
> {
  if (!projectId) return []
  return [entityQuery, listQuery, ...extraQueries]
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

export function resolveProjectCapabilitySourceOrganisationId(params: {
  formOrganisationId?: string | null
  optimisticOrganisationId?: string | null
  committedOrganisationId?: string | null
  hierarchyOrganisationId?: string | null
}): string {
  return (
    params.formOrganisationId ||
    params.optimisticOrganisationId ||
    params.committedOrganisationId ||
    params.hierarchyOrganisationId ||
    ''
  )
}

export function resolveProjectCapabilityDefinitionState(params: {
  organisationId: string
  isNewProjectRef: boolean
  hierarchyOrganisation?:
    | {
        id?: string | null
        capabilities?: CapabilityDefinitions
      }
    | null
    | undefined
  selectedOrganisation?:
    | {
        capabilities?: CapabilityDefinitions
      }
    | null
    | undefined
}): {
  definitions: CapabilityDefinitions
  isResolved: boolean
} {
  if (!params.organisationId) {
    return {
      definitions: {} as CapabilityDefinitions,
      isResolved: params.isNewProjectRef,
    }
  }

  const hierarchyOrganisation = params.hierarchyOrganisation
  if (hierarchyOrganisation?.id === params.organisationId) {
    if (Object.hasOwn(hierarchyOrganisation, 'capabilities')) {
      return {
        definitions:
          hierarchyOrganisation.capabilities &&
          typeof hierarchyOrganisation.capabilities === 'object'
            ? hierarchyOrganisation.capabilities
            : ({} as CapabilityDefinitions),
        isResolved: true,
      }
    }
  }

  const selectedOrganisation = params.selectedOrganisation
  if (
    selectedOrganisation != null &&
    Object.hasOwn(selectedOrganisation, 'capabilities')
  ) {
    return {
      definitions:
        selectedOrganisation.capabilities &&
        typeof selectedOrganisation.capabilities === 'object'
          ? selectedOrganisation.capabilities
          : ({} as CapabilityDefinitions),
      isResolved: true,
    }
  }

  return {
    definitions: {} as CapabilityDefinitions,
    isResolved: false,
  }
}

export function normalizeProjectCapabilitiesForSubmit(params: {
  submittedCapabilities: unknown
  fallbackCapabilities: unknown
  availableCapabilityKeys: CapabilityKey[]
}): ProjectCapabilities {
  const availableCapabilitySet = new Set(params.availableCapabilityKeys)
  const normalized = normalizeProjectCapabilities(
    params.submittedCapabilities ?? params.fallbackCapabilities,
  )
  for (const capabilityKey of Object.keys(normalized)) {
    if (!availableCapabilitySet.has(capabilityKey as CapabilityKey)) {
      normalized[capabilityKey as CapabilityKey] = false
    }
  }
  return normalized
}

export function toComparableProjectUserRolesForSubmit(
  value: unknown,
  params: {
    availableCapabilityKeys: CapabilityKey[]
    normalizedProjectCapabilities: ProjectCapabilities
  },
): Array<{ userId: string; role: string; capabilities: ProjectRoleCapabilities }> {
  if (!Array.isArray(value)) return []
  const availableCapabilitySet = new Set(params.availableCapabilityKeys)

  return value
    .filter(
      (
        item,
      ): item is {
        userId: string
        role: string
        capabilities?: ProjectRoleCapabilities
      } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { userId?: unknown }).userId === 'string' &&
        typeof (item as { role?: unknown }).role === 'string',
    )
    .map(item => {
      const normalizedRoleCapabilities = normalizeProjectRoleCapabilities(
        item.capabilities,
      )
      for (const capabilityKey of Object.keys(normalizedRoleCapabilities)) {
        if (!availableCapabilitySet.has(capabilityKey as CapabilityKey)) {
          normalizedRoleCapabilities[capabilityKey as CapabilityKey] = false
        }
        if (!params.normalizedProjectCapabilities[capabilityKey as CapabilityKey]) {
          normalizedRoleCapabilities[capabilityKey as CapabilityKey] = false
        }
      }
      if (item.role === ProjectRoleType.user) {
        for (const capabilityKey of Object.keys(normalizedRoleCapabilities)) {
          normalizedRoleCapabilities[capabilityKey as CapabilityKey] = false
        }
      }
      return {
        userId: item.userId,
        role: item.role,
        capabilities: normalizedRoleCapabilities,
      }
    })
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

export function toUserRolesWithRoleChange(params: {
  userRoles: NonNullable<ProjectFormInput['data']['userRoles']> | undefined
  userId: string
  role: ProjectRoleType
}): NonNullable<ProjectFormInput['data']['userRoles']> {
  return (params.userRoles ?? []).map(userRole => {
    if (userRole.userId !== params.userId) return userRole
    return {
      ...userRole,
      role: params.role,
      capabilities:
        params.role === ProjectRoleType.user
          ? normalizeProjectRoleCapabilities(undefined)
          : normalizeProjectRoleCapabilities(userRole.capabilities),
    }
  })
}

export function toProjectCapabilitiesAndRolesForToggle(params: {
  capabilities: unknown
  userRoles: NonNullable<ProjectFormInput['data']['userRoles']> | undefined
  capabilityKey: CapabilityKey
  value: boolean
}): {
  capabilities: ProjectCapabilities
  userRoles: NonNullable<ProjectFormInput['data']['userRoles']>
} {
  const nextCapabilities = normalizeProjectCapabilities(params.capabilities)
  nextCapabilities[params.capabilityKey] = params.value

  const nextUserRoles = (params.userRoles ?? []).map(userRole => {
    const nextRoleCapabilities = normalizeProjectRoleCapabilities(userRole.capabilities)
    if (!params.value) nextRoleCapabilities[params.capabilityKey] = false
    return {
      ...userRole,
      capabilities: nextRoleCapabilities,
    }
  })

  return { capabilities: nextCapabilities, userRoles: nextUserRoles }
}

export function toUserRolesForCapabilityToggle(params: {
  userRoles: NonNullable<ProjectFormInput['data']['userRoles']> | undefined
  userId: string
  capabilityKey: CapabilityKey
  value: boolean
}): NonNullable<ProjectFormInput['data']['userRoles']> {
  return (params.userRoles ?? []).map(userRole => {
    if (userRole.userId !== params.userId) return userRole
    if (userRole.role === ProjectRoleType.user) {
      return {
        ...userRole,
        capabilities: normalizeProjectRoleCapabilities(undefined),
      }
    }

    const nextRoleCapabilities = normalizeProjectRoleCapabilities(userRole.capabilities)
    nextRoleCapabilities[params.capabilityKey] = params.value
    return {
      ...userRole,
      capabilities: nextRoleCapabilities,
    }
  })
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

  const ownerRoleRows = (result.data.userRoles ?? []).filter(
    userRole => userRole.role === OrganisationRoleType.owner && userRole.user,
  )
  const ownerRoles = ownerRoleRows.map(userRole => ({
    userId: userRole.userId,
    role: ProjectRoleType.owner,
  }))
  const selectedOwners = Object.fromEntries(
    ownerRoleRows.map(userRole => [userRole.userId, userRole.user]),
  ) as Record<string, User>

  return {
    nextOwnerRoleSeedAttempt,
    shouldApply: ownerRoles.length > 0,
    shouldMarkSeeded: true,
    ownerRoles,
    selectedOwners,
  }
}
