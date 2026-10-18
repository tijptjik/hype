<script lang="ts">
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// COMPONENTS
import AccountCreatedDialogContent from './components/AccountCreatedDialogContent.svelte'
// AUTH
import { toSafeReturnPath, type UpgradeReason } from '#lib/auth/upgrade.js'
import { navigateAfterAuth } from '#lib/auth/navigation.js'
// I18N
import { m } from '#lib/i18n.js'

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
type AuthPanelComponent = typeof import('./AuthPanel.svelte').default
let AuthPanel = $state<AuthPanelComponent | null>(null)
let authPanelLoadError = $state<unknown>(null)
let authPanelPromise: Promise<AuthPanelComponent> | null = null

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

/** Loads the account form only when the upgrade dialog is opened. */
function loadAuthPanel(): Promise<AuthPanelComponent> {
  authPanelPromise ??= import('./AuthPanel.svelte')
    .then(module => {
      AuthPanel = module.default
      authPanelLoadError = null
      return module.default
    })
    .catch(error => {
      authPanelPromise = null
      authPanelLoadError = error
      throw error
    })
  return authPanelPromise
}

$effect(() => {
  if (open) void loadAuthPanel().catch(() => {})
})

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
  await navigateAfterAuth(safeReturnTo)
}

/** Dismisses the completed email-account guard and resumes the requesting route. */
async function handleCompletionClose(): Promise<void> {
  open = false
  await navigateAfterAuth(safeReturnTo)
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
      {:else if AuthPanel}
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
      {:else}
        <div class="flex min-h-48 min-w-72 items-center justify-center p-8 text-center">
          {#if authPanelLoadError}
            <div>
              <p>{m.bootstrap__error()}</p>
              <button
                type="button"
                class="mt-4 rounded-lg bg-white px-4 py-2 text-black"
                onclick={() => void loadAuthPanel().catch(() => {})}
              >
                {m.bootstrap__retry()}
              </button>
            </div>
          {:else}
            <span
              class="loading loading-ring loading-lg"
              role="status"
              aria-label={m.resource_loading()}
            ></span>
          {/if}
        </div>
        <Dialog.Close
          class="absolute right-3 top-3 flex size-7 items-center justify-center rounded text-xl leading-none text-white/60 transition-colors hover:text-white"
          aria-label={m.guest__close()}
          >×</Dialog.Close
        >
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
