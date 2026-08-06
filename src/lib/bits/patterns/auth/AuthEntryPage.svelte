<script lang="ts">
// SVELTEKIT
import { goto, pushState } from '$app/navigation'
import { page } from '$app/state'
// BITS COMPONENTS
import { Dialog } from 'bits-ui'
// AUTH
import { authClient, signIn } from '$lib/auth/client'
import { toSafeReturnPath } from '$lib/auth/upgrade'
// DEBUG
import { logMarkerBootstrap } from '$lib/debug/markerBootstrap'
// COMPONENTS
import AccountCreatedDialogContent from './components/AccountCreatedDialogContent.svelte'
import AuthPanel from './AuthPanel.svelte'
import FlightSurface from '$lib/bits/patterns/layout/app/components/FlightSurface.svelte'
// I18N
import { m } from '$lib/i18n'

const returnTo = $derived(toSafeReturnPath(page.url.searchParams.get('returnTo')))
let authMode = $state<'sign-in' | 'sign-up'>(
  page.url.pathname === '/signup' ? 'sign-up' : 'sign-in',
)
let isAccountCreated = $state(false)
const hubName = $derived((page.data.site_name as string | undefined)?.trim() || 'HYPE')
const brandName = $derived(hubName.replace(/^hype\.hk$/i, 'HYPE'))
const modeToggleHref = $derived(
  `${authMode === 'sign-in' ? '/signup' : '/signin'}?returnTo=${encodeURIComponent(returnTo)}`,
)

/** Switches between the shareable auth routes without rerunning their page loads. */
function setAuthMode(nextMode: 'sign-in' | 'sign-up'): void {
  authMode = nextMode
  const url = new URL(page.url)
  url.pathname = nextMode === 'sign-up' ? '/signup' : '/signin'
  pushState(url, {})
}

/** Opens the shared account-created dialog after the verification email is sent. */
function showAccountCreated(): void {
  isAccountCreated = true
}

/** Closes the account-created dialog and returns to the requested destination. */
async function handleAccountCreatedClose(): Promise<void> {
  isAccountCreated = false
  await goto(returnTo)
}

// Keep browser back/forward navigation and direct URLs aligned with the visible panel.
$effect(() => {
  authMode = page.url.pathname === '/signup' ? 'sign-up' : 'sign-in'
})

/** Restores the active guest session or creates one before continuing. */
async function continueAsGuest(): Promise<void> {
  // Better Auth rejects creating a second anonymous session; resume the current one instead.
  const sessionResult = await authClient.getSession()
  logMarkerBootstrap('guest continue requested', {
    hasSessionUser: Boolean(sessionResult.data?.user),
    isAnonymous: sessionResult.data?.user?.isAnonymous ?? null,
  })
  if (sessionResult.data?.user) {
    logMarkerBootstrap('guest continue restored existing session')
    await goto(returnTo)
    return
  }

  const result = await signIn.anonymous()
  if (result.error) {
    const authError = result.error as {
      code?: string
      message: string
      status?: number
    }
    logMarkerBootstrap('guest session creation failed', {
      code: authError.code ?? null,
      message: authError.message,
      status: authError.status ?? null,
    })
    throw new Error(authError.message)
  }
  logMarkerBootstrap('guest session created; navigating to app')
  await goto(returnTo)
}
</script>

<FlightSurface class="px-4 py-8 text-white">
  <div class="relative z-10 w-fit max-w-full">
    <AuthPanel
      title={m.login__title()}
      {brandName}
      description={m.login__description()}
      {returnTo}
      showGuest
      showAuthModeTitle
      {authMode}
      {modeToggleHref}
      authPath={authMode === 'sign-up' ? '/signup' : '/signin'}
      onModeChange={setAuthMode}
      onGuest={continueAsGuest}
      onSignUpComplete={showAccountCreated}
    />
  </div>
</FlightSurface>

<Dialog.Root bind:open={isAccountCreated}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" />
    <Dialog.Content
      class="bits-theme fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2"
    >
      <AccountCreatedDialogContent onClose={handleAccountCreatedClose} />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
