// LIB
import { toBooleanOrUndefined } from '$lib/api/services'
// SCHEMA
import { hub, hubProperty } from '$lib/db/schema/index'
// DB
import { transformI18nSafely } from '$lib/db'
import { toImageEnvelope } from '$lib/db/services/image'
// ZOD
import {
  HubCardProfileAPI,
  HubDetailProfileAPI,
  HubListProfileAPI,
  HubProfile,
} from '$lib/db/zod'
// ENUMS
import { ImageContextResource } from '$lib/enums'
// TYPES
import { asc, sql, type SQL } from 'drizzle-orm'
import type {
  EntityResponse,
  Hub,
  HubDB,
  HubDBRaw,
  HubEntityByProfile,
  HubListByProfile,
  HubOptsExtended,
  HubProfile as HubProfileType,
  Id,
  ListResponse,
} from '$lib/types'

type UnknownRecord = Record<string, unknown>
type ToImageArg = Parameters<typeof toImageEnvelope>[0]

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - hubCollectionWithRelations
// - hubEntityWithRelations
//
// PROFILE SHAPING
// - toHubProfile
// - toProfileResponseShape
// - toEntityResponseShape
// - toListResponseShape
//
// QUERY CONTEXT
// - toLookupConditions
// - toRequestedListState
// - toQueryConditions
//
// HUB DOMAIN MAPPING
// - getHubFromDomain
// - isCore

// ═══════════════════════
// DB RELATIONS
// ═══════════════════════

/**
 * Baseline relation graph for hub collection reads.
 * Keeps list endpoints lightweight while still providing display i18n and image data.
 */
export const hubCollectionWithRelations = {
  i18n: true,
  image: true,
}

/**
 * Full relation graph for hub entity reads.
 * Includes user roles, organisations, and ordered property assignments for admin/detail flows.
 */
export const hubEntityWithRelations = {
  i18n: true,
  image: true,
  propertyAssignments: {
    orderBy: [asc(hubProperty.rank)],
    with: {
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true,
            },
          },
        },
      },
    },
  },
  properties: {
    with: {
      i18n: true,
      values: {
        with: {
          i18n: true,
        },
      },
    },
  },
  userRoles: {
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          image: true,
          attribution: true,
        },
      },
    },
  },
  organisations: {
    with: {
      i18n: true,
      image: true,
    },
  },
}

// ═══════════════════════
// PROFILE SHAPING
// ═══════════════════════

/**
 * Normalizes unknown profile input to a supported hub profile value.
 * Falls back when value is missing or invalid.
 */
export const toHubProfile = (
  value: unknown,
  fallback: HubProfileType,
): HubProfileType => {
  const parsed = HubProfile.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/**
 * Normalizes property-value rows so nested i18n is consistently transformed.
 */
const mapPropertyValuesWithI18n = (values: unknown): UnknownRecord[] =>
  ((values as UnknownRecord[] | undefined) ?? []).map(value => ({
    ...value,
    i18n: transformI18nSafely(value.i18n as never),
  }))

/**
 * Normalizes property rows and their nested values to transformed i18n maps.
 */
const mapPropertiesWithI18n = (properties: unknown): UnknownRecord[] =>
  ((properties as UnknownRecord[] | undefined) ?? []).map(property => ({
    ...property,
    i18n: transformI18nSafely(property.i18n as never),
    values: mapPropertyValuesWithI18n(property.values),
  }))

/**
 * Projects assigned properties from `propertyAssignments` when present.
 * Falls back to direct `properties` relation for compatibility with mixed query shapes.
 */
const mapPropertiesFromAssignments = (row: UnknownRecord): UnknownRecord[] => {
  const assignments = ((row.propertyAssignments as UnknownRecord[] | undefined) ?? [])
    .map(item => item.property as UnknownRecord | null)
    .filter((item): item is UnknownRecord => Boolean(item))

  if (assignments.length > 0) {
    return assignments.map((property, rank) => ({
      ...property,
      rank,
      i18n: transformI18nSafely(property.i18n as never),
      values: mapPropertyValuesWithI18n(property.values),
    }))
  }

  return mapPropertiesWithI18n(row.properties)
}

/**
 * Normalizes organisation relation rows and shapes image envelopes for requested view density.
 */
const mapOrganisationsWithImage = (
  organisations: unknown,
  view: 'card' | 'list',
): UnknownRecord[] =>
  ((organisations as UnknownRecord[] | undefined) ?? []).map(organisation => ({
    ...organisation,
    i18n: transformI18nSafely(organisation.i18n as never),
    image: organisation.image
      ? toImageEnvelope(
          organisation.image as unknown as ToImageArg,
          view,
          ImageContextResource.organisation,
          organisation.id as string,
        )
      : null,
  }))

/**
 * Shapes a raw hub row into a profile-specific API payload.
 * Ensures i18n and nested relation payloads are normalized for frontend consumption.
 */
const toProfileResponseShape = <P extends HubProfileType>(
  row: HubDBRaw,
  profile: P,
): HubEntityByProfile<P> => {
  const shaped = {
    ...row,
    i18n: transformI18nSafely(row.i18n as never),
    image: row.image
      ? toImageEnvelope(
          row.image as never,
          'card',
          ImageContextResource.hub,
          row.id as string,
        )
      : null,
    userRoles: (
      (row.userRoles as Array<Record<string, unknown>> | undefined) ?? []
    ).map(userRole => ({
      ...userRole,
      user: userRole.user,
    })),
    organisations: mapOrganisationsWithImage(
      row.organisations,
      'card',
    ) as Hub['organisations'],
    properties: mapPropertiesFromAssignments(row as UnknownRecord) as Hub['properties'],
  }

  if (profile === 'list') {
    return HubListProfileAPI.parse(shaped) as HubEntityByProfile<P>
  }
  if (profile === 'card') {
    return HubCardProfileAPI.parse(shaped) as HubEntityByProfile<P>
  }
  return HubDetailProfileAPI.parse(shaped) as HubEntityByProfile<P>
}

/**
 * Wraps a single hub row in the standard entity response envelope.
 */
export const toEntityResponseShape = <P extends HubProfileType>(
  data: HubDBRaw | null,
  profile: P,
): EntityResponse<HubEntityByProfile<P> | null> => ({
  data: data ? toProfileResponseShape(data, profile) : null,
})

/**
 * Wraps hub collection rows in the standard paginated list response envelope.
 */
export const toListResponseShape = <P extends HubProfileType>(params: {
  data: HubDBRaw[]
  profile: P
  limit?: number | undefined
  offset?: number
  totalCount?: number
  hasMore?: boolean
  nextOffset?: number | null
}): ListResponse<HubListByProfile<P>> => ({
  data: params.data.map(row =>
    toProfileResponseShape(row, params.profile),
  ) as HubListByProfile<P>[],
  limit: params.limit ?? undefined,
  offset: params.offset ?? 0,
  totalCount: params.totalCount ?? 0,
  hasMore: params.hasMore ?? false,
  nextOffset: params.nextOffset,
})

// ═══════════════════════
// QUERY CONTEXT
// ═══════════════════════

/**
 * Builds lookup conditions from route references.
 * Supports both id and code key strategies.
 */
export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<HubDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<HubDB>)
    : ({ id: params.ref as Id } as Partial<HubDB>)

/**
 * Resolves requested hub list visibility state with safe public defaults.
 */
export const toRequestedListState = (conditions: Partial<HubDB>) => ({
  isPublished: toBooleanOrUndefined(conditions.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(conditions.isArchived) ?? false,
})

/**
 * Converts validated lookup params into SQL where conditions.
 */
export const toQueryConditions = (
  params: { refKey?: 'id' | 'code' },
  queryParams: Partial<HubDB>,
): SQL<unknown>[] =>
  params.refKey === 'code'
    ? [sql`${hub.code} = ${queryParams.code as string}`]
    : [sql`${hub.id} = ${queryParams.id as Id}`]

// ═══════════════════════
// HUB DOMAIN MAPPING
// ═══════════════════════

/**
 * Resolves hub lookup hints from host/domain input without a DB read.
 * This allows early request scoping in hooks and manifest routes.
 */
export function getHubFromDomain(
  host: string | null,
  hubCode?: string,
): Partial<HubOptsExtended> {
  const coreConfig = {
    code: 'core',
    domain: 'hype.hk',
    isCore: true,
    i18n: {
      en: {
        locale: 'en',
        name: 'HYPE.HK',
        nameShort: 'HYPE',
        description: 'Beautiful Hong Kong',
      },
      zhHant: {
        locale: 'zh-hant',
        name: 'HYPE.HK',
        nameShort: 'HYPE',
        description: '美丽的香港',
      },
      zhHans: {
        locale: 'zh-hans',
        name: 'HYPE.HK',
        nameShort: 'HYPE',
        description: '美丽的香港',
      },
    },
  }

  if (!host) return coreConfig

  const domain = host.split(':')[0]

  if (
    domain === 'localhost' ||
    domain === '127.0.0.1' ||
    domain === '192.168.1.100' ||
    domain === '192.168.1.100.traefik.me' ||
    domain === 'dove-main-tapir.ngrok-free.app'
  ) {
    return hubCode && hubCode !== 'core' ? { code: hubCode } : coreConfig
  }

  if (domain === 'hype.hk' || domain === 'preview.hype.hk') {
    return coreConfig
  }

  if (domain.endsWith('.hype.hk')) {
    const subdomain = domain.replace('.hype.hk', '')
    return { code: subdomain }
  }

  return { domain }
}

/**
 * Convenience helper indicating whether hub context should be treated as core scope.
 */
export const isCore = (hub: HubOptsExtended): boolean =>
  hub.code === 'core' || hub.code === undefined
