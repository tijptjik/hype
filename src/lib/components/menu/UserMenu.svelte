<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// AUTH
import { signIn, useSession } from '$lib/auth/client';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { Panel } from '$lib/enums';

const session = useSession();
const appCtx = getAppCtx();
</script>

{#if !appCtx.isPanelOpen(Panel.settings)}
  {#if $session.data?.user}
    <div class="flex flex-shrink-0 flex-grow-0 items-center gap-2">
      <div class="h-12 w-12">
        <button
          onclick={() => appCtx.togglePanel(Panel.settings)}
          transition:fade={{ duration: 300 }}
          class="btn btn-ghost btn-sm h-12 w-12 rounded-full p-0">
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
      onclick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
      transition:fade={{ duration: 300 }}>
      {m.navbar__signin()}
    </button>
  {/if}
{/if}
