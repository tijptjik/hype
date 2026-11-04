<script lang="ts">
// THIRD PARTY
import { renderSVG } from 'uqr'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
// TYPES
import type {
  BridgeStatus,
  LoginInput,
  MessagingPlatform,
} from '#lib/messaging/types.js'

let {
  platform,
  status,
  connectionError,
  registered = false,
  enabled = false,
  busy = false,
  pendingAction = null,
  onAction,
}: {
  connectionError?: string
  platform: MessagingPlatform
  status?: BridgeStatus
  registered?: boolean
  enabled?: boolean
  busy?: boolean
  pendingAction?: string | null
  onAction: (action: 'connect' | 'stop' | LoginInput) => Promise<void>
} = $props()
let phone = $state('')
let code = $state('')
let password = $state('')
const name = $derived(platform === 'telegram' ? 'Telegram' : 'WhatsApp')
const qrImage = $derived(
  status?.qr && !status.connected && status.authState !== 'password'
    ? `data:image/svg+xml,${encodeURIComponent(renderSVG(status.qr))}`
    : '',
)

const progress = $derived.by(() => {
  if (connectionError && !status) return 'Service unavailable'
  if (pendingAction === 'stop') return 'Disconnecting…'
  if (pendingAction === 'password' || pendingAction === 'code') return 'Verifying…'
  if (pendingAction === 'phone') return 'Requesting login code…'
  if (pendingAction) return 'Starting connection…'
  if (status?.connected) return 'Connected'
  if (status?.authState === 'password') return 'Password required'
  if (status?.authState === 'code') return 'Login code required'
  if (qrImage) return 'Scan QR code'
  if (status?.loggedOut) return 'Signed out — reconnect required'
  if (status?.lastEvent === 'PairingQrCodesExhausted') return 'QR code expired'
  if (status?.authState === 'qr') return 'Preparing QR code…'
  if (!status && registered) return 'Checking connection…'
  if (status?.authState === 'disconnected') return 'Disconnected'
  return enabled ? 'Reconnecting…' : registered ? 'Disconnected' : 'Not linked'
})
const challenge = $derived(
  status?.authState === 'password' || status?.authState === 'code',
)
const loginError = $derived.by(() => {
  if (status?.connected) return ''
  const event = status?.lastEvent ?? ''
  if (event.includes('PASSWORD_HASH_INVALID'))
    return 'That password was not accepted. Enter your Telegram two-step verification password again.'
  if (event.includes('PHONE_CODE_INVALID'))
    return 'That login code was not accepted. Check the code and try again.'
  if (event.includes('PHONE_CODE_EXPIRED'))
    return 'The login code expired. Start again to request a new code.'
  if (event.includes('FLOOD_WAIT'))
    return 'Telegram has limited login attempts. Wait before trying again.'
  return ''
})

/** Clear challenge secrets from the form immediately after submission. */
async function submitChallenge(kind: 'code' | 'password'): Promise<void> {
  const input: LoginInput = kind === 'code' ? { kind, code } : { kind, password }
  code = ''
  password = ''
  await onAction(input)
}
</script>

<section
  class="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-panel p-5"
  aria-label={`${name} account`}
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h3 class="text-lg font-semibold">{name}</h3>
    <span role="status" class="text-sm text-muted-foreground">{progress}</span>
  </div>
  {#if status?.identity}
    <p class="break-words">
      {status.identity.name}
      {#if status.identity.username}
        · @{status.identity.username}
      {/if}
    </p>
  {/if}
  <p class="text-sm text-muted-foreground">
    Shared by authorised operators in this organisation.
  </p>
  {#if registered && !status}
    {#if connectionError}
      <p class="text-sm text-muted-foreground">
        Connection status is unavailable. This does not mean the account was signed out.
      </p>
      <Button
        text="Retry connection"
        style="outline"
        disabled={busy}
        onClick={() => void onAction('connect')}
      />
    {:else}
      <section
        aria-label="Checking saved connection"
        class="h-24 rounded-lg bg-surface motion-safe:animate-pulse"
      ></section>
    {/if}
  {:else}
    <div class="flex flex-wrap gap-2">
      {#if !status?.connected && !challenge && !qrImage && status?.authState !== 'qr'}
        {#if platform === 'whatsapp' || status?.identity}
          <Button
            text={registered ? 'Connect' : 'Connect account'}
            style="outline"
            disabled={busy || status?.connected}
            onClick={() => void onAction('connect')}
          />
        {:else}
          <Button
            text="Sign in with QR code"
            style="outline"
            disabled={busy}
            onClick={() => void onAction({ kind: 'qr' })}
          />
        {/if}
      {/if}
      {#if registered}
        <Button
          text={status?.connected || status?.identity
            ? 'Disconnect for everyone'
            : 'Cancel sign-in'}
          style="outline"
          disabled={busy || (!enabled && !status?.connected)}
          onClick={() => void onAction('stop')}
        />
      {/if}
    </div>
  {/if}
  <div class="flex min-w-0 flex-col gap-4" aria-busy={pendingAction !== null}>
    {#if status?.connected}
      <p class="text-sm">
        Ready to send and receive messages. Open the shared inbox to start chatting.
      </p>
    {:else if pendingAction && !challenge}
      <p
        role="status"
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
      >
        {progress}
      </p>
    {:else if status?.authState === 'qr' && !qrImage}
      <p
        role="status"
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
      >
        Preparing a secure QR code. It will appear here automatically.
      </p>
    {/if}
    {#if qrImage && !pendingAction}
      <img
        src={qrImage}
        width="256"
        height="256"
        class="max-w-full self-center rounded-xl bg-white p-3"
        alt={`${name} account sign-in QR code`}
      >
      <p class="text-sm text-muted-foreground">
        {platform === 'telegram'
          ? 'Open Telegram → Settings → Devices → Link Desktop Device.'
          : 'Open WhatsApp → Settings → Linked devices → Link a device.'}
      </p>
    {/if}
    {#if platform === 'telegram' && !status?.connected && (!registered || status)}
      {#if status?.authState === 'password'}
        <p class="text-sm">
          Telegram requires the two-step verification password you previously set. Enter
          it here in HYPE; your other Telegram app will not show a password prompt.
        </p>
        <form
          class="flex min-w-0 flex-col gap-3"
          onsubmit={event => {
            event.preventDefault()
            if (!busy && password) void submitChallenge('password')
          }}
        >
          <TextInputField
            id="telegram-account-password"
            placeholder="Enter your Telegram password"
            label="Two-step verification password"
            inputType="password"
            bind:value={password}
            disabled={busy}
            inputAttrs={{ autocomplete: 'current-password' }}
          />
          <Button
            type="submit"
            text={pendingAction === 'password'
              ? 'Verifying password…'
              : 'Verify password'}
            style="outline"
            disabled={busy || !password}
          />
        </form>
        <p class="text-sm text-muted-foreground">
          This is not a login code or API key. If you forgot the password, use
          Telegram’s official app to recover it.
        </p>
      {:else if status?.authState === 'code'}
        <p class="text-sm">
          Enter the code Telegram sent using the delivery method shown in your Telegram
          app.
        </p>
        <TextInputField
          id="telegram-account-code"
          placeholder="Enter login code"
          label="Telegram login code"
          bind:value={code}
          disabled={busy}
          inputAttrs={{ autocomplete: 'one-time-code', inputmode: 'numeric' }}
        />
        <Button
          text="Verify code"
          style="outline"
          disabled={busy || !code}
          onClick={() => void submitChallenge('code')}
        />
      {:else if !status?.identity &&
        !qrImage &&
        status?.authState !== 'qr' &&
        !pendingAction}
        <TextInputField
          label="Phone number"
          inputType="tel"
          placeholder="+852…"
          bind:value={phone}
          disabled={busy}
          inputAttrs={{ autocomplete: 'tel' }}
        />
        <Button
          text="Send login code"
          style="outline"
          disabled={busy || !/^\+[1-9]\d{6,14}$/.test(phone)}
          onClick={() => void onAction({ kind: 'phone', phone })}
        />
      {/if}
    {/if}
    {#if loginError}
      <p role="alert" class="break-words text-sm">{loginError}</p>
    {/if}
  </div>
</section>
