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
  expect(mock.check).toHaveBeenCalledWith({
    userId: undefined,
    platform: 'whatsapp',
    expectedUpdatedAt: 1,
  })
  expect(model.states.whatsapp.kind).toBe('confirmed')
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
  expect(model.states.telegram.kind).toBe('confirmed')
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
  expect(mock.check).toHaveBeenCalledTimes(1)
})

it('does not show a stale checkmark after the person changes the field', async () => {
  const { model } = await setup()
  const lookup = deferred<{ status: string; message: string }>()
  mock.check.mockImplementationOnce(() => lookup.promise)
  model.updateContact('telegram', 'first_user')
  await vi.advanceTimersByTimeAsync(400)
  expect(model.states.telegram.kind).toBe('checking')
  model.updateContact('telegram', '@bad')
  lookup.resolve({ status: 'confirmed', message: 'Old account exists' })
  await vi.advanceTimersByTimeAsync(400)
  expect(model.inputs.telegram).toBe('@bad')
  expect(model.states.telegram.kind).toBe('waiting')
  model.blurContact('telegram')
  await vi.advanceTimersByTimeAsync(0)
  expect(model.states.telegram).toMatchObject({ kind: 'warning', invalid: true })
  expect(mock.save).toHaveBeenCalledTimes(1)
})

it('retains failed drafts, supports retry and distinguishes unavailable checks from confirmation', async () => {
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
  expect(model.states.telegram).toMatchObject({ kind: 'warning', invalid: false })
  model.retry('telegram')
  await vi.advanceTimersByTimeAsync(0)
  expect(model.states.telegram.kind).toBe('confirmed')
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

it('saves newer input while an older provider lookup is still pending', async () => {
  const { model } = await setup()
  const lookup = deferred<{ status: string; message: string }>()
  mock.check.mockImplementationOnce(() => lookup.promise)
  model.updateContact('telegram', 'first_user')
  await vi.advanceTimersByTimeAsync(400)
  model.updateContact('telegram', 'newest_user')
  await vi.advanceTimersByTimeAsync(400)
  expect(mock.save).toHaveBeenCalledTimes(2)
  expect(saved.identities[0].username).toBe('newest_user')
  expect(model.states.telegram.kind).toBe('confirmed')
  lookup.resolve({ status: 'not-found', message: 'Old lookup failed' })
  await vi.advanceTimersByTimeAsync(0)
  expect(model.inputs.telegram).toBe('@newest_user')
  expect(model.states.telegram.kind).toBe('confirmed')
})

it.each(['whatsapp', 'telegram'] as const)(
  'keeps short %s numbers quiet until blur',
  async platform => {
    const { model } = await setup()
    model.updateContact(platform, '914')
    await vi.advanceTimersByTimeAsync(2000)
    expect(model.states[platform]).toEqual({ kind: 'waiting', message: '' })
    expect(mock.save).not.toHaveBeenCalled()
    expect(mock.check).not.toHaveBeenCalled()
    model.blurContact(platform)
    await vi.advanceTimersByTimeAsync(0)
    expect(model.states[platform]).toMatchObject({ kind: 'warning', invalid: true })
    expect(mock.save).not.toHaveBeenCalled()
    expect(mock.check).not.toHaveBeenCalled()
  },
)

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
  expect(mock.check).toHaveBeenCalledTimes(1)
  model.blurContact('whatsapp')
  await vi.advanceTimersByTimeAsync(500)
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(mock.check).toHaveBeenCalledTimes(1)
  model.updateContact('whatsapp', '91234568')
  await vi.advanceTimersByTimeAsync(200)
  model.updateContact('whatsapp', '914')
  await vi.advanceTimersByTimeAsync(1000)
  expect(model.states.whatsapp).toEqual({ kind: 'waiting', message: '' })
  expect(mock.save).toHaveBeenCalledTimes(1)
  expect(mock.check).toHaveBeenCalledTimes(1)
})
