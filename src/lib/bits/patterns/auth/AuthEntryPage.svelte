<script lang="ts">
// SVELTEKIT
import { goto, pushState } from '$app/navigation'
import { page } from '$app/state'
// AUTH
import { authClient, signIn } from '$lib/auth/client'
import { toSafeReturnPath } from '$lib/auth/upgrade'
// COMPONENTS
import AuthPanel from './AuthPanel.svelte'
import FlightSurface from '$lib/bits/patterns/layout/app/components/FlightSurface.svelte'
// I18N
import { m } from '$lib/i18n'

const returnTo = $derived(toSafeReturnPath(page.url.searchParams.get('returnTo')))
let authMode = $state<'sign-in' | 'sign-up'>(
  page.url.pathname === '/signup' ? 'sign-up' : 'sign-in',
)
const hubName = $derived((page.data.site_name as string | undefined)?.trim() || 'HYPE')
const brandName = $derived(hubName.replace(/^hype\.hk$/i, 'HYPE'))
const modeToggleHref = $derived(
  `${authMode === 'sign-in' ? '/signup' : '/login'}?returnTo=${encodeURIComponent(returnTo)}`,
)

/** Switches between the shareable auth routes without rerunning their page loads. */
function setAuthMode(nextMode: 'sign-in' | 'sign-up'): void {
  authMode = nextMode
  const url = new URL(page.url)
  url.pathname = nextMode === 'sign-up' ? '/signup' : '/login'
  pushState(url, {})
}

// Keep browser back/forward navigation and direct URLs aligned with the visible panel.
$effect(() => {
  authMode = page.url.pathname === '/signup' ? 'sign-up' : 'sign-in'
})

/** Restores the active guest session or creates one before continuing. */
async function continueAsGuest(): Promise<void> {
  // Better Auth rejects creating a second anonymous session; resume the current one instead.
  const sessionResult = await authClient.getSession()
  if (sessionResult.data?.user) {
    await goto(returnTo)
    return
  }

  const result = await signIn.anonymous()
  if (result.error) throw new Error(result.error.message)
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
      authPath={authMode === 'sign-up' ? '/signup' : '/login'}
      onModeChange={setAuthMode}
      onGuest={continueAsGuest}
    />
  </div>
</FlightSurface>
