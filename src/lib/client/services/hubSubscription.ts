// API
import {
  dismissSubscriptionPrompt as dismissSubscriptionPromptRemote,
  joinSubscription as joinSubscriptionRemote,
} from '$lib/api/server/hub.remote'
// TYPES
import type {
  DismissHubSubscriptionPromptInput,
  JoinHubSubscriptionInput,
} from '$lib/db/zod/schema/hub.types'

/**
 * Persist dismissal of the current hub subscription prompt.
 *
 * @param input - Hub id payload for the dismissal command.
 * @returns Remote command response containing dismissal state.
 */
export async function dismissHubSubscriptionPrompt(
  input: DismissHubSubscriptionPromptInput,
): Promise<Awaited<ReturnType<typeof dismissSubscriptionPromptRemote>>> {
  return await dismissSubscriptionPromptRemote(input)
}

/**
 * Attempt newsletter subscription for the active hub.
 *
 * @param input - Hub id and terms-acceptance payload.
 * @returns Remote command response containing membership state.
 */
export async function joinHubSubscription(
  input: JoinHubSubscriptionInput,
): Promise<Awaited<ReturnType<typeof joinSubscriptionRemote>>> {
  return await joinSubscriptionRemote(input)
}
