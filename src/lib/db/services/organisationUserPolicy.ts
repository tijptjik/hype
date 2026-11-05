// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { organisationUserPolicy } from '../schema/organisationUser.js'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'

/**
 * Save user settings inside the organisation form's transaction.
 * @param db Request database.
 * @param organisationId Authorised parent identity.
 * @param policy Submitted settings and observed policy revision.
 * @param guard Parent revision predicate.
 * @returns An assertion and write for the enclosing atomic form batch.
 * @remarks The submitted domain is only an enabled flag; the persisted hub owns its value.
 */
export function prepareOrganisationUserPolicy(
  db: Database,
  organisationId: string,
  policy: OrganisationUserPolicy,
  guard: SQL,
): BatchItem<'sqlite'>[] {
  const emailEnabled = policy.emailDomain !== null
  const domain = sql`(SELECT lower(trim(h.domain)) FROM organisation o JOIN hub h ON h.id=o.hubId WHERE o.id=${organisationId})`
  // Assert policy concurrency and hub eligibility before any part of the form can commit.
  const valid = sql`${guard}
    AND COALESCE((SELECT revision FROM organisationUserPolicy WHERE organisationId=${organisationId}),0)=${policy.revision}
    AND (${Number(!policy.hubSignIn && !emailEnabled)} OR EXISTS(SELECT 1 FROM organisation WHERE id=${organisationId} AND hubId IS NOT NULL))
    AND (${Number(!emailEnabled)} OR length(${domain})>0)`
  const values = {
    organisationId,
    enabled: policy.enabled,
    hubSignIn: policy.hubSignIn,
    emailDomain: emailEnabled ? domain : null,
    contribution: policy.contribution,
    customCard: policy.customCard,
    revision: policy.revision + 1,
  }
  return [
    prepareRevisionCheck(db, valid),
    db.insert(organisationUserPolicy).values(values).onConflictDoUpdate({
      target: organisationUserPolicy.organisationId,
      set: values,
    }),
  ]
}
