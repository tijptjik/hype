// DOMAIN
import {
  listWorkerDomains,
  type HubDomainEnvironment,
} from '../../src/lib/server/hub-domains'

type Route = string | { pattern: string; custom_domain?: boolean }

/**
 * Preserves live custom domains when Wrangler replaces the deployment route set.
 * @param env - Operator Cloudflare credentials.
 * @param service - Worker being deployed.
 * @param routes - Explicit routes from the repository configuration.
 * @returns Configured routes plus every current domain assigned to this Worker.
 * @remarks Fail closed on inventory errors; never silently deploy a partial domain list.
 */
export async function preserveHubDomainRoutes(
  env: HubDomainEnvironment,
  service: string,
  routes: Route[],
): Promise<Route[]> {
  const domains = await listWorkerDomains(env)
  const patterns = new Set(
    routes.map(route => (typeof route === 'string' ? route : route.pattern)),
  )
  return [
    ...routes,
    ...domains
      .filter(
        domain =>
          domain.service === service &&
          domain.environment === 'production' &&
          !patterns.has(domain.hostname),
      )
      .map(domain => ({ pattern: domain.hostname, custom_domain: true })),
  ]
}
