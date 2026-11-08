<script lang="ts">
// THIRD PARTY
import { renderSVG } from 'uqr'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import * as WhatsApp from './components/index.js'
import ConversationPane from './components/ConversationPane.svelte'
// TYPES
import type { WhatsAppConsoleModel } from './whatsapp.types.js'
let { model }: { model: WhatsAppConsoleModel } = $props()
const platformLabel = $derived(model.platformLabel ?? 'WhatsApp')
const isTelegram = $derived(model.platform === 'telegram')
const pairingExpired = $derived(model.status.lastEvent === 'PairingQrCodesExhausted')
const qrImage = $derived(
  model.status.qr
    ? `data:image/svg+xml,${encodeURIComponent(renderSVG(model.status.qr))}`
    : '',
)
</script>

<div class="text-base-content mx-auto w-full max-w-7xl p-3 md:p-6">
  <div class="border-border bg-canvas overflow-hidden rounded-2xl border shadow-xl">
    <header
      class="border-border bg-panel flex flex-wrap items-center justify-between gap-3 border-b p-4"
    >
      <div>
        <h2 class="text-lg font-semibold">{platformLabel}</h2>
        <p class="text-muted-foreground text-sm">
          {model.status.connected
            ? 'Connected'
            : model.status.loggedOut
              ? 'Device was logged out'
              : model.status.qr
                ? 'Ready to link'
                : pairingExpired
                  ? 'QR code expired'
                  : 'Disconnected'}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button text="Refresh" style="ghost" onClick={() => void model.refresh()} />
        <Button
          text={pairingExpired ? 'Show new QR code' : 'Connect'}
          style="soft"
          color="primary"
          disabled={model.busy || model.status.connected}
          onClick={() => void model.connection(true)}
        />
        <Button
          text="Stop"
          style="outline"
          disabled={model.busy}
          onClick={() => void model.connection(false)}
        />
      </div>
    </header>
    {#if qrImage}
      <div class="border-border bg-panel flex flex-col items-center gap-3 border-b p-5">
        <img
          src={qrImage}
          width="256"
          height="256"
          class="rounded-xl bg-white p-3"
          alt={isTelegram
            ? 'Telegram account pairing QR code'
            : 'WhatsApp linked-device pairing QR code'}
        >
        <p class="text-muted-foreground max-w-sm text-center text-sm">
          {isTelegram
            ? 'Open Telegram → Settings → Devices → Link Desktop Device.'
            : 'Open WhatsApp → Settings → Linked devices → Link a device.'}
        </p>
      </div>
    {:else if !model.status.connected}
      <div class="border-border bg-panel border-b px-5 py-4">
        <p class="text-muted-foreground text-sm">
          {pairingExpired
            ? 'This pairing attempt expired. Select Show new QR code to try again.'
            : isTelegram
              ? 'Sign in from this organisation’s Messaging configuration, then connect here.'
              : 'Select Connect to display a QR code, then scan it in WhatsApp → Settings → Linked devices.'}
        </p>
      </div>
    {/if}
    {#if model.configurationHref}
      <div class="border-border border-b px-5 py-2">
        <Button
          text="Account configuration"
          href={model.configurationHref}
          style="ghost"
        />
      </div>
    {/if}
    {#if model.status.lastEvent && !model.status.connected}
      <p role="status" class="text-muted-foreground mx-5 mt-3 text-sm">
        {model.status.lastEvent}
      </p>
    {/if}
    {#if model.error}
      <p
        role="alert"
        class="border-border bg-surface m-4 rounded-lg border p-3 text-sm break-words"
      >
        {model.error}
      </p>
    {/if}
    <div class="grid min-w-0 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
      <aside class="border-border bg-panel border-b p-3 md:border-r md:border-b-0">
        <WhatsApp.ConversationList
          {platformLabel}
          viewId={model.viewId}
          conversations={model.conversations}
          selected={model.selectedChat}
          onSelect={model.selectChat}
        />
        {#if model.conversationDiscoveryAvailable}
          <div class="mt-3 flex flex-col gap-2">
            {#if model.conversationsComplete}
              <p class="text-muted-foreground text-sm">
                All available conversations loaded
              </p>
            {:else}
              <Button
                text={model.conversationsLoading
                  ? 'Loading conversations…'
                  : 'Find more conversations'}
                style="ghost"
                disabled={model.conversationsLoading || !model.status.connected}
                onClick={() => void model.loadConversations?.()}
              />
            {/if}
            {#if model.conversationsError}
              <p role="alert" class="text-muted-foreground text-sm">
                {model.conversationsError}
              </p>
            {/if}
          </div>
        {/if}
      </aside>
      <ConversationPane {model} fill={false} />
    </div>
  </div>
</div>
