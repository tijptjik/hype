// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { authorizeLayerUpdateForSubmission } from '#lib/api/services/authz/index.js'
// DB
import { probeLayerQuery } from '#lib/db/services/layer.js'
import { getLayerRelocationSettings } from '#lib/db/services/layerLocationPolicy.js'

/**
 * Read relocation settings for an authorized Layer manager.
 * @param input Persisted Layer identity; no client-supplied ancestry is accepted.
 * @returns The override, effective Project default and both policy revisions.
 * @remarks Translators, anonymous users and unrelated managers cannot read private settings.
 */
export const getLayerRelocationPolicy = guardedQuery(
  z.strictObject({ layerId: z.string().min(1) }),
  async (input, ctx) => {
    const probe = await probeLayerQuery(ctx.db, { ref: input.layerId, refKey: 'id' })
    if (!probe) error(404, 'LAYER_NOT_FOUND')
    const decision = authorizeLayerUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: probe,
      submittedData: { relocationUpdatePolicy: true },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    const settings = await getLayerRelocationSettings(ctx.db, probe.id)
    if (!settings) error(404, 'LAYER_NOT_FOUND')
    return settings
  },
)
