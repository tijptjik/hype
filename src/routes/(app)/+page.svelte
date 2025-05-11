<script lang="ts">
// QUERY
import { page } from '$app/stores';
import { m } from '$lib/i18n';
// AUTH
import { signIn } from '@auth/sveltekit/client';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

// CONTEXT
const { session } = $page.data;

const mapCtx = getMapContext();
if (!session) {
  mapCtx.startCircularFlight([114.157, 22.319304]);
}
</script>

{#if !session}
  <div
    class="absolute left-1/2 top-[60%] z-50 -translate-x-1/2 -translate-y-1/2 text-left">
    <h1 class="mb-4 text-6xl font-bold text-white">GHOST MAPPERS</h1>
    <button class="btn bg-white text-neutral-900" onclick={() => signIn('google')}>
      <img src="/google.svg" alt="Google logo" class="mr-2 h-4 w-4" />
      {m.preauth__continue_with_google()}
    </button>
  </div>
{/if}
