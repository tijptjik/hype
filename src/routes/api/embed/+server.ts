// FRAMEWORK
import { error, json } from '@sveltejs/kit'
// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
import { parseEmbedConfig } from '#lib/embed/config.js'
import { readEmbed } from '#lib/embed/server.js'
// TYPES
import type { RequestHandler } from './$types'

/** Returns public, scoped map data without creating or requiring a session.
 * @param event Current URL, database and hub. @returns A bounded public feature page.
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
  let config: ReturnType<typeof parseEmbedConfig>
  try {
    config = parseEmbedConfig(url.searchParams)
  } catch (reason) {
    throw error(400, String(reason))
  }
  const { db } = await getDatabaseWithoutAuth(locals.platform ?? platform)
  return json(
    await readEmbed(
      db,
      config,
      locals.hub,
      url.searchParams.get('cursor') ?? undefined,
    ),
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
