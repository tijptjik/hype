// @vitest-environment jsdom
// TESTS
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// SVELTE
import { flushSync } from 'svelte'
// COMPONENTS
import Fixture from './fixtures/components/UserMessagingSettingsModelFixture.svelte'
// TYPES
import type { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'
import type { MessagingIdentityFields } from '#lib/messaging/identity.js'
import type { MessagingPlatform } from '#lib/messaging/types.js'

type Model = ReturnType<typeof useUserMessagingSettingsModel>
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  check: vi.fn(),
  preference: vi.fn(),
}))
vi.mock('#lib/api/messaging.remote.js', () => ({
  getUserMessagingSettings: mock.read,
  setUserMessagingIdentity: mock.save,
  checkUserMessagingIdentity: mock.check,
  setUserMessagingPreference: mock.preference,
  getMessagingOrganisations: vi.fn(),
  getMessagingAccounts: vi.fn(),
  verifyUserMessagingIdentity: vi.fn(),
}))
let saved: Model['settings']
let revision: number

/** Persist a synthetic claim without conflating it with provider or ownership confirmation.
 * @param input Submitted contact fields.
 * @returns Save acknowledgement.
 */
function persist(input: {
  platform: MessagingPlatform
  identity: MessagingIdentityFields | null
}): { saved: true } {
  saved.identities = saved.identities.filter(row => row.platform !== input.platform)
  if (input.identity)
    saved.identities.push({
      platform: input.platform,
      ...input.identity,
      validation: null,
      verifiedAt: null,
      updatedAt: ++revision,
    })
  return { saved: true }
}
/** @returns A mounted model with its initial read completed. */
async function setup(): Promise<{ model: Model; unmount: () => void }> {
  let model!: Model
  const view = render(Fixture, {
    onModel: value => {
      model = value
    },
  })
  await vi.advanceTimersByTimeAsync(0)
  flushSync()
  expect(model.loading).toBe(false)
  return { model, unmount: view.unmount }
}
/** @returns A manually controlled async result for race checks. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  revision = 0
  saved = { platform: 'whatsapp', preferredPlatform: null, identities: [] }
  mock.read.mockImplementation(() =>
    Object.assign(Promise.resolve(structuredClone(saved)), { refresh: async () => {} }),
  )
  mock.save.mockImplementation(async input => persist(input))
  mock.check.mockResolvedValue({
    status: 'confirmed',
    message: 'Saved. Account confirmed.',
  })
  mock.preference.mockResolvedValue({ platform: 'telegram' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('waits 400 ms after the last keystroke and never saves an invalid phone', async () => {
  const { model } = await setup()
  model.updateContact('whatsapp', '9123')
  await vi.advanceTimersByTimeAsync(400)
  expect(mock.save).not.toHaveBeenCalled()
  expect(model.states.whatsapp.kind).toBe('waiting')
  expect(mock.check).not.toHaveBeenCalled()
  model.updateContact('whatsapp', '91234567')
  await vi.advanceTimersByTimeAsync(399)
  expect(mock.save).not.toHaveBeenCalled()
  model.updateContact('whatsapp', '91234568')
  await vi.advanceTimersByTimeAsync(399)
  expect(mock.save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(mock.save).toHaveBeenCalledExactlyOnceWith({
    userId: undefined,
    platform: 'whatsapp',
    identity: { phoneNumber: '+85291234568', username: null, nativeId: null },
  })
  expect(model.inputs.whatsapp).toBe('+85291234568')
  expect(mock.check).not.toHaveBeenCalled()
  expect(model.states.whatsapp.kind).toBe('waiting')
})

it('keeps both drafts while saving the platforms independently', async () => {
  const { model } = await setup()
  model.updateContact('whatsapp', '91234567')
  model.updateContact('telegram', 'Synthetic_User')
  await vi.advanceTimersByTimeAsync(400)
  expect(saved.identities).toHaveLength(2)
  expect(model.settings.identities).toHaveLength(2)
  expect(model.inputs).toEqual({
    whatsapp: '+85291234567',
    telegram: '@synthetic_user',
  })
  expect(model.states.telegram.kind).toBe('waiting')
  model.updateContact('whatsapp', '')
  await vi.advanceTimersByTimeAsync(400)
  expect(model.settings.identities.map(row => row.platform)).toEqual(['telegram'])
  expect(model.inputs.telegram).toBe('@synthetic_user')
  expect(model.states.whatsapp.kind).toBe('empty')
})

it('serializes rapid edits and never restores the text from an older save', async () => {
  const { model } = await setup()
  const first = deferred<void>()
  mock.save.mockImplementationOnce(async input => {
    await first.promise
    return persist(input)
  })
  model.updateContact('telegram', 'first_user')
  await vi.advanceTimersByTimeAsync(400)
  model.updateContact('telegram', 'newest_user')
  await vi.advanceTimersByTimeAsync(400)
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(model.inputs.telegram).toBe('newest_user')
  first.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(mock.save).toHaveBeenCalledTimes(2)
  expect(saved.identities[0].username).toBe('newest_user')
  expect(model.inputs.telegram).toBe('@newest_user')
  expect(mock.check).not.toHaveBeenCalled()
})

it('retains failed drafts and retries saves while provider confirmation is deferred', async () => {
  const { model } = await setup()
  mock.save.mockRejectedValueOnce(new Error('Save failed'))
  model.updateContact('telegram', '@synthetic')
  await vi.advanceTimersByTimeAsync(400)
  expect(model.inputs.telegram).toBe('@synthetic')
  expect(model.states.telegram).toMatchObject({
    kind: 'warning',
    message: 'Save failed',
  })
  expect(mock.check).not.toHaveBeenCalled()
  mock.check.mockResolvedValueOnce({
    status: 'unavailable',
    message: 'Saved, but confirmation is unavailable',
  })
  model.retry('telegram')
  await vi.advanceTimersByTimeAsync(0)
  expect(model.states.telegram.kind).toBe('waiting')
  model.retry('telegram')
  await vi.advanceTimersByTimeAsync(0)
  expect(model.states.telegram.kind).toBe('waiting')
  expect(mock.save).toHaveBeenCalledTimes(2)
})

it('keeps unsaved contact text when a preference save fails', async () => {
  const { model } = await setup()
  model.updateContact('telegram', 'still_typing')
  mock.preference.mockRejectedValueOnce(new Error('Preference failed'))
  await model.setPreference('telegram')
  expect(model.inputs.telegram).toBe('still_typing')
  expect(model.settings.preferredPlatform).toBeNull()
  expect(model.error).toBe('Preference failed')
})

it('cancels unsent saves and ignores pending work after unmount', async () => {
  const { model, unmount } = await setup()
  model.updateContact('telegram', 'synthetic')
  unmount()
  await vi.advanceTimersByTimeAsync(500)
  expect(mock.save).not.toHaveBeenCalled()
  expect(mock.check).not.toHaveBeenCalled()
})

it('starts username feedback at four characters, excluding @, and permits early blur', async () => {
  const { model } = await setup()
  model.updateContact('telegram', '@abc')
  await vi.advanceTimersByTimeAsync(1000)
  expect(model.states.telegram.kind).toBe('waiting')
  model.updateContact('telegram', '@abcd')
  await vi.advanceTimersByTimeAsync(399)
  expect(model.states.telegram.kind).toBe('waiting')
  await vi.advanceTimersByTimeAsync(1)
  expect(model.states.telegram.kind).toBe('warning')
  expect(mock.save).not.toHaveBeenCalled()
  expect(mock.check).not.toHaveBeenCalled()
  model.updateContact('telegram', '@ab')
  expect(model.states.telegram.kind).toBe('waiting')
  model.blurContact('telegram')
  await vi.advanceTimersByTimeAsync(0)
  expect(model.states.telegram.kind).toBe('warning')
})

it('flushes the debounce on blur once and cancels checks after backspacing below the threshold', async () => {
  const { model } = await setup()
  model.updateContact('whatsapp', '91234567')
  await vi.advanceTimersByTimeAsync(100)
  model.blurContact('whatsapp')
  await vi.advanceTimersByTimeAsync(0)
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(mock.check).not.toHaveBeenCalled()
  model.blurContact('whatsapp')
  await vi.advanceTimersByTimeAsync(500)
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(mock.check).not.toHaveBeenCalled()
  model.updateContact('whatsapp', '91234568')
  await vi.advanceTimersByTimeAsync(200)
  model.updateContact('whatsapp', '914')
  await vi.advanceTimersByTimeAsync(1000)
  expect(model.states.whatsapp).toEqual({ kind: 'waiting', message: '' })
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(mock.check).not.toHaveBeenCalled()
})

it('loads saved validation without contacting providers when opening a profile', async () => {
  persist({
    platform: 'telegram',
    identity: { phoneNumber: '+85291234567', username: null, nativeId: null },
  })
  saved.identities[0].validation = {
    status: 'confirmed',
    checkedAt: 1000,
    accountId: 'account',
    message: 'Previously found',
  }
  const { model } = await setup()
  expect(model.states.telegram).toEqual({
    kind: 'confirmed',
    message: 'Previously found',
  })
  expect(mock.check).not.toHaveBeenCalled()
  expect(mock.save).not.toHaveBeenCalled()
})

it('fills missing services after explicit save without replacing an override', async () => {
  persist({
    platform: 'telegram',
    identity: { phoneNumber: null, username: 'override', nativeId: null },
  })
  const { model } = await setup()
  await model.useDefaultPhone('91234567')
  expect(model.inputs.whatsapp).toBe('+85291234567')
  expect(model.inputs.telegram).toBe('@override')
  expect(mock.save).toHaveBeenCalledTimes(1)
})

it('renders preloaded identities immediately without a duplicate settings request', async () => {
  persist({
    platform: 'telegram',
    identity: { phoneNumber: null, username: 'saved_user', nativeId: null },
  })
  let model!: Model
  render(Fixture, {
    initialSettings: saved,
    onModel: value => {
      model = value
    },
  })
  expect(model.loading).toBe(false)
  expect(model.inputs.telegram).toBe('@saved_user')
  await vi.advanceTimersByTimeAsync(0)
  expect(mock.read).not.toHaveBeenCalled()
  expect(mock.check).not.toHaveBeenCalled()
})
