<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// AUTH
import { signIn, useSession } from '$lib/auth/client';

const session = useSession();
</script>

{#if !$session.isPending && !$session.data?.user}
  <div
    class="absolute left-1/2 top-[60%] z-50 -translate-x-1/2 -translate-y-1/2 text-left">
    <h1 class="mb-4 text-6xl font-bold text-white">GHOST MAPPERS</h1>
    <button
      class="btn bg-white text-neutral-900"
      onclick={() => {
        signIn
          .social({
            provider: 'google',
            callbackURL: window.location.origin + '/'
          })
          .catch((error) => {
            console.error('🔴 OAuth: Sign-in error:', error);
          });
      }}>
      <img src="/google.svg" alt="Google logo" class="mr-2 h-4 w-4" />
      {m.preauth__continue_with_google()}
    </button>
  </div>
{/if}
