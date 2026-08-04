<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { authClient, signIn } from '$lib/auth/client'
import { toSafeReturnPath } from '$lib/auth/upgrade'
import { m } from '$lib/i18n'
import AuthPanel from '$lib/bits/patterns/auth/AuthPanel.svelte'
import FlightSurface from '$lib/bits/patterns/layout/app/components/FlightSurface.svelte'

const returnTo = $derived(toSafeReturnPath(page.url.searchParams.get('returnTo')))

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
  <div class="relative z-10 w-full max-w-md">
    <AuthPanel
      title={m.login__title()}
      description={m.login__description()}
      {returnTo}
      showGuest
      onGuest={continueAsGuest}
    />
  </div>
</FlightSurface>
