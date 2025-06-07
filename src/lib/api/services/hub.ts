// API
import { applyQueryFilters } from '$lib/api';
// AUTH
import { assertUserLoggedIn, assertSuperAdmin, runAssertions } from '$lib/auth/asserts';
// SCHEMA
import { hub } from '$lib/db/schema';
// DB
import { toLocaleMap } from '$lib/db';
// ZOD
import { getLocales } from '$lib/db/zod/constraints';
import { HubAPI, HubCollectionAPI } from '$lib/db/zod/schemas/hub';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
// TYPES
import type { SQL } from 'drizzle-orm';
import type { Hub, QueryParams, HubOpts, HubDB, Session, Code, HubDBRaw, OrganisationDBRaw, OrganisationI18nDB } from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';

// ═══════════════════════
// WITH RELATIONS
// ═══════════════════════

// Simple relations for hub collection
export const hubCollectionWithRelations = {
  organisations: {
    with: {
      i18n: {},
      image: {}
    }
  }
};

export const hubEntityWithRelations = {
  ...hubCollectionWithRelations
};

// ═══════════════════════
// HUB DOMAIN MAPPING
// ═══════════════════════

/**
 * Parses host to determine hub identifier without DB lookup
 * Returns hub identifier object for efficient filtering
 */
export function getHubFromDomain(host: string | null): HubOpts {
  // Development override
  if (import.meta.env.VITE_HUB_CODE) {
    const code = import.meta.env.VITE_HUB_CODE;
    return {
      code: code === 'core' ? undefined : code,
      isCore: code === 'core'
    };
  }

  // Default to core
  if (!host) return { isCore: true };

  // Remove port number if present
  const domain = host.split(':')[0];

  // localhost -> core (development)
  if (domain === 'localhost') {
    return { isCore: true };
  }

  // hype.hk -> core
  if (domain === 'hype.hk') {
    return { isCore: true };
  }

  // subdomain.hype.hk -> use subdomain as hub code
  if (domain.endsWith('.hype.hk')) {
    const subdomain = domain.replace('.hype.hk', '');
    return { code: subdomain, isCore: false };
  }

  // custom domain -> use full domain as hub domain
  return { domain, isCore: false };
}

/**
 * Get the query context for the organisation resource - filters the query based on the user's roles, and the query parameters.
 * @param session - The session object
 * @param request - The request object
 * @param params - The query parameters
 * @param userRoles - The user roles
 */
export const getHubQueryContext = (params: QueryParams) => {
  // SETUP : Only superadmins can query hubs, so we
  // don't need to filter by anything other than the query params.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns: string[] = [];

  if (Object.keys(params).length > 0) {
    applyQueryFilters(hub, params, conditions);
  }

  return { params, conditions, excludeColumns };
};

/********************
 *  5. UTILS :: SHAPING
 ************/

/**
 * Rebuilds form data from database entities
 * @param hub - The hub database entity
 * @returns Validated form data
 */
export const toFormShape = async (hub: HubDB): Promise<SuperValidated<Hub>> => {
  // @ts-ignore TODO - Fix Zod type error
    // Transform the hub data structure
  const transformedHub = {
    ...hub,
    organisations: hub.organisations?.map((organisation: OrganisationDBRaw) => {
      return {
        ...organisation,
        i18n: toLocaleMap<OrganisationI18nDB>(organisation.i18n as OrganisationI18nDB[]),
        // Image is already a full object from the relation, no transformation needed
        image: organisation.image || null
      };
    }) || null
  };
  const form = await superValidate(transformedHub, zod(HubAPI) as any);
  return form as SuperValidated<Hub>;
};

/**
 * Builds response data from database entities
 * @param hub - The hub database entity (can be partial from queries)
 * @returns A parsed response shape
 */
export const toResponseShape = async (hub: HubDBRaw, isCollection: boolean = false) => {
  // Transform the hub data structure
  const transformedHub = {
    ...hub,
    organisations: hub.organisations?.map((organisation: OrganisationDBRaw) => {
      return {
        ...organisation,
        i18n: toLocaleMap<OrganisationI18nDB>(organisation.i18n as OrganisationI18nDB[]),
        // Image is already a full object from the relation, no transformation needed
        image: organisation.image || null
      };
    }) || null
  };

  return isCollection
    ? (HubCollectionAPI.parse(transformedHub) as Hub)
    : (HubAPI.parse(transformedHub) as Hub);
};

/********************
 *  ACCESS CONTROL
 ************/
/**
 * Get the context for updating a hub
 * @param session - The session object
 * @param formData - The form data
 * @param refId - The code from the URL parameter
 * @returns Object containing validation and access control context
 * @remarks We don't need to assert code in params equals code in form,
 * as we want to allow the users to change the code of the hub.
 */
export const assertPermissionsToUpdateHub = (session: Session) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(session as any),
    () => assertSuperAdmin(session)
  );

  if (assertionError) return assertionError;
};
