// SVELTE
import { onMount } from 'svelte'
// API
import {
  checkUserMessagingIdentity,
  getMessagingAccounts,
  getMessagingOrganisations,
  getUserMessagingSettings,
  setUserMessagingIdentity,
  setUserMessagingPreference,
  verifyUserMessagingIdentity,
} from '#lib/api/messaging.remote.js'
// MESSAGING
import {
  displayMessagingContact,
  parseMessagingContact,
  shouldValidateMessagingContact,
} from '#lib/messaging/contactInput.js'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'

type MessagingSettings = Awaited<ReturnType<typeof getUserMessagingSettings>>
type Identity = MessagingSettings['identities'][number]
type ContactState =
  | { kind: 'empty' | 'waiting' | 'checking' | 'confirmed'; message: string }
  | { kind: 'warning'; message: string; invalid: boolean }
interface UserMessagingSettingsModel {
  readonly settings: MessagingSettings
  readonly inputs: Record<MessagingPlatform, string>
  readonly states: Record<MessagingPlatform, ContactState>
  readonly accounts: { id: string; platform: MessagingPlatform; organisation: string }[]
  readonly busy: boolean
  readonly loading: boolean
  readonly error: string
  isDirty: (platform: MessagingPlatform) => boolean
  updateContact: (platform: MessagingPlatform, value: string) => void
  blurContact: (platform: MessagingPlatform) => void
  retry: (platform: MessagingPlatform) => void
  setPreference: (platform: MessagingPlatform | null) => Promise<void>
  verify: (accountId: string, platform: MessagingPlatform) => Promise<void>
}

/** Edit private recipient preferences separately from organisation account registration.
 * @param userId Target user, or undefined for the current account.
 * @param canVerify Whether the UI should offer global-admin verification controls.
 * @returns Reactive contact fields, debounced saves and server-authorized actions.
 * @remarks Provider confirmation never grants ownership verification. Each field
 * serializes its writes and ignores obsolete results without blocking typing.
 */
export function useUserMessagingSettingsModel(
  userId?: string,
  canVerify = false,
): UserMessagingSettingsModel {
  const platforms = ['whatsapp', 'telegram'] as const
  let settings = $state<MessagingSettings>({
    platform: 'whatsapp',
    preferredPlatform: null,
    identities: [],
  })
  let inputs = $state<Record<MessagingPlatform, string>>({ whatsapp: '', telegram: '' })
  let states = $state<Record<MessagingPlatform, ContactState>>({
    whatsapp: { kind: 'empty', message: '' },
    telegram: { kind: 'empty', message: '' },
  })
  let accounts = $state<
    { id: string; platform: MessagingPlatform; organisation: string }[]
  >([])
  let pending = $state<Record<MessagingPlatform, boolean>>({
    whatsapp: false,
    telegram: false,
  })
  let actionBusy = $state(false)
  let loading = $state(true)
  let failure = $state('')
  let active = false
  const revisions = { whatsapp: 0, telegram: 0 }
  const timers: Partial<Record<MessagingPlatform, ReturnType<typeof setTimeout>>> = {}
  const writes: Record<MessagingPlatform, Promise<void>> = {
    whatsapp: Promise.resolve(),
    telegram: Promise.resolve(),
  }
  let reading: Promise<void> = Promise.resolve()

  /** Refresh the shared remote query serially so parallel saves cannot reuse an older in-flight read.
   * @returns Saved settings, including the claim revision.
   */
  function readSettings(): Promise<MessagingSettings> {
    const next = reading.then(async () => {
      const query = getUserMessagingSettings({ userId })
      await query.refresh()
      return await query
    })
    reading = next.then(
      () => {},
      () => {},
    )
    return next
  }

  /** Merge one authoritative claim without replacing another field's draft or newer response.
   * @param platform Platform refreshed after saving.
   * @param value Latest server settings.
   * @returns The saved identity, if it still exists.
   */
  function mergeIdentity(
    platform: MessagingPlatform,
    value: MessagingSettings,
  ): Identity | undefined {
    const identity = value.identities.find(row => row.platform === platform)
    settings.identities = [
      ...settings.identities.filter(row => row.platform !== platform),
      ...(identity ? [identity] : []),
    ]
    return identity
  }

  /** Compare editable values to the saved claim before offering ownership verification.
   * @param platform Platform being edited.
   * @returns Whether there are unsaved identifier changes.
   */
  function isDirty(platform: MessagingPlatform): boolean {
    const saved = settings.identities.find(row => row.platform === platform)
    if (inputs[platform].trim() === displayMessagingContact(saved)) return false
    const parsed = parseMessagingContact(inputs[platform])
    if (parsed.kind === 'empty') return Boolean(saved)
    if (parsed.kind === 'invalid' || !saved) return true
    return parsed.identity.phoneNumber
      ? parsed.identity.phoneNumber !== saved.phoneNumber
      : parsed.identity.username !== saved.username
  }

  /** Confirm only the exact saved revision while retaining independent ownership controls.
   * @param platform Platform being checked.
   * @param revision Editor revision that requested the lookup.
   * @returns Nothing; obsolete results are discarded.
   */
  async function checkIdentity(
    platform: MessagingPlatform,
    revision: number,
  ): Promise<void> {
    const identity = settings.identities.find(row => row.platform === platform)
    if (!identity || !active || revisions[platform] !== revision) return
    states[platform] = { kind: 'checking', message: 'Checking account…' }
    try {
      const result = await checkUserMessagingIdentity({
        userId,
        platform,
        expectedUpdatedAt: identity.updatedAt,
      })
      if (
        !active ||
        revisions[platform] !== revision ||
        settings.identities.find(row => row.platform === platform)?.updatedAt !==
          identity.updatedAt
      )
        return
      states[platform] =
        result.status === 'confirmed'
          ? { kind: 'confirmed', message: result.message }
          : {
              kind: 'warning',
              message: result.message,
              invalid: result.status === 'not-found',
            }
    } catch {
      if (active && revisions[platform] === revision)
        states[platform] = {
          kind: 'warning',
          message: 'Saved. Account confirmation failed. Select to try again.',
          invalid: false,
        }
    }
  }

  /** Retain form values on failure and reload authoritative verification after success.
   * @param platform Platform whose draft has stopped changing.
   * @param revision Editor revision captured after the debounce.
   * @returns Nothing; writes for each platform are serialized by the caller.
   */
  async function saveContact(
    platform: MessagingPlatform,
    revision: number,
  ): Promise<void> {
    if (!active || revisions[platform] !== revision) return
    const parsed = parseMessagingContact(inputs[platform])
    if (parsed.kind === 'invalid') {
      states[platform] = { kind: 'warning', message: parsed.message, invalid: true }
      return
    }
    pending[platform] = true
    states[platform] = { kind: 'checking', message: 'Saving contact…' }
    try {
      if (isDirty(platform)) {
        await setUserMessagingIdentity({
          userId,
          platform,
          identity: parsed.kind === 'empty' ? null : parsed.identity,
        })
        if (!active) return
        const value = await readSettings()
        if (!active) return
        mergeIdentity(platform, value)
      }
      // Typing remains enabled during a request; never replace text or status from a newer edit.
      if (revisions[platform] !== revision || !active) return
      if (parsed.kind === 'empty') {
        states[platform] = { kind: 'empty', message: '' }
        return
      }
      inputs[platform] = parsed.value
      // Provider latency must not hold up the next debounced save for this field.
      void checkIdentity(platform, revision)
    } catch (cause) {
      if (active && revisions[platform] === revision)
        states[platform] = {
          kind: 'warning',
          message:
            cause instanceof Error
              ? cause.message
              : 'Unable to save. Select to try again.',
          invalid: false,
        }
    } finally {
      pending[platform] = false
    }
  }

  /** Queue a field after typing stops, without permitting older writes to finish last.
   * @param platform Field being saved.
   * @param revision Editor revision to process.
   * @returns Nothing.
   */
  function queueSave(platform: MessagingPlatform, revision: number): void {
    writes[platform] = writes[platform].then(() => saveContact(platform, revision))
  }

  /** Replace one draft and debounce validation after its minimum typing threshold.
   * @param platform Platform being edited.
   * @param value Current text, including incomplete input.
   * @returns Nothing; short drafts stay quiet and eligible drafts wait 400 milliseconds.
   */
  function updateContact(platform: MessagingPlatform, value: string): void {
    inputs[platform] = value
    clearTimeout(timers[platform])
    const revision = ++revisions[platform]
    const ready = shouldValidateMessagingContact(value)
    states[platform] = {
      kind: 'waiting',
      message: ready ? 'Waiting for typing to finish…' : '',
    }
    if (ready) timers[platform] = setTimeout(() => queueSave(platform, revision), 400)
  }

  /** Validate a draft when the person leaves the field, even below its typing threshold.
   * @param platform Field that lost focus.
   * @returns Nothing; completed checks and in-flight saves are not repeated.
   */
  function blurContact(platform: MessagingPlatform): void {
    clearTimeout(timers[platform])
    if (!active || states[platform].kind !== 'waiting') return
    queueSave(platform, ++revisions[platform])
  }

  /** Retry a failed save or lookup without requiring another edit.
   * @param platform Field to retry.
   * @returns Nothing.
   */
  function retry(platform: MessagingPlatform): void {
    clearTimeout(timers[platform])
    queueSave(platform, ++revisions[platform])
  }

  /** Save preference changes without replacing either contact draft.
   * @param platform Explicit preference, or null for the default.
   * @returns Nothing; failures remain available to the form.
   */
  async function setPreference(platform: MessagingPlatform | null): Promise<void> {
    if (actionBusy) return
    actionBusy = true
    failure = ''
    try {
      const result = await setUserMessagingPreference({ userId, platform })
      if (active)
        settings = {
          ...settings,
          platform: result.platform,
          preferredPlatform: platform,
        }
    } catch (cause) {
      if (active)
        failure =
          cause instanceof Error ? cause.message : 'Unable to save messaging preference'
    } finally {
      actionBusy = false
    }
  }

  /** Apply the existing administrator ownership check only to unchanged saved details.
   * @param accountId Accessible organisation account.
   * @param platform Platform being verified.
   * @returns Nothing; this action remains separate from provider existence checks.
   */
  async function verify(accountId: string, platform: MessagingPlatform): Promise<void> {
    if (actionBusy || pending[platform]) return
    actionBusy = true
    failure = ''
    const revision = revisions[platform]
    try {
      if (!userId)
        throw new Error('Select a user in the directory before verifying ownership')
      const identity = settings.identities.find(row => row.platform === platform)
      if (!identity || isDirty(platform))
        throw new Error('Save the identity before verifying ownership')
      await verifyUserMessagingIdentity({
        meta: { isAdminRequest: true },
        userId,
        accountId,
        expectedUpdatedAt: identity.updatedAt,
        confirmOwnership: true,
      })
      if (!active) return
      const value = await readSettings()
      if (!active) return
      mergeIdentity(platform, value)
      if (revisions[platform] === revision)
        states[platform] = {
          kind: 'confirmed',
          message: 'Saved. Account ownership verified.',
        }
    } catch (cause) {
      if (active)
        failure =
          cause instanceof Error ? cause.message : 'Unable to verify messaging identity'
    } finally {
      actionBusy = false
    }
  }

  onMount(() => {
    active = true
    void (async () => {
      const value = await readSettings()
      if (!active) return
      settings = value
      for (const platform of platforms) {
        inputs[platform] = displayMessagingContact(
          value.identities.find(row => row.platform === platform),
        )
        void checkIdentity(platform, revisions[platform])
      }
      if (!canVerify) return
      const meta = { isAdminRequest: true as const }
      const available = []
      for (const organisation of await getMessagingOrganisations({ meta })) {
        if (!active) return
        for (const account of await getMessagingAccounts({
          meta,
          organisationId: organisation.id,
        })) {
          if (account.externalAccountId && account.enabled)
            available.push({
              id: account.id,
              platform: account.platform,
              organisation: organisation.code,
            })
        }
      }
      if (active) accounts = available
    })()
      .catch(cause => {
        if (active)
          failure =
            cause instanceof Error ? cause.message : 'Unable to load messaging settings'
      })
      .finally(() => {
        if (active) loading = false
      })
    return () => {
      active = false
      for (const platform of platforms) {
        clearTimeout(timers[platform])
        revisions[platform]++
      }
    }
  })

  return {
    get settings() {
      return settings
    },
    get inputs() {
      return inputs
    },
    get states() {
      return states
    },
    get accounts() {
      return accounts
    },
    get busy() {
      return actionBusy || pending.whatsapp || pending.telegram
    },
    get loading() {
      return loading
    },
    get error() {
      return failure
    },
    isDirty,
    updateContact,
    blurContact,
    retry,
    setPreference,
    verify,
  }
}
