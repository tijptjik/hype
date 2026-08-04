<script lang="ts">
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// COMPONENTS
import AuthPanel from './AuthPanel.svelte'
// AUTH
import { toSafeReturnPath, type UpgradeReason } from '$lib/auth/upgrade'
// I18N
import { m } from '$lib/i18n'

let {
  open = $bindable(false),
  reason = 'account',
  returnTo = '/',
}: {
  open?: boolean
  reason?: UpgradeReason
  returnTo?: string
} = $props()

const safeReturnTo = $derived(toSafeReturnPath(returnTo))
const reasonMessage = $derived(
  reason === 'contribution'
    ? m.guest__reason_contribution()
    : reason === 'profile'
      ? m.guest__reason_profile()
      : reason === 'admin'
        ? m.guest__reason_admin()
        : reason === 'subscription'
          ? m.guest__reason_subscription()
          : m.guest__reason_sync(),
)
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" />
    <Dialog.Content
      class="bits-theme fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2"
    >
      <Dialog.Title class="sr-only">{m.guest__upgrade_title()}</Dialog.Title>
      <Dialog.Description class="sr-only">{reasonMessage}</Dialog.Description>
      <AuthPanel
        title={m.guest__upgrade_title()}
        description={reasonMessage}
        returnTo={safeReturnTo}
      />
      <Dialog.Close
        class="absolute right-4 top-4 text-white/60"
        aria-label={m.guest__close()}
        >×</Dialog.Close
      >
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
