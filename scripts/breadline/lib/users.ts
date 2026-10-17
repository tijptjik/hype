// NODE
import { createHmac } from 'node:crypto'
// LIBRARIES
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
// USERNAMES
import { generateRunnerUsernameFromId } from '../../../src/lib/utils/username-generator.server'

// REVIEWED DECISIONS
import { parseUserDecisions, type UserDecisions } from './user-decisions'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. TYPES AND NORMALIZATION
// 2. USER MAPPING
// 3. REVIEW SQL
// ---

export interface LegacyUser {
  id: number
  volunteer_id: number | null
  uid: string | null
  email: string | null
  name: string | null
  telephone: string | null
  locale: string | null
  picture: string | null
  created_at: string | null
  last_updated_at: string | null
}
export interface TargetUser {
  id: string
  email: string | null
  username: string | null
  emailVerified: boolean | number | null
  isArchived: boolean | number
  isAnonymous: boolean | number | null
}
export interface TargetAccount {
  id: string
  userId: string
  providerId: string
  accountId: string
}
export interface TargetIdentitySnapshot {
  users: TargetUser[]
  accounts: TargetAccount[]
}
export interface ImportedUser {
  id: string
  name: string | null
  email: string | null
  username: string
  displayUsername: string
  telephone: string | null
  locale: 'en' | 'zh-hant' | 'zh-hans'
  image: string | null
  emailVerified: number
  isAnonymous: number
  isArchived: number
  createdAt: number
  updatedAt: number
}
export interface ImportedAccount {
  id: string
  userId: string
  providerId: 'google'
  accountId: string
  createdAt: number
  updatedAt: number
}
export interface UserImportPlan {
  users: ImportedUser[]
  accounts: ImportedAccount[]
  mapping: Array<{
    sourceUserId: number
    sourceVolunteerId: number | null
    targetUserId: string
    disposition: 'create' | 'match'
  }>
  excluded: Array<{
    sourceUserId: number
    sourceVolunteerId: number | null
    reason: 'reviewed_exclusion'
  }>
  targetChanges: Array<
    | {
        action: 'merge'
        sourceUserId: string
        targetEmail: string
        targetUserId: string | null
      }
    | { action: 'exclude'; sourceUserId: string }
  >
  exceptions: Array<{ sourceUserIds: number[]; reason: string }>
  warnings: Array<{ sourceUserIds: number[]; reason: string }>
  counts: {
    source: number
    created: number
    matchedGroups: number
    accountsCreated: number
    exceptions: number
    excludedSourceRows: number
    mappedSourceRows: number
  }
}

/**
 * Normalize email consistently with Better Auth without provider-specific rewriting.
 * @param value Source or target email.
 * @returns Lowercase trimmed email, or null for an empty value.
 */
export function normalizedEmail(value: string | null): string | null {
  return value?.trim().toLowerCase() || null
}

/**
 * Derive stable opaque IDs from a private, per-target offline seed.
 * @param seed Persisted random migration seed.
 * @param key Entity identity within this import.
 * @returns NanoID-length URL-safe identifier without a public legacy ID.
 */
function assignedId(seed: string, key: string): string {
  return createHmac('sha256', seed).update(key).digest('base64url').slice(0, 12)
}

/**
 * Normalize legacy locale spellings into Hype's existing locale vocabulary.
 * @param value Legacy locale.
 * @returns Supported locale, defaulting to English.
 */
function locale(value: string | null): ImportedUser['locale'] {
  const normalized = value?.replaceAll('_', '-').toLowerCase()
  if (['zh', 'zh-hk', 'zh-tw', 'zh-hant'].includes(normalized || '')) return 'zh-hant'
  if (['zh-cn', 'zh-sg', 'zh-hans'].includes(normalized || '')) return 'zh-hans'
  return 'en'
}

/**
 * Parse legacy contact numbers into E.164 using Hong Kong for national numbers.
 * @param value Legacy phone text; international numbers may use + or 00 prefixes.
 * @returns Canonical number or null if empty, impossible in length, unparseable or extension-bearing.
 */
export function normalizeTelephone(value: string | null): string | null {
  if (!value?.trim()) return null
  let input = value.trim()
  if (input.startsWith('00')) input = `+${input.slice(2)}`
  // Legacy users also entered the Hong Kong country code without a plus sign.
  const digits = input.replace(/[\s().-]/g, '')
  if (/^852\d{8}$/.test(digits)) input = `+${digits}`
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: 'HK',
    extract: false,
  })
  return phone?.isPossible() && !phone.ext ? phone.number : null
}

/**
 * Plan user/account inserts while retaining every source identity offline.
 * @param source Legacy users from an immutable local mirror.
 * @param target Read-only destination identity snapshot.
 * @param seed Durable per-target offline seed; never regenerate it between rehearsals.
 * @param decisions Optional reviewed cross-email merges and exclusions; retained in the private manifest.
 * @returns Proposed inserts, crosswalk and explicit unresolved groups; performs no writes.
 * @remarks Existing profiles are never overwritten. Unknown or old Facebook IDs never
 * become Hype provider accounts. No email is marked verified without verification evidence.
 */
export function planUsers(
  source: LegacyUser[],
  target: TargetIdentitySnapshot,
  seed: string,
  decisions?: UserDecisions,
): UserImportPlan {
  const reviewed = parseUserDecisions(
    decisions ?? { version: 1, merges: [], excludeEmails: [] },
  )
  const aliases = new Map(
    reviewed.merges.flatMap(rule =>
      rule.sourceEmails.map(email => [email, rule.targetEmail] as const),
    ),
  )
  const excludedEmails = new Set(reviewed.excludeEmails)
  const canonicalEmail = (email: string | null): string | null => {
    const normalized = normalizedEmail(email)
    return normalized ? (aliases.get(normalized) ?? normalized) : null
  }
  const plan: UserImportPlan = {
    users: [],
    accounts: [],
    mapping: [],
    excluded: [],
    targetChanges: [],
    exceptions: [],
    warnings: [],
    counts: {
      source: source.length,
      created: 0,
      matchedGroups: 0,
      accountsCreated: 0,
      exceptions: 0,
      excludedSourceRows: 0,
      mappedSourceRows: 0,
    },
  }
  const groups = new Map<string, LegacyUser[]>()
  const volunteerGroups = new Map<number, Set<string>>()
  const providerGroups = new Map<string, Set<string>>()
  const targetUsers = new Map(target.users.map(user => [user.id, user]))
  const usedIds = new Set(target.users.map(user => user.id))
  const usedAccountIds = new Set(target.accounts.map(account => account.id))
  const usedUsernames = new Set(
    target.users.flatMap(user => (user.username ? [user.username.toLowerCase()] : [])),
  )

  // Surface existing destination accounts separately; insert-only SQL never deletes or moves them.
  for (const user of target.users) {
    const email = normalizedEmail(user.email)
    if (email && excludedEmails.has(email))
      plan.targetChanges.push({ action: 'exclude', sourceUserId: user.id })
    const targetEmail = email ? aliases.get(email) : undefined
    if (targetEmail)
      plan.targetChanges.push({
        action: 'merge',
        sourceUserId: user.id,
        targetEmail,
        targetUserId:
          target.users.find(
            candidate => normalizedEmail(candidate.email) === targetEmail,
          )?.id ?? null,
      })
  }

  // Group same-email source rows so Facebook-to-Google transitions retain one history owner.
  for (const row of source) {
    if (excludedEmails.has(normalizedEmail(row.email) ?? '')) {
      plan.excluded.push({
        sourceUserId: row.id,
        sourceVolunteerId: row.volunteer_id,
        reason: 'reviewed_exclusion',
      })
      continue
    }
    const key = canonicalEmail(row.email) ?? `source:${row.id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
    if (row.volunteer_id !== null) {
      const keys = volunteerGroups.get(row.volunteer_id) ?? new Set<string>()
      keys.add(key)
      volunteerGroups.set(row.volunteer_id, keys)
    }
    if (/^\d{21}$/.test(row.uid || '')) {
      const keys = providerGroups.get(row.uid!) ?? new Set<string>()
      keys.add(key)
      providerGroups.set(row.uid!, keys)
    }
  }
  for (const [key, unsorted] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = [...unsorted].sort((a, b) => a.id - b.id)
    const sourceUserIds = rows.map(row => row.id)
    const reject = (reason: string): void => {
      plan.exceptions.push({ sourceUserIds, reason })
    }
    const email = canonicalEmail(rows[0].email)
    const mergeRule = reviewed.merges.find(rule => rule.targetEmail === email)
    const allowedSourceTargets = new Set(
      target.users
        .filter(user =>
          mergeRule?.sourceEmails.includes(normalizedEmail(user.email) ?? ''),
        )
        .map(user => user.id),
    )
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      reject('invalid_email')
      continue
    }
    if (
      rows.some(
        row =>
          row.volunteer_id !== null && volunteerGroups.get(row.volunteer_id)!.size > 1,
      )
    ) {
      reject('volunteer_spans_multiple_emails')
      continue
    }
    if (rows.some(row => (providerGroups.get(row.uid || '')?.size ?? 0) > 1)) {
      reject('google_identity_spans_multiple_emails')
      continue
    }
    if (
      rows.some(
        row =>
          row.volunteer_id !== null &&
          plan.excluded.some(
            excluded => excluded.sourceVolunteerId === row.volunteer_id,
          ),
      )
    ) {
      reject('excluded_volunteer_shared_with_retained_user')
      continue
    }
    const googleIds = [
      ...new Set(
        rows
          .map(row => row.uid)
          .filter((uid): uid is string => /^\d{21}$/.test(uid || '')),
      ),
    ]
    const emailMatches = target.users.filter(
      user => email && normalizedEmail(user.email) === email,
    )
    const accountMatches = target.accounts.filter(
      account =>
        account.providerId === 'google' && googleIds.includes(account.accountId),
    )
    if (
      mergeRule &&
      accountMatches.some(
        account =>
          !allowedSourceTargets.has(account.userId) &&
          !emailMatches.some(user => user.id === account.userId),
      )
    ) {
      reject('conflicting_target_identities')
      continue
    }
    const candidates = new Set([
      ...emailMatches.map(user => user.id),
      ...accountMatches
        .filter(account => !allowedSourceTargets.has(account.userId))
        .map(account => account.userId),
    ])
    if (emailMatches.length > 1 || candidates.size > 1) {
      reject('conflicting_target_identities')
      continue
    }
    if (
      mergeRule &&
      !emailMatches.length &&
      !rows.some(row => normalizedEmail(row.email) === email)
    ) {
      reject('reviewed_merge_destination_missing')
      continue
    }
    const matchedId = [...candidates][0]
    const existing = matchedId ? targetUsers.get(matchedId) : undefined
    if (matchedId && !existing) {
      reject('orphan_target_account')
      continue
    }
    if (existing && (existing.isArchived || existing.isAnonymous)) {
      reject('target_archived_or_anonymous')
      continue
    }
    if (
      existing &&
      !existing.emailVerified &&
      !accountMatches.some(account => account.userId === existing.id)
    ) {
      reject('target_email_ownership_unverified')
      continue
    }
    const created = rows.map(row => Date.parse(row.created_at || ''))
    const updated = rows.map(row =>
      Date.parse(row.last_updated_at || row.created_at || ''),
    )
    if (
      [...created, ...updated].some(value => !Number.isFinite(value)) ||
      rows.some((_, i) => updated[i] < created[i])
    ) {
      reject('invalid_source_timestamps')
      continue
    }
    const id = existing?.id ?? assignedId(seed, `user:${key}`)
    let displayUsername = generateRunnerUsernameFromId(id)
    let username = displayUsername.toLowerCase()
    for (
      let attempt = 1;
      !existing && usedUsernames.has(username) && attempt <= 1000;
      attempt++
    ) {
      displayUsername = generateRunnerUsernameFromId(id, attempt)
      username = displayUsername.toLowerCase()
    }
    if (!existing && (usedIds.has(id) || usedUsernames.has(username))) {
      reject('generated_identity_collision')
      continue
    }
    const newAccounts = googleIds
      .filter(uid => !accountMatches.some(account => account.accountId === uid))
      .map(uid => ({
        id: assignedId(seed, `google:${uid}`),
        userId: id,
        providerId: 'google' as const,
        accountId: uid,
        createdAt: Math.min(...created),
        updatedAt: Math.max(...updated),
      }))
    if (newAccounts.some(account => usedAccountIds.has(account.id))) {
      reject('generated_account_collision')
      continue
    }
    if (!existing) {
      // Prefer the most recently updated Google profile, then the latest other profile.
      const profile = [...rows].sort(
        (a, b) =>
          Number(normalizedEmail(b.email) === email) -
            Number(normalizedEmail(a.email) === email) ||
          Number(/^\d{21}$/.test(b.uid || '')) - Number(/^\d{21}$/.test(a.uid || '')) ||
          Date.parse(b.last_updated_at || b.created_at!) -
            Date.parse(a.last_updated_at || a.created_at!) ||
          a.id - b.id,
      )[0]
      const telephone = normalizeTelephone(profile.telephone)
      if (profile.telephone?.trim() && !telephone) {
        plan.warnings.push({ sourceUserIds, reason: 'invalid_phone_requires_review' })
      }
      if (telephone && !parsePhoneNumberFromString(telephone)?.isValid()) {
        plan.warnings.push({
          sourceUserIds,
          reason: 'phone_range_unrecognized_preserved',
        })
      }
      // Breadline auth.py accepts only verified Google emails before db.py creates
      // the user from sub/email. UUID placeholders and old Facebook records do not
      // establish that evidence; neither welcome completion nor runs are proxies.
      const emailVerified = Boolean(
        email &&
          rows.some(
            row =>
              /^\d{21}$/.test(row.uid || '') && normalizedEmail(row.email) === email,
          ),
      )
      plan.users.push({
        id,
        username,
        displayUsername,
        email,
        name: profile.name?.trim() || null,
        telephone,
        locale: locale(profile.locale),
        image: profile.picture?.trim() || null,
        emailVerified: Number(emailVerified),
        isAnonymous: 0,
        isArchived: 0,
        createdAt: Math.min(...created),
        updatedAt: Math.max(...updated),
      })
      usedIds.add(id)
      usedUsernames.add(username)
    } else plan.counts.matchedGroups++
    if (rows.length > 1)
      plan.warnings.push({
        sourceUserIds,
        reason: mergeRule
          ? 'reviewed_cross_email_merge'
          : 'same_email_source_rows_combined',
      })
    if (googleIds.length === 0)
      plan.warnings.push({
        sourceUserIds,
        reason: 'email_claim_required_no_portable_google_identity',
      })
    if (!email)
      plan.warnings.push({ sourceUserIds, reason: 'missing_email_requires_recovery' })
    for (const account of newAccounts) {
      plan.accounts.push(account)
      usedAccountIds.add(account.id)
    }
    for (const row of rows)
      plan.mapping.push({
        sourceUserId: row.id,
        sourceVolunteerId: row.volunteer_id,
        targetUserId: id,
        disposition: existing ? 'match' : 'create',
      })
  }
  for (const change of plan.targetChanges) {
    if (change.action === 'merge' && !change.targetUserId)
      change.targetUserId =
        plan.users.find(user => user.email === change.targetEmail)?.id ?? null
  }
  plan.counts.excludedSourceRows = plan.excluded.length
  plan.counts.created = plan.users.length
  plan.counts.accountsCreated = plan.accounts.length
  plan.counts.exceptions = plan.exceptions.reduce(
    (count, entry) => count + entry.sourceUserIds.length,
    0,
  )
  plan.counts.mappedSourceRows = plan.mapping.length
  return plan
}

/**
 * Render reviewed values as SQL literals, never shell arguments.
 * @param value A supported insert value.
 * @returns Escaped SQLite literal.
 */
function literal(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite SQL value')
    return String(value)
  }
  if (value.includes('\0')) throw new Error('NUL in source field')
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Render proposed inserts for review, requiring fresh target validation before execution.
 * @param plan User mapping plan.
 * @returns SQL containing only normal user/account inserts, without migration metadata.
 * @remarks Never uses INSERT OR IGNORE/REPLACE: conflicts must not silently drop history.
 */
export function userPlanSql(plan: UserImportPlan): string {
  if (plan.targetChanges.length)
    throw new Error(
      'Existing destination accounts require reconciliation before insert SQL can be rendered',
    )
  const statements = [
    '-- REVIEW ONLY: revalidate target identities before applying. Refs #189, #194.',
  ]
  for (const [table, rows] of [
    ['user', plan.users],
    ['account', plan.accounts],
  ] as const) {
    for (const row of rows) {
      const entries = Object.entries(row)
      statements.push(
        `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(', ')}) VALUES (${entries.map(([, value]) => literal(value)).join(', ')});`,
      )
    }
  }
  return statements.join('\n') + '\n'
}
