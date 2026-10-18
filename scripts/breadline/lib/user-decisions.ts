// VALIDATION
import { normalizeTelephone } from '../../../src/lib/utils/telephone'

// +++ Table Of Contents
// 1. REVIEWED DECISIONS
// 2. VALIDATION
// ---

export interface UserDecisions {
  version: 1
  merges: Array<{ targetEmail: string; sourceEmails: string[] }>
  excludeEmails: string[]
  telephoneOverrides?: Array<{
    sourceUserId: number
    expectedTelephone: string
    telephone: string | null
  }>
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
  const overrideIds = new Set<number>()
  if (
    input.telephoneOverrides !== undefined &&
    !Array.isArray(input.telephoneOverrides)
  )
    return fail()
  const telephoneOverrides = ((input.telephoneOverrides ?? []) as unknown[]).map(
    value => {
      if (!value || typeof value !== 'object') return fail()
      const rule = value as Record<string, unknown>
      if (
        typeof rule.sourceUserId !== 'number' ||
        !Number.isSafeInteger(rule.sourceUserId) ||
        rule.sourceUserId <= 0 ||
        overrideIds.has(rule.sourceUserId) ||
        typeof rule.expectedTelephone !== 'string' ||
        !rule.expectedTelephone.trim() ||
        (rule.telephone !== null &&
          (typeof rule.telephone !== 'string' ||
            normalizeTelephone(rule.telephone) !== rule.telephone))
      )
        return fail()
      overrideIds.add(rule.sourceUserId)
      return {
        sourceUserId: rule.sourceUserId,
        expectedTelephone: rule.expectedTelephone.trim(),
        telephone: rule.telephone as string | null,
      }
    },
  )
  return {
    version: 1,
    merges,
    excludeEmails: input.excludeEmails.map(unique),
    ...(telephoneOverrides.length ? { telephoneOverrides } : {}),
  }
}
