// @vitest-environment jsdom
// TESTS
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// SVELTE
import { flushSync } from 'svelte'
// COMPONENTS
import Card from './fixtures/components/MessagingAccountCardFixture.svelte'
// TYPES
import type { BridgeStatus } from '#lib/messaging/types.js'

vi.mock('#lib/bits/core/index.js', async () => ({ Button: (await import('#lib/bits/core/button/Button.svelte')).default }))
afterEach(cleanup)
const disconnected: BridgeStatus = { connected: false, loggedOut: false, qr: null, qrExpiresAt: null, authState: 'disconnected' }

it('explains where to enter the Telegram password and submits it through a masked form', async () => {
  const onAction = vi.fn().mockResolvedValue(undefined)
  const screen = render(Card, { platform: 'telegram', registered: true, enabled: true, status: { ...disconnected, authState: 'password', lastEvent: 'SESSION_PASSWORD_NEEDED' }, onAction })
  const input = screen.getByLabelText('Two-step verification password') as HTMLInputElement
  expect(input.type).toBe('password')
  expect(input.placeholder).toBe('Enter your Telegram password')
  expect(screen.getByText(/your other Telegram app will not show a password prompt/)).toBeTruthy()
  expect(screen.queryByText('SESSION_PASSWORD_NEEDED')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sign in with QR code' })).toBeNull()
  flushSync(() => { input.value = 'synthetic-password'; input.dispatchEvent(new Event('input', { bubbles: true })) })
  flushSync(() => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'password', password: 'synthetic-password' }))
  expect(input.value).toBe('')
})

it('shows QR progress and then a clear connected state without internal events', async () => {
  const screen = render(Card, { platform: 'whatsapp', registered: true, enabled: true, status: disconnected, pendingAction: 'connect', onAction: vi.fn() })
  expect(screen.getAllByText('Starting connection…').length).toBeGreaterThan(0)
  void screen.rerender({ pendingAction: null, status: { ...disconnected, authState: undefined, qr: 'synthetic-pairing-code' } })
  await waitFor(() => expect(screen.getByText('Scan QR code')).toBeTruthy())
  expect(screen.getByText('Scan QR code')).toBeTruthy()
  expect(screen.getByAltText('WhatsApp account sign-in QR code')).toBeTruthy()
  void screen.rerender({ status: { ...disconnected, connected: true, lastEvent: 'StarUpdate' } })
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  expect(screen.getByText('Connected')).toBeTruthy()
  expect(screen.queryByAltText('WhatsApp account sign-in QR code')).toBeNull()
  expect(screen.queryByText('StarUpdate')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
})

it('does not label a stopped Telegram sign-in as connecting just because the account is enabled', () => {
  const screen = render(Card, { platform: 'telegram', registered: true, enabled: true, status: disconnected, onAction: vi.fn() })
  expect(screen.getByText('Disconnected')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign in with QR code' })).toBeTruthy()
})


it('shows signed-out recovery rather than an indefinite connecting label', () => {
  const screen = render(Card, { platform: 'whatsapp', registered: true, enabled: true, status: { connected: false, loggedOut: true, qr: null, qrExpiresAt: null }, onAction: vi.fn() })
  expect(screen.getByText('Signed out — reconnect required')).toBeTruthy()
  expect(screen.queryByText('Connecting…')).toBeNull()
})

it('shows a fresh WhatsApp QR without requiring another Connect click', () => {
  const screen = render(Card, { platform: 'whatsapp', registered: true, enabled: true, status: { connected: false, loggedOut: false, qr: 'synthetic-pairing-qr', qrExpiresAt: Date.now() + 60000 }, onAction: vi.fn() })
  expect(screen.getByAltText('WhatsApp account sign-in QR code')).toBeTruthy()
  expect(screen.getByText('Scan QR code')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Connect$/ })).toBeNull()
})
