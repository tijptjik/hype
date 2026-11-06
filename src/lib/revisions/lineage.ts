/** An exact immutable feature revision inspected or produced by an operation. */
export type FeatureRevisionRef = Readonly<{ featureId: string; revisionId: string }>

/** Ordinary revision merging is distinct from merging or splitting feature identities. */
export type FeatureLineageOperation = Readonly<{
  kind: 'edit' | 'merge' | 'split'
  inputs: readonly FeatureRevisionRef[]
  outputs: readonly FeatureRevisionRef[]
}>

export type FeatureLineageValidation =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Validates the identity shape of a proposed feature operation.
 * @param operation Explicit input and output identities with immutable revision references.
 * @returns Whether its lineage shape is valid, or a reviewable validation reason.
 * @remarks This does not establish authorization, reference existence, redirect-cycle
 * safety or the disposition of dependent records. Persistence must check those and
 * fence every input head in the same transaction that publishes all outputs.
 */
export function validateFeatureLineage(
  operation: FeatureLineageOperation,
): FeatureLineageValidation {
  for (const refs of [operation.inputs, operation.outputs]) {
    if (refs.some(ref => !ref.featureId.trim() || !ref.revisionId.trim())) {
      return { valid: false, reason: 'Feature and revision identifiers are required' }
    }
    if (new Set(refs.map(ref => ref.featureId)).size !== refs.length) {
      return {
        valid: false,
        reason: 'Each feature must appear once per input or output set',
      }
    }
  }
  // A result is new evidence; it cannot reuse an input revision ID under another identity.
  const inputRevisions = new Set(operation.inputs.map(ref => ref.revisionId))
  if (
    inputRevisions.size !== operation.inputs.length ||
    new Set(operation.outputs.map(ref => ref.revisionId)).size !==
      operation.outputs.length ||
    operation.outputs.some(ref => inputRevisions.has(ref.revisionId))
  ) {
    return {
      valid: false,
      reason: 'Input and output revision identifiers must be distinct',
    }
  }
  switch (operation.kind) {
    case 'edit':
      return operation.inputs.length === 1 &&
        operation.outputs.length === 1 &&
        operation.inputs[0].featureId === operation.outputs[0].featureId
        ? { valid: true }
        : { valid: false, reason: 'An edit must retain exactly one feature identity' }
    case 'merge':
      return operation.inputs.length >= 2 &&
        operation.outputs.length === 1 &&
        operation.inputs.some(
          input => input.featureId === operation.outputs[0].featureId,
        )
        ? { valid: true }
        : {
            valid: false,
            reason:
              'A merge requires multiple input features and one surviving input identity',
          }
    case 'split':
      return operation.inputs.length === 1 && operation.outputs.length >= 2
        ? { valid: true }
        : {
            valid: false,
            reason: 'A split requires one input feature and multiple output features',
          }
  }
}

/**
 * Identifies source identities that must retain their historical identity but retire.
 * @param operation Validated identity operation.
 * @returns Source feature IDs absent from the operation's outputs.
 * @remarks Merge retirement may redirect to its sole output. Split retirement must
 * expose all successors rather than choosing an arbitrary redirect destination.
 */
export function retiredFeatureIds(operation: FeatureLineageOperation): string[] {
  const validation = validateFeatureLineage(operation)
  if (!validation.valid) throw new Error(validation.reason)
  const outputs = new Set(operation.outputs.map(ref => ref.featureId))
  return operation.inputs
    .filter(ref => !outputs.has(ref.featureId))
    .map(ref => ref.featureId)
}
