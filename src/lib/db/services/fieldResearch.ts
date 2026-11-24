// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, getTableColumns } from 'drizzle-orm'
// SCHEMA
import { fieldResearchSession as sessions } from '../schema/fieldResearch'
// TYPES
import type { Database } from '#lib/types.js'
import type { ResearchSession } from '#lib/fieldResearch/model.js'

// Older configuration payloads must only be decoded by a compatible reader.
const { configuration: _configuration, ...metadata } = getTableColumns(sessions)
export const researchSessionMetadata = metadata

/** Read a retained private session after the caller has checked owning-project management access.
 * @param db Request database. @param id Session identity.
 * @returns Session or a not-found error.
 */
export async function readResearchSession(
  db: Database,
  id: string,
): Promise<ResearchSession> {
  const session = await db
    .select(metadata)
    .from(sessions)
    .where(eq(sessions.id, id))
    .get()
  if (!session) error(404, 'Field research session not found')
  return session
}
