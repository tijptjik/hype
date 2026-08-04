<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
// AUTH
import { requestAccountUpgrade, type UpgradeReason } from '$lib/auth/upgrade'
// I18N
import { m } from '$lib/i18n'

const GUEST_REMINDER_DISMISSED_KEY = 'hype:guest-reminder-dismissed'

let { reason = 'sync' }: { reason?: UpgradeReason } = $props()

let isDismissed = $state(false)
let isReady = $state(false)

onMount(() => {
  isDismissed = isGuestReminderDismissed()
  isReady = true
})

/**
 * Returns whether the guest-account reminder has been dismissed in this browser
 * session.
 *
 * @returns Whether the reminder should stay hidden.
 */
function isGuestReminderDismissed(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.sessionStorage.getItem(GUEST_REMINDER_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Hides the reminder and remembers the choice until the browser session ends.
 *
 * @returns Nothing.
 */
function dismissGuestReminder(): void {
  isDismissed = true

  try {
    window.sessionStorage.setItem(GUEST_REMINDER_DISMISSED_KEY, 'true')
  } catch {
    // Keep the reminder closed for the current component if storage is unavailable.
  }
}
</script>

{#if isReady && !isDismissed}
  <aside class="mx-4 my-3 rounded-xl bg-base-100/60 p-4">
    <p class="text-sm leading-5 text-base-content/75">{m.guest__reminder()}</p>
    <div class="mt-3 flex justify-end gap-2">
      <Button
        text={m.guest__close()}
        color="neutral"
        style="ghost"
        size="sm"
        onClick={dismissGuestReminder}
      />
      <Button
        text={m.guest__upgrade_action()}
        color="primary"
        size="sm"
        onClick={() => requestAccountUpgrade(reason, window.location.href)}
      />
    </div>
  </aside>
{/if}
