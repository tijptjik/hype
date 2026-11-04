// @vitest-environment node
// TESTS
import { expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const state = vi.hoisted(() => ({ touched: vi.fn() }))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap = (kind: 'query' | 'command') => (schema: { parse(value: unknown): unknown }, handler: (input: unknown, ctx: unknown) => unknown) =>
    withRemoteMeta(async (input: unknown) => handler(schema.parse(input), new Proxy({}, { get() { state.touched(); throw new Error('Retired endpoint accessed account context') } })), kind)
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
import { connectWhatsApp, disconnectWhatsApp, getWhatsApp, sendWhatsApp, uploadWhatsAppMedia, downloadWhatsAppMedia, getWhatsAppProfile, getWhatsAppVoiceTicket, declineWhatsAppCall } from '#lib/api/whatsover.remote.js'

const meta = { isAdminRequest: true as const }
const requests = [
  ['snapshot', () => getWhatsApp({ meta, after: 0 })],
  ['register/resume', () => connectWhatsApp({ meta })],
  ['disconnect', () => disconnectWhatsApp({ meta })],
  ['send', () => sendWhatsApp({ meta, requestId: 'synthetic', to: '+15555550100', text: 'synthetic' })],
  ['upload', () => uploadWhatsAppMedia({ meta, kind: 'image', mimeType: 'image/png', bytes: new Uint8Array([1]) })],
  ['download', () => downloadWhatsAppMedia({ meta, chat: '15555550100@s.whatsapp.net', target: { id: '1', sender: '15555550100@s.whatsapp.net' } })],
  ['profile', () => getWhatsAppProfile({ meta, jid: '15555550100@s.whatsapp.net' })],
  ['call ticket', () => getWhatsAppVoiceTicket({ meta })],
  ['decline call', () => declineWhatsAppCall({ meta, id: 'synthetic' })],
] as const

it.each(requests)('retires personal-account %s before touching any operator account or provider', async (_, request) => {
  await expect(request()).rejects.toMatchObject({ status: 410, body: { message: expect.stringContaining('organisation account') } })
  expect(state.touched).not.toHaveBeenCalled()
})
