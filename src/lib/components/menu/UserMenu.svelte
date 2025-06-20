<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// AUTH
import { signIn, useSession } from '$lib/auth/client';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';

const session = useSession();
const appCtx = getAppCtx();
</script>

{#if $session.data?.user}
  <div class="flex items-center gap-2 w-full">
    <div class="grid h-10 w-10 px-2">
      <button
        onclick={() => appCtx.togglePanel('settings')}
        transition:fade={{ duration: 300 }}
        class="btn btn-ghost btn-sm col-start-1 col-end-2 row-start-1 row-end-2 h-12 min-h-0 w-12 rounded-full p-0">
        <div class="avatar">
          <div class="w-10 rounded-full">
            <img
              alt="Avatar"
              src={$session.data?.user?.image}
              referrerpolicy="no-referrer" />
          </div>
        </div>
      </button>
    </div>
  </div>
{:else}
  <button
    draggable="false"
    class="btn btn-primary"
    onclick={() => signIn.social({ provider: 'google', callbackURL: '/' })}>
    {m.navbar__signin()}
  </button>
{/if}
