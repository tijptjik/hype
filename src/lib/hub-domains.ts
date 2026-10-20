// DATA
import inventory from './data/hub-domain-reservations.json'

/** DNS label syntax used by hub codes. */
export const HUB_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])$/

/**
 * Checks infrastructure names reserved by the Cloudflare inventory.
 * @param code - Candidate hub code.
 * @returns Whether the name must not be newly assigned.
 */
export function isReservedHubCode(code: string): boolean {
  return inventory.names.includes(code.trim().toLowerCase())
}

/**
 * Extracts hub namespaces occupied by DNS records, including nested records.
 * @param names - DNS owner names; record contents are deliberately excluded.
 * @returns Sorted unique names beneath hype.hk.
 * @remarks A nested record reserves its entire first-level namespace.
 */
export function reservedHubNames(names: string[]): string[] {
  return [
    ...new Set([
      'core',
      'www',
      'preview',
      'admin',
      'api',
      'mail',
      ...names
        .map(name => name.toLowerCase().replace(/\.$/, ''))
        .filter(name => name.endsWith('.hype.hk'))
        .map(name => name.slice(0, -'.hype.hk'.length).split('.').at(-1)!)
        .filter(name => name !== '*'),
    ]),
  ].sort()
}
