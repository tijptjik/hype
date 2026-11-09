// API
import {
  getFeatureLocation,
  getFeatureLocationCandidate,
  importFeatureLocationCandidate,
  linkFeatureLocation,
  relinkFeatureLocation,
} from '#lib/api/location.remote.js'

/** Resolve a pinned discovery identity and link it to a successfully saved Feature.
 * @param input Persisted Feature timestamp and the explicitly accepted source identity.
 * @returns Completion after linking, or an already completed matching association.
 * @remarks Retries never replace another association. Remote commands authorize against
 * persisted scope and preserve the existing name/address adoption policy.
 */
export async function linkDraftPlace(input: {
  featureId: string
  replacementRevision?: string
  replacementLocationId?: string
  nameMode?: 'independent' | 'inherit'
  modifiedAt: string
  ssId: string
  resourceReleaseId: string
}): Promise<void> {
  const query = getFeatureLocation({ featureId: input.featureId })
  await query.refresh()
  const existing = await query
  const candidateInput = {
    featureId: input.featureId,
    ssId: input.ssId,
    resourceReleaseId: input.resourceReleaseId,
  }
  let candidate = await getFeatureLocationCandidate(candidateInput)
  if (candidate.status === 'source-import-needed')
    candidate = await importFeatureLocationCandidate(candidateInput)
  if (candidate.status !== 'ready') throw new Error('Place is unavailable')
  if (existing) {
    if (existing.locationId === candidate.locationId) return
    if (
      !input.replacementRevision &&
      existing.locationId === input.replacementLocationId
    )
      input = { ...input, replacementRevision: existing.version }
    if (!input.replacementRevision || existing.version !== input.replacementRevision)
      throw new Error('Feature already has a different place')
  }
  const link = {
    featureId: input.featureId,
    locationId: candidate.locationId,
    revisionId: candidate.revisionId,
    expectedFeatureModifiedAt: input.modifiedAt,
    ...(input.nameMode ? { nameMode: input.nameMode } : {}),
  }
  if (existing && input.replacementRevision) {
    await relinkFeatureLocation({
      ...link,
      expectedRevision: input.replacementRevision,
    })
  } else await linkFeatureLocation(link)
  await query.refresh()
}
