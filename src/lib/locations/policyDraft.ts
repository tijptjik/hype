// VALIDATION
import { z } from 'zod'
// DOMAIN
import { equalLocationValue } from './baseline'
import { RelocationPolicySchema } from './model'
// TYPES
import type { ProjectLocationPolicy, RelocationPolicy } from './model'

type Settings = { policy: ProjectLocationPolicy; revision: number }
const draftSchema = z.strictObject({
  policy: z.record(z.string(), z.unknown()),
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
})

/**
 * Read an internal form draft while retaining temporarily incomplete field values.
 * @param staged JSON hidden-field draft from the owning Project form.
 * @returns Its envelope, or null when no valid draft envelope is staged.
 * @remarks This validates transport only; server policy validation remains authoritative.
 */
function readDraft(staged: string | undefined): z.infer<typeof draftSchema> | null {
  if (!staged) return null
  try {
    const result = draftSchema.safeParse(JSON.parse(staged))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Read the staged relocation choice without validating unrelated unfinished controls.
 * @param initial Last committed Project settings.
 * @param staged Current hidden-field draft.
 * @returns Staged relocation consent, or the committed default.
 */
export function stagedProjectRelocationPolicy(
  initial: Settings,
  staged: string | undefined,
): RelocationPolicy {
  const parsed = RelocationPolicySchema.safeParse(readDraft(staged)?.policy.relocation)
  return parsed.success ? parsed.data : initial.policy.relocation
}

/**
 * Merge a section's staged fields without erasing another section or rebasing a stale head.
 * @param initial Last committed Project settings.
 * @param staged Current hidden-field draft from either policy section.
 * @param patch Fields edited by this section, including unfinished form values.
 * @returns The complete staged transport, or undefined when no changes remain.
 * @remarks Incomplete distance fields are preserved for normal server validation on submit.
 */
export function stageProjectPolicyDraft(
  initial: Settings,
  staged: string | undefined,
  patch: Record<string, unknown>,
): string | undefined {
  const current = readDraft(staged)
  const policy = { ...(current?.policy ?? initial.policy), ...patch }
  const persistedPolicy: unknown = JSON.parse(JSON.stringify(policy))
  const expectedRevision = current?.expectedRevision ?? initial.revision
  // Preserve the original fence even if a query refreshes while another section is dirty.
  return expectedRevision === initial.revision &&
    equalLocationValue(persistedPolicy, initial.policy)
    ? undefined
    : JSON.stringify({ policy: persistedPolicy, expectedRevision })
}
