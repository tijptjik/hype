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
import LinkedAccounts from '#lib/bits/patterns/panels/sections/linkedAccounts/LinkedAccountsSection.svelte'
import { m } from '#lib/i18n.js'

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  accountInfo: vi.fn(),
  unlinkAccount: vi.fn(),
  listUserPasskeys: vi.fn(),
}))
vi.mock('$app/state', () => ({ page: { url: new URL('https://hype.hk/') } }))
// jsdom has no Web Animations API; transition timing is outside this selector test.
vi.mock('svelte/transition', () => ({ slide: () => ({ duration: 0 }) }))
vi.mock('#lib/auth/client.js', () => ({
  authClient: { ...mocks, passkey: { listUserPasskeys: mocks.listUserPasskeys } },
  useSession: () =>
    writable({ data: { user: { id: 'user', email: 'user@example.com' } } }),
  signIn: {},
  signUp: {},
}))
vi.mock('#lib/auth/passkey-upgrade.js', () => ({
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
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each([
  [401, { code: 'UNAUTHORIZED' }, () => m.account__password_sign_in_again()],
  [429, {}, () => m.account__password_rate_limited()],
  [403, { message: 'FORBIDDEN' }, () => m.account__password_add_error()],
  [400, { message: 'PASSWORD_NOT_SET' }, () => m.account__password_add_error()],
] as const)(
  'explains password setup rejection %s (%j)',
  async (status, body, message) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status }))
    vi.stubGlobal('fetch', fetch)
    render(LinkedAccounts, { startGuestUpgradeOpen: true })
    await fireEvent.click(
      await screen.findByRole('button', { name: m.account__add_password_action() }),
    )
    await fireEvent.input(screen.getByLabelText(m.guest__email()), {
      target: { value: 'user@example.com' },
    })
    await fireEvent.input(screen.getByLabelText(m.guest__password()), {
      target: { value: 'valid-test-password-123' },
    })
    await fireEvent.click(
      screen.getByRole('button', { name: m.account__setup_email_login() }),
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message()))
    expect(fetch).toHaveBeenCalledOnce()
  },
)

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
