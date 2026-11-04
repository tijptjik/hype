// TYPES
import type { D1Database } from '@cloudflare/workers-types'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. SIGN-IN ENROLMENT
// 2. EXPLICIT ONBOARDING

/**
 * Enrol a signed-in durable account from fresh persisted policy and verified email.
 * @param db Authoritative database.
 * @param userId Server-resolved session owner.
 * @param hubId Trusted authentication hub; never a client-submitted hub.
 * @param isCoreHub Trusted core-hub routing flag; core requests need not carry a database ID.
 * @returns Completion after idempotent grant insertion.
 * @remarks INSERT SELECT rechecks policy, account and organisation in the write itself.
 */
export async function enrolOrganisationUserOnSignIn(
  db: D1Database,
  userId: string,
  hubId: string | null,
  isCoreHub = false,
): Promise<void> {
  // Merge only this source grant; the database retains the strongest surviving role.
  await db.batch([
    db
      .prepare(`INSERT INTO organisationRole(organisationId,userId,role,grant)
      SELECT o.id,u.id,'user',json_object('hub:'||o.hubId,'user') FROM organisation o
      JOIN organisationUserPolicy p ON p.organisationId=o.id JOIN user u ON u.id=?
      WHERE p.enabled=1 AND p.hubSignIn=1
        AND (o.hubId=? OR (?=1 AND EXISTS(SELECT 1 FROM hub WHERE id=o.hubId AND code='core'))) AND o.isArchived=0
        AND o.isPublished=1 AND u.isArchived=0 AND u.isAnonymous=0
      ON CONFLICT(organisationId,userId) DO UPDATE SET grant=json_patch(organisationRole.grant,excluded.grant)`)
      .bind(userId, hubId, Number(isCoreHub)),
    db
      .prepare(`INSERT INTO organisationRole(organisationId,userId,role,grant)
      SELECT o.id,u.id,'user',json_object('email:'||lower(trim(h.domain)),'user') FROM organisation o
      JOIN hub h ON h.id=o.hubId
      JOIN organisationUserPolicy p ON p.organisationId=o.id JOIN user u ON u.id=?
      WHERE p.enabled=1 AND o.hubId IS NOT NULL AND p.emailDomain IS NOT NULL
        AND o.isArchived=0 AND o.isPublished=1 AND u.isArchived=0 AND u.isAnonymous=0
        AND u.emailVerified=1 AND instr(trim(u.email),'@')>1
        AND lower(substr(trim(u.email),instr(trim(u.email),'@')+1))=lower(trim(h.domain))
      ON CONFLICT(organisationId,userId) DO UPDATE SET grant=json_patch(organisationRole.grant,excluded.grant)`)
      .bind(userId),
  ])
}

/**
 * Record an explicit organisation onboarding choice for the authenticated user.
 * @param db Authoritative database.
 * @param userId Session owner, never supplied by the caller.
 * @param organisationId Organisation resolved from the displayed feature's project.
 * @param hubId Trusted active hub.
 * @param isCoreHub Trusted core-hub routing flag, independent of a database hub ID.
 * @returns Whether onboarding is available, including an already enrolled user.
 */
export async function enrolOrganisationUserFromCard(
  db: D1Database,
  userId: string,
  organisationId: string,
  hubId: string | null,
  isCoreHub = false,
): Promise<boolean> {
  const result = await db
    .prepare(`INSERT INTO organisationRole(organisationId,userId,role,grant)
    SELECT o.id,u.id,'user',json_object('onboarding','user') FROM organisation o
    JOIN organisationUserPolicy p ON p.organisationId=o.id JOIN user u ON u.id=?
    WHERE o.id=? AND p.enabled=1 AND p.customCard=1 AND o.isArchived=0 AND o.isPublished=1
      AND (o.hubId=? OR (o.isCoreInclusive=1 AND o.isHubExclusive=0 AND ?=1)) AND u.isArchived=0 AND u.isAnonymous=0
    ON CONFLICT(organisationId,userId) DO UPDATE SET grant=json_patch(organisationRole.grant,excluded.grant)
    RETURNING organisationId`)
    .bind(userId, organisationId, hubId, Number(isCoreHub))
    .first()
  return Boolean(result)
}
