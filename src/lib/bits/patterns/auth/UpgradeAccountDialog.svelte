<script lang="ts">
// SVELTEKIT
import { goto } from '$app/navigation'
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// COMPONENTS
import AccountCreatedDialogContent from './components/AccountCreatedDialogContent.svelte'
import AuthPanel from './AuthPanel.svelte'
// AUTH
import { toSafeReturnPath, type UpgradeReason } from '$lib/auth/upgrade'
// I18N
import { m } from '$lib/i18n'

let {
  open = $bindable(false),
  reason = 'account',
  returnTo = '/',
  onAccountReady,
}: {
  open?: boolean
  reason?: UpgradeReason
  returnTo?: string
  onAccountReady?: () => Promise<void>
} = $props()

let authMode = $state<'sign-in' | 'sign-up'>('sign-up')
let dialogSession = $state(0)
let isAccountComplete = $state(false)
let wasOpen = false

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

// Every account-guard request begins with account creation, even after reopening the dialog.
$effect(() => {
  if (open && !wasOpen) {
    authMode = 'sign-up'
    isAccountComplete = false
    dialogSession += 1
  }
  wasOpen = open
})

/** Switches between creating an account and signing in to an existing one. */
function setAuthMode(nextMode: 'sign-in' | 'sign-up'): void {
  authMode = nextMode
}

/** Shows the email-account confirmation state with verification guidance. */
function showAccountComplete(): void {
  isAccountComplete = true
}

/** Confirms the promoted passkey session, then returns the user to the app. */
async function handlePasskeyAccountComplete(): Promise<void> {
  if (onAccountReady) await onAccountReady()
  open = false
  await goto(safeReturnTo)
}

/** Dismisses the completed email-account guard and resumes the requesting route. */
async function handleCompletionClose(): Promise<void> {
  open = false
  await goto(safeReturnTo)
}
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" />
    <Dialog.Content
      class="bits-theme fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2"
    >
      {#if !isAccountComplete}
        <Dialog.Title class="sr-only">{m.guest__upgrade_title()}</Dialog.Title>
        <Dialog.Description class="sr-only">{reasonMessage}</Dialog.Description>
      {/if}
      {#if isAccountComplete}
        <AccountCreatedDialogContent onClose={handleCompletionClose} />
      {:else}
        {#key dialogSession}
          <AuthPanel
            title={m.guest__upgrade_title()}
            description={reasonMessage}
            returnTo={safeReturnTo}
            showAuthModeTitle
            authModeTitle={authMode === 'sign-up'
              ? m.guest__upgrade_title()
              : m.guest__sign_in()}
            authModeToggleLabel={authMode === 'sign-up'
              ? m.guest__sign_in()
              : m.guest__create_account_action()}
            {authMode}
            onModeChange={setAuthMode}
            onSignUpComplete={showAccountComplete}
            onPasskeyAccountComplete={handlePasskeyAccountComplete}
          />
        {/key}
        <Dialog.Close
          class="absolute right-3 top-3 flex size-7 items-center justify-center rounded text-xl leading-none text-white/60 transition-colors hover:text-white"
          aria-label={m.guest__close()}
          >×</Dialog.Close
        >
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
