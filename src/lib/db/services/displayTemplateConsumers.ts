// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

export type DisplayTemplateConsumer = {
  featureId: string
  revisionId: string
  version: number
  templateVersion: number
  title: string
}

/** Read one bounded page of accepted template consumers in a server-authorized Organisation.
 * @param db Request database. @param input Authorized owner, central identity and keyset cursor.
 * @returns Twenty consumers at most, plus a cursor when another page exists.
 * @remarks Retired identity inputs are excluded; immutable accepted content is the source of template assignments.
 */
export async function readDisplayTemplateConsumers(
  db: Database,
  input: { organisationId: string; templateId: string; after: string | null },
): Promise<{ consumers: DisplayTemplateConsumer[]; next: string | null }> {
  // Fetch one extra row to distinguish a complete page from the end of the consumer set.
  const rows = await db.all<DisplayTemplateConsumer>(sql`
    SELECT f.id featureId,f.currentRevisionId revisionId,f.revisionVersion version,
      json_extract(r.content,'$.profile.nameTemplate.rule.registry.version') templateVersion,
      coalesce((SELECT title FROM featureI18n WHERE featureId=f.id ORDER BY CASE WHEN locale='en' THEN 0 ELSE 1 END,locale LIMIT 1),f.id) title
    FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id
    JOIN displayTemplate t ON t.id=${input.templateId}
    WHERE f.organisationId=${input.organisationId}
      AND (t.organisationId IS NULL OR t.organisationId=f.organisationId)
      AND json_extract(r.content,'$.profile.nameTemplate.rule.registry.id')=t.id
      AND (${input.after} IS NULL OR f.id>${input.after})
      AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=f.id AND i.role='input'
        AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=f.id))
    ORDER BY f.id LIMIT 21`)
  return {
    consumers: rows.slice(0, 20),
    next: rows.length > 20 ? rows[19].featureId : null,
  }
}
