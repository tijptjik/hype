<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// NAVIGATION
import { goto } from '$app/navigation';
// I18N
import { m } from '$lib/i18n';
// AUTH
import { signIn, signOut, useSession } from '$lib/auth/client';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Power } from '@steeze-ui/heroicons';

const session = useSession();
let showPower = $state(false);
</script>

{#if $session.data?.user}
  <div
    class="grid h-10 w-10 px-2"
    onmouseenter={() => (showPower = true)}
    onmouseleave={() => (showPower = false)}>
    {#if showPower}
      <button
        transition:fade={{ duration: 300 }}
        class="btn btn-ghost btn-sm col-start-1 col-end-2 row-start-1 row-end-2 h-12 min-h-0 w-12 rounded-full p-0"
        onclick={async () => {
          await signOut({
            fetchOptions: {
              onSuccess: () => {
                goto('/'); // redirect to login page
              }
            }
          });
        }}>
        <Icon src={Power} class="h-5 w-5 stroke-2" />
      </button>
    {:else}
      <button
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
    {/if}
  </div>
{:else}
  <button
    draggable="false"
    class="btn btn-primary"
    onclick={() => signIn.social({ provider: 'google', callbackURL: '/' })}>
    {m.navbar__signin()}
  </button>
{/if}
