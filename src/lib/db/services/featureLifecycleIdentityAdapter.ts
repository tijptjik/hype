// DOMAIN
import { FeatureIdentitySelectionSchema } from '#lib/revisions/featureIdentityPlan.js'
// SERVICES
import {
  inspectFeatureIdentitySource,
  buildSelectedFeatureIdentityContent,
} from './featureIdentityProposal'
import {
  splitLifecycleFeature,
  mergeLifecycleFeatures,
} from './featureLifecycleIdentity'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { IdentityCommand } from './featureIdentityProposal'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'

/** Apply the existing split/merge dialog's selectors directly to the accepted lifecycle.
 * @param db Request database. @param input All-source authority, exact inspected tokens and optional duplicate-task completion.
 * @returns Operation receipt and regular-editor targets, or null for stale inspection.
 * @remarks Preparation is entirely in memory; no identity proposal or reserved child rows are stored.
 */
export async function applyCurrentFeatureIdentitySelection(
  db: Database,
  input: IdentityCommand & {
    selection: FeatureIdentitySelection
    completion?: (revisionId: string) => BatchItem<'sqlite'>[]
  },
): Promise<{ receipt: string; outputs: string[] } | null> {
  const selection = FeatureIdentitySelectionSchema.parse(input.selection)
  const sources = new Map<
    string,
    Awaited<ReturnType<typeof inspectFeatureIdentitySource>>
  >()
  for (const ref of selection.inputs) {
    if (sources.has(ref.featureId)) throw new Error('Duplicate input Feature')
    const source = await inspectFeatureIdentitySource(db, {
      ...input,
      featureId: ref.featureId,
    })
    if (source.revisionId !== ref.revisionId || source.generation !== ref.generation)
      return null
    sources.set(ref.featureId, source)
  }
  const first = selection.inputs[0],
    primary = sources.get(first.featureId)!
  if (
    [...sources.values()].some(source =>
      ['organisationId', 'projectId', 'layerId'].some(
        field => source.record[field] !== primary.record[field],
      ),
    )
  )
    throw new Error('Identity operations require Features in the same layer')
  const command = {
    ...input,
    featureId: first.featureId,
    expectedRevisionId: first.revisionId,
    expectedVersion: first.generation,
    reason: selection.reason,
    validate: () => [],
  }
  if (selection.kind === 'split') {
    if (
      selection.inputs.length !== 1 ||
      selection.outputs.length !== 2 ||
      selection.outputs.some(
        output =>
          output.featureId !== null || output.sourceFeatureId !== first.featureId,
      )
    )
      throw new Error('A split requires one source and two new Features')
    const locale = Object.keys(selection.outputs[0].titles ?? {})[0]
    if (
      !locale ||
      selection.outputs.some(
        output =>
          Object.keys(output.titles ?? {}).length !== 1 ||
          !output.titles?.[locale]?.trim() ||
          Object.keys(output).some(
            key => !['featureId', 'sourceFeatureId', 'titles'].includes(key),
          ),
      )
    )
      throw new Error(
        'Name the two successors here, then edit their copied records in the regular editors',
      )
    if (
      selection.redirectOutputIndex != null &&
      selection.redirectOutputIndex !== 0 &&
      selection.redirectOutputIndex !== 1
    )
      throw new Error('Choose one of the two successors')
    const result = await splitLifecycleFeature(db, {
      ...command,
      titles: [
        selection.outputs[0].titles![locale],
        selection.outputs[1].titles![locale],
      ],
      locale,
      redirectIndex: selection.redirectOutputIndex ?? null,
    })
    return result ? { receipt: result.operationId, outputs: result.featureIds } : null
  }
  if (
    selection.inputs.length !== 2 ||
    selection.outputs.length !== 1 ||
    selection.outputs[0].featureId !== first.featureId
  )
    throw new Error('A merge requires one primary Feature and one candidate')
  const second = selection.inputs[1]
  const content = await buildSelectedFeatureIdentityContent(db, {
    kind: 'merge',
    output: selection.outputs[0],
    featureId: first.featureId,
    sources,
    allowedInternalIds: input.allowedInternalIds,
    layerId: String(primary.record.layerId),
  })
  const receipt = await mergeLifecycleFeatures(db, {
    ...command,
    attachmentGuard: input.guard,
    derive: () => content,
    completion: input.completion,
    secondary: {
      featureId: second.featureId,
      expectedRevisionId: second.revisionId,
      expectedVersion: second.generation,
      guard: input.guard,
    },
  })
  return receipt ? { receipt, outputs: [first.featureId] } : null
}
