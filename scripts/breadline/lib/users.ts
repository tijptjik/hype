// NODE
import { createHmac } from 'node:crypto'
// LIBRARIES
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import { normalizeTelephone } from '../../../src/lib/utils/telephone'
export { normalizeTelephone } from '../../../src/lib/utils/telephone'
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
  telephone?: string | null
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
  importUsers?: ImportOwnership[]
  identities?: ImportIdentity[]
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
export interface ImportOwnership {
  userId: string
  telephone: string | null
  state: 'unclaimed' | 'claimed'
  claimedEmail: string | null
}
export interface ImportIdentity {
  sourceUserId: number
  sourceVolunteerId: number | null
  userId: string
  email: string | null
  name: string | null
  sourceUid: string | null
}
export interface UserImportPlan {
  model: 'phone-v2'
  importUsers: ImportOwnership[]
  identities: ImportIdentity[]
  users: ImportedUser[]
  accounts: ImportedAccount[]
  phoneUpdates: Array<{ id: string; telephone: string }>
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
 * Plan phone-based users for a reset destination, retaining all source history owners.
 * @param source Legacy users from an immutable local mirror.
 * @param target Read-only destination identity and import-ownership snapshot.
 * @param seed Durable per-target offline seed; retain it across retries.
 * @param decisions Reviewed exclusions and merges, which must agree with phone grouping.
 * @returns Proposed inserts, private provenance and explicit unresolved groups; no writes.
 * @remarks Single-email/name identities are auto-claimed without inventing email verification.
 * Missing/invalid phones fall back to exact or reviewed email identities with a null phone.
 * Ambiguous identities have no primary email, name or credential. Existing non-imported
 * users are never merged or modified; this importer targets a fresh database.
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
  const excludedEmails = new Set(reviewed.excludeEmails)
  const plan: UserImportPlan = {
    model: 'phone-v2',
    users: [],
    accounts: [],
    importUsers: [],
    identities: [],
    phoneUpdates: [],
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
  const emailPhones = new Map<string, Set<string>>()
  const volunteerPhones = new Map<number, Set<string>>()
  const providerPhones = new Map<string, Set<string>>()
  const sourceIds = new Set<number>()
  const reviewedAliases = new Map(
    reviewed.merges.flatMap(rule =>
      rule.sourceEmails.map(email => [email, rule.targetEmail] as const),
    ),
  )
  const telephoneOverrides = new Map(
    reviewed.telephoneOverrides?.map(rule => [rule.sourceUserId, rule]),
  )
  const reviewedNullPhones = new Set<number>()
  // Apply only explicitly reviewed source corrections; a changed source value needs renewed review.
  const effectiveSource = source.map(row => {
    const correction = telephoneOverrides.get(row.id)
    if (!correction) return row
    if (
      row.telephone?.replace(/\s/g, '') !==
      correction.expectedTelephone.replace(/\s/g, '')
    )
      throw new Error('Reviewed telephone source changed')
    if (correction.telephone === null) reviewedNullPhones.add(row.id)
    plan.warnings.push({
      sourceUserIds: [row.id],
      reason:
        correction.telephone === null
          ? 'reviewed_phone_cleared_requires_completion'
          : 'reviewed_phone_corrected',
    })
    return { ...row, telephone: correction.telephone }
  })
  const knownPhonesByIdentity = new Map<string, Set<string>>()
  // Missing contacts do not constitute another phone; borrow only one unambiguous identity phone.
  for (const row of effectiveSource) {
    const email = normalizedEmail(row.email)
    if (!email || excludedEmails.has(email)) continue
    const phone = normalizeTelephone(row.telephone)
    if (!phone) continue
    const identity = reviewedAliases.get(email) ?? email
    const phones = knownPhonesByIdentity.get(identity) ?? new Set<string>()
    phones.add(phone)
    knownPhonesByIdentity.set(identity, phones)
  }
  // Preserve exclusions; retain users without a usable phone through their email identity.
  for (const row of effectiveSource) {
    if (sourceIds.has(row.id)) throw new Error('Duplicate source user ID')
    sourceIds.add(row.id)
    if (excludedEmails.has(normalizedEmail(row.email) ?? '')) {
      plan.excluded.push({
        sourceUserId: row.id,
        sourceVolunteerId: row.volunteer_id,
        reason: 'reviewed_exclusion',
      })
      continue
    }
    let phone = normalizeTelephone(row.telephone)
    const email = normalizedEmail(row.email)
    if (!phone && email && !reviewedNullPhones.has(row.id)) {
      const known = knownPhonesByIdentity.get(reviewedAliases.get(email) ?? email)
      if (known?.size === 1) {
        phone = [...known][0]
        plan.warnings.push({
          sourceUserIds: [row.id],
          reason: row.telephone?.trim()
            ? 'invalid_phone_from_unambiguous_identity'
            : 'missing_phone_from_unambiguous_identity',
        })
      }
    }
    const key =
      phone ??
      (email ? `email:${reviewedAliases.get(email) ?? email}` : `invalid:${row.id}`)
    if (!phone)
      plan.warnings.push({
        sourceUserIds: [row.id],
        reason: row.telephone?.trim()
          ? 'invalid_phone_requires_completion'
          : 'missing_phone_requires_completion',
      })
    groups.set(key, [...(groups.get(key) ?? []), row])
    if (email) {
      const phones = emailPhones.get(email) ?? new Set<string>()
      phones.add(key)
      emailPhones.set(email, phones)
    }
    if (row.volunteer_id !== null) {
      const phones = volunteerPhones.get(row.volunteer_id) ?? new Set<string>()
      phones.add(key)
      volunteerPhones.set(row.volunteer_id, phones)
    }
    if (row.uid && /^\d{21}$/.test(row.uid)) {
      const phones = providerPhones.get(row.uid) ?? new Set<string>()
      phones.add(key)
      providerPhones.set(row.uid, phones)
    }
  }
  const conflictingReviewedEmails = new Set<string>()
  // Explicit old email merges cannot override the new one-phone identity boundary.
  for (const rule of reviewed.merges) {
    const emails = [rule.targetEmail, ...rule.sourceEmails]
    const phones = new Set(emails.flatMap(email => [...(emailPhones.get(email) ?? [])]))
    if (phones.size > 1)
      for (const email of emails) conflictingReviewedEmails.add(email)
  }
  const usedIds = new Set(target.users.map(user => user.id))
  const usedAccountIds = new Set(target.accounts.map(account => account.id))
  const usedUsernames = new Set(
    target.users.flatMap(user => (user.username ? [user.username.toLowerCase()] : [])),
  )
  // Index destination evidence once; repeat planning must not parse every target phone per group.
  const targetUsers = new Map(target.users.map(user => [user.id, user]))
  const ownershipByUser = new Map(
    target.importUsers?.map(owner => [owner.userId, owner]),
  )
  const phoneOwners = new Map<string, Set<string>>()
  const emailOwners = new Map<string, Set<string>>()
  for (const user of target.users) {
    for (const [owners, key] of [
      [phoneOwners, normalizeTelephone(user.telephone ?? null)],
      [emailOwners, normalizedEmail(user.email)],
    ] as const) {
      if (!key) continue
      const ids = owners.get(key) ?? new Set<string>()
      ids.add(user.id)
      owners.set(key, ids)
    }
  }
  const googleOwners = new Map<string, Set<string>>()
  for (const account of target.accounts) {
    if (account.providerId !== 'google') continue
    const ids = googleOwners.get(account.accountId) ?? new Set<string>()
    ids.add(account.userId)
    googleOwners.set(account.accountId, ids)
  }
  const identitiesByUser = new Map<string, ImportIdentity[]>()
  const priorOwnerBySourceId = new Map(
    target.identities?.map(identity => [identity.sourceUserId, identity.userId]),
  )
  const priorSourceIds = new Set(
    target.identities?.map(identity => identity.sourceUserId),
  )
  for (const identity of target.identities ?? []) {
    const identities = identitiesByUser.get(identity.userId) ?? []
    identities.push(identity)
    identitiesByUser.set(identity.userId, identities)
  }
  for (const [groupKey, unsorted] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const phone = groupKey.startsWith('+') ? groupKey : null
    const rows = [...unsorted].sort((a, b) => a.id - b.id)
    const sourceUserIds = rows.map(row => row.id)
    const reject = (reason: string): void => {
      plan.exceptions.push({ sourceUserIds, reason })
    }
    const emails = [
      ...new Set(
        rows
          .map(row => normalizedEmail(row.email))
          .filter((email): email is string => email !== null),
      ),
    ]
    const names = [
      ...new Set(
        rows
          .map(row => row.name?.trim() || null)
          .filter((name): name is string => name !== null),
      ),
    ]
    if (groupKey.startsWith('invalid:')) {
      reject('missing_or_invalid_phone_requires_review')
      continue
    }
    if (emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      reject('invalid_email')
      continue
    }
    if (emails.some(email => conflictingReviewedEmails.has(email))) {
      reject('reviewed_merge_spans_multiple_phones')
      continue
    }
    if (emails.some(email => (emailPhones.get(email)?.size ?? 0) > 1)) {
      reject('email_spans_multiple_phones')
      continue
    }
    if (
      rows.some(
        row =>
          row.volunteer_id !== null &&
          (volunteerPhones.get(row.volunteer_id)?.size ?? 0) > 1,
      )
    ) {
      reject('volunteer_spans_multiple_phones')
      continue
    }
    if (rows.some(row => (providerPhones.get(row.uid ?? '')?.size ?? 0) > 1)) {
      reject('google_identity_spans_multiple_phones')
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
    // A repaired phone-less cohort keeps its persisted history owner; exact crosswalk equality is checked below.
    const persistedOwners = new Set(
      rows.flatMap(row => {
        const owner = priorOwnerBySourceId.get(row.id)
        return owner ? [owner] : []
      }),
    )
    const id =
      !phone && persistedOwners.size === 1
        ? [...persistedOwners][0]
        : assignedId(
            seed,
            phone ? `phone-user:${phone}` : `email-user:${groupKey.slice(6)}`,
          )
    const existing = targetUsers.get(id)
    const ownership = ownershipByUser.get(id)
    // Only our persisted phone ownership record establishes a repeat import, not an email match.
    if (existing && (!ownership || ownership.telephone !== phone)) {
      reject('target_requires_fresh_database')
      continue
    }
    if (!existing && ownership) {
      reject('orphan_import_ownership')
      continue
    }
    if (existing && (existing.isArchived || existing.isAnonymous)) {
      reject('target_archived_or_anonymous')
      continue
    }
    const googleIds = [
      ...new Set(
        rows
          .map(row => row.uid)
          .filter((uid): uid is string => /^\d{21}$/.test(uid || '')),
      ),
    ]
    if (
      [...(phoneOwners.get(phone) ?? [])].some(owner => owner !== id) ||
      emails.some(email =>
        [...(emailOwners.get(email) ?? [])].some(owner => owner !== id),
      ) ||
      googleIds.some(uid =>
        [...(googleOwners.get(uid) ?? [])].some(owner => owner !== id),
      )
    ) {
      reject('conflicting_target_identities')
      continue
    }
    // A changed source cohort must be reviewed, never reopen ownership or add losing credentials.
    const identities: ImportIdentity[] = rows.map(row => ({
      sourceUserId: row.id,
      sourceVolunteerId: row.volunteer_id,
      userId: id,
      email: normalizedEmail(row.email),
      name: row.name?.trim() || null,
      sourceUid: row.uid,
    }))
    if (existing) {
      const prior = [...(identitiesByUser.get(id) ?? [])].sort(
        (a, b) => a.sourceUserId - b.sourceUserId,
      )
      if (
        JSON.stringify(
          prior.map(identity => [
            identity.sourceUserId,
            identity.sourceVolunteerId,
            identity.email,
            identity.name,
            identity.sourceUid,
          ]),
        ) !==
        JSON.stringify(
          identities.map(identity => [
            identity.sourceUserId,
            identity.sourceVolunteerId,
            identity.email,
            identity.name,
            identity.sourceUid,
          ]),
        )
      ) {
        reject('import_source_identity_changed')
        continue
      }
      plan.counts.matchedGroups++
    } else {
      const claimed = emails.length === 1 && names.length <= 1
      const email = claimed ? emails[0] : null
      let displayUsername = generateRunnerUsernameFromId(id)
      let username = displayUsername.toLowerCase()
      for (let attempt = 1; usedUsernames.has(username) && attempt <= 1000; attempt++) {
        displayUsername = generateRunnerUsernameFromId(id, attempt)
        username = displayUsername.toLowerCase()
      }
      if (usedIds.has(id) || usedUsernames.has(username)) {
        reject('generated_identity_collision')
        continue
      }
      const newAccounts: ImportedAccount[] = claimed
        ? googleIds.map(uid => ({
            id: assignedId(seed, `google:${uid}`),
            userId: id,
            providerId: 'google',
            accountId: uid,
            createdAt: Math.min(...created),
            updatedAt: Math.max(...updated),
          }))
        : []
      if (newAccounts.some(account => usedAccountIds.has(account.id))) {
        reject('generated_account_collision')
        continue
      }
      if (identities.some(identity => priorSourceIds.has(identity.sourceUserId))) {
        reject('source_identity_already_imported')
        continue
      }
      // Prefer the most recently updated Google profile, then the latest other profile.
      const profile = [...rows].sort(
        (a, b) =>
          Number(/^\d{21}$/.test(b.uid || '')) - Number(/^\d{21}$/.test(a.uid || '')) ||
          Date.parse(b.last_updated_at || b.created_at || '') -
            Date.parse(a.last_updated_at || a.created_at || '') ||
          a.id - b.id,
      )[0]
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
        name: claimed ? (names[0] ?? null) : null,
        telephone: phone,
        locale: locale(profile.locale),
        image: claimed ? profile.picture?.trim() || null : null,
        emailVerified: Number(emailVerified),
        isAnonymous: 0,
        isArchived: 0,
        createdAt: Math.min(...created),
        updatedAt: Math.max(...updated),
      })
      plan.importUsers.push({
        userId: id,
        telephone: phone,
        state: claimed ? 'claimed' : 'unclaimed',
        claimedEmail: email,
      })
      plan.identities.push(...identities)
      plan.accounts.push(...newAccounts)
      usedIds.add(id)
      usedUsernames.add(username)
      for (const account of newAccounts) usedAccountIds.add(account.id)
      if (claimed && !googleIds.length)
        plan.warnings.push({
          sourceUserIds,
          reason: 'auto_claimed_without_portable_google_identity',
        })
    }
    // Allocation metadata warnings do not override the structural phone policy.
    if (phone && !parsePhoneNumberFromString(phone)?.isValid())
      plan.warnings.push({
        sourceUserIds,
        reason: 'phone_range_unrecognized_preserved',
      })
    if (rows.length > 1)
      plan.warnings.push({
        sourceUserIds,
        reason: phone
          ? 'same_phone_source_rows_combined'
          : 'same_email_source_rows_combined',
      })
    for (const row of rows)
      plan.mapping.push({
        sourceUserId: row.id,
        sourceVolunteerId: row.volunteer_id,
        targetUserId: id,
        disposition: existing ? 'match' : 'create',
      })
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
 * @returns User/account, ownership and source-crosswalk inserts for the current schema.
 * @remarks Never uses INSERT OR IGNORE/REPLACE: conflicts must not silently drop history.
 */
export function userPlanSql(plan: UserImportPlan): string {
  if (plan.model !== 'phone-v2')
    throw new Error('Regenerate the legacy email-based plan')
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
    ['breadlineImportUser', plan.importUsers],
    ['breadlineImportIdentity', plan.identities],
  ] as const) {
    for (const row of rows) {
      const entries = Object.entries(row)
      statements.push(
        `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(', ')}) VALUES (${entries.map(([, value]) => literal(value)).join(', ')});`,
      )
    }
  }
  for (const update of plan.phoneUpdates) {
    statements.push(
      `UPDATE "user" SET "telephone" = ${literal(update.telephone)} WHERE "id" = ${literal(update.id)} AND ("telephone" IS NULL OR trim("telephone") = '');`,
    )
  }
  return `${statements.join('\n')}\n`
}
