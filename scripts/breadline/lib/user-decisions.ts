// +++ Table Of Contents
// 1. REVIEWED DECISIONS
// 2. VALIDATION
// ---

export interface UserDecisions {
  version: 1
  merges: Array<{ targetEmail: string; sourceEmails: string[] }>
  excludeEmails: string[]
}

/**
 * Validate private, operator-reviewed account decisions before planning.
 * @param value Parsed private JSON; email addresses are never logged on failure.
 * @returns Normalized disjoint decisions without chains, cycles or exclusions of merge members.
 */
export function parseUserDecisions(value: unknown): UserDecisions {
  const fail = (): never => {
    throw new Error('Invalid user decisions')
  }
  if (!value || typeof value !== 'object') return fail()
  const input = value as Record<string, unknown>
  if (
    input.version !== 1 ||
    !Array.isArray(input.merges) ||
    !Array.isArray(input.excludeEmails)
  )
    return fail()
  const email = (value: unknown): string => {
    if (typeof value !== 'string') return fail()
    const normalized = value.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return fail()
    return normalized
  }
  const seen = new Set<string>()
  const unique = (value: unknown): string => {
    const normalized = email(value)
    if (seen.has(normalized)) return fail()
    seen.add(normalized)
    return normalized
  }
  const merges = input.merges.map(value => {
    if (!value || typeof value !== 'object') return fail()
    const rule = value as Record<string, unknown>
    if (!Array.isArray(rule.sourceEmails) || !rule.sourceEmails.length) return fail()
    return {
      targetEmail: unique(rule.targetEmail),
      sourceEmails: rule.sourceEmails.map(unique),
    }
  })
  return { version: 1, merges, excludeEmails: input.excludeEmails.map(unique) }
}
