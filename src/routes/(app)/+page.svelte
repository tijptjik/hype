<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import { getLocale } from '$lib/i18n'
// AUTH
import { signIn, useSession } from '$lib/auth/client'
// TYPES
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()
let { hub } = data

// TODO There's a flash where the login is visible before the session is loaded.
// This is because the session is loaded in the layout, and the layout is loaded
// before the page. We need to find a way to load the session before the page is
// loaded, or to hide the login button until the session is loaded.
const session = useSession()

const hubName = hub.i18n?.[getLocale()]?.nameShort ?? hub.i18n?.en.nameShort

const hubStyleClasses = hub.isCore
  ? 'text-[9rem] md:tracking-widest transition-all duration-500'
  : hub.code === 'hkghostsigns'
    ? 'text-[6rem]/[6rem] mb-8 translate-y-20 w-[245px] md:text-center md:mx-auto md:w-[800px]'
    : 'text-4xl'
const buttonStyleClasses = hub.isCore
  ? 'fixed bottom-20 left-1/2 -translate-x-1/2 w-320:bottom-40 w-512:bottom-64 transition-all duration-500'
  : hub.code === 'hkghostsigns'
    ? 'absolute left-1/2 -translate-x-1/2 top-[calc(50%+240px)] w-192:top-[calc(50%+160px)]'
    : ''
</script>

{#if !$session.isPending && !$session.data?.user}
  <div
    class="absolute left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
  >
    <h1
      class="{hubStyleClasses} font-bold text-white [text-shadow:0_0_8px_rgba(0,0,0,0.8)]"
      style="font-family: 'Tilt Neon', sans-serif"
    >
      {@html hubName}
    </h1>
  </div>
  <button
    class="z-50 mx-auto flex w-[230px] flex-row items-center justify-center gap-3 rounded-2xl border-none bg-white py-3 text-neutral-900 {buttonStyleClasses}"
    onclick={() => {
      signIn
        .social({
          provider: 'google',
          callbackURL: window.location.origin + '/'
        })
        .catch((error) => {
          console.error('🔴 OAuth: Sign-in error:', error);
        });
    }}
  >
    <img src="/google.svg" alt="Google logo" class="h-6 w-6 opacity-100">
    {m.preauth__continue_with_google()}
  </button>
{/if}
