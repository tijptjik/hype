<script lang="ts">
import { goto } from '$app/navigation'
import { signIn } from '$lib/auth/client'
import { m } from '$lib/i18n'
import AuthPanel from '$lib/bits/patterns/auth/AuthPanel.svelte'
import FlightSurface from '$lib/bits/patterns/layout/app/components/FlightSurface.svelte'

async function continueAsGuest(): Promise<void> {
  const result = await signIn.anonymous()
  if (result.error) throw new Error(result.error.message)
  await goto('/')
}
</script>

<FlightSurface class="px-4 py-8 text-white">
  <div class="relative z-10 w-full max-w-md">
    <AuthPanel
      title={m.login__title()}
      description={m.login__description()}
      returnTo="/"
      showGuest
      onGuest={continueAsGuest}
    />
  </div>
</FlightSurface>
