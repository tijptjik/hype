// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/WhatsAppConsoleFixture.svelte'

// This manual fixture never uses account RPCs, credentials, or a live provider.
const unavailable = async (): Promise<never> => { throw new Error('Synthetic fixture: no provider is connected') }
mount(Fixture, { target: document.getElementById('app')!, props: { options: {
  viewId: 'synthetic-whatsapp', platform: 'whatsapp', transport: {
    snapshot: async () => ({ status: { connected: false, loggedOut: false, qr: null, qrExpiresAt: null }, messages: [], outbox: [] }),
    connect: unavailable, disconnect: async () => {}, send: unavailable,
    profile: unavailable, upload: unavailable, media: unavailable,
    voiceTicket: unavailable, declineCall: unavailable,
  },
} } })
