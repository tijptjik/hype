// @vitest-environment jsdom
// SVELTE
import { writable } from 'svelte/store'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
// TESTS
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LinkedAccounts from '$lib/components/panels/sections/LinkedAccounts.svelte'
import { m } from '$lib/i18n'

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  accountInfo: vi.fn(),
  unlinkAccount: vi.fn(),
  listUserPasskeys: vi.fn(),
}))
vi.mock('$app/state', () => ({ page: { url: new URL('https://hype.hk/') } }))
// jsdom has no Web Animations API; transition timing is outside this selector test.
vi.mock('svelte/transition', () => ({ slide: () => ({ duration: 0 }) }))
vi.mock('$lib/auth/client', () => ({
  authClient: { ...mocks, passkey: { listUserPasskeys: mocks.listUserPasskeys } },
  useSession: () =>
    writable({ data: { user: { id: 'user', email: 'user@example.com' } } }),
  signIn: {},
  signUp: {},
}))
vi.mock('$lib/auth/passkey-upgrade', () => ({
  completePasskeyAccountUpgrade: vi.fn(),
  PasskeyRegistrationError: class extends Error {},
  PasskeySessionRefreshError: class extends Error {},
}))

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mocks.listAccounts.mockResolvedValue({
    data: [
      { id: 'google-local', providerId: 'google', accountId: 'same-external' },
      { id: 'facebook-local', providerId: 'facebook', accountId: 'same-external' },
    ],
  })
  mocks.accountInfo.mockResolvedValue({
    data: { user: { email: 'provider@example.com' } },
  })
  mocks.unlinkAccount.mockResolvedValue({ data: { status: true } })
  mocks.listUserPasskeys.mockResolvedValue({ data: [] })
})
afterEach(cleanup)

it('uses local IDs for provider info and unlinking without removing a different provider', async () => {
  render(LinkedAccounts, { startGuestUpgradeOpen: true })
  await waitFor(() => expect(mocks.accountInfo).toHaveBeenCalledTimes(2))
  expect(mocks.accountInfo).toHaveBeenCalledWith({
    query: { accountId: 'google-local' },
  })
  expect(mocks.accountInfo).toHaveBeenCalledWith({
    query: { accountId: 'facebook-local' },
  })
  const buttons = await screen.findAllByRole('button', { name: m.account__unlink() })
  await fireEvent.click(buttons[0])
  await waitFor(() =>
    expect(mocks.unlinkAccount).toHaveBeenCalledWith({ accountId: 'google-local' }),
  )
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: m.account__unlink() })).toHaveLength(
      1,
    ),
  )
  expect(screen.getByRole('button', { name: m.account__unlink() })).toBeDisabled()
})
