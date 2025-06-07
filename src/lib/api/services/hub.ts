// API
import { applyQueryFilters } from "$lib/api";
// SCHEMA
import { hub } from "$lib/db/schema";
// TYPES
import type { SQL } from "drizzle-orm";
import type { Hub, QueryParams, HubOpts } from "$lib/types";

// ═══════════════════════
// WITH RELATIONS
// ═══════════════════════

// Simple relations for hub collection
export const hubCollectionWithRelations = {
  organisation: {
    with: {
      i18n: true
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
    return { code : subdomain, isCore: false };
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
export const getHubQueryContext = (
  params: QueryParams
) => {
  // SETUP : Only superadmins can query hubs, so we
  // don't need to filter by anything other than the query params.
  let conditions: SQL<unknown>[] = [];
  let excludeColumns: string[] = [];

  if (Object.keys(params).length > 0) {
    applyQueryFilters(hub, params, conditions);
  }

  return { params, conditions, excludeColumns };
};