<script lang="ts">
// SVELTE
import { page } from '$app/stores';
import { fade } from 'svelte/transition';
// NAVIGATION
import { navigate } from '$lib/navigation';
// I18N
import { m } from '$lib/i18n';
// AUTH
import { signIn, signOut } from '@auth/sveltekit/client';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Power } from '@steeze-ui/heroicons';

const { session } = $page.data;
let showPower = $state(false);
</script>

{#if session}
  <div
    class="grid h-10 w-12 overflow-hidden px-2"
    onmouseenter={() => (showPower = true)}
    onmouseleave={() => (showPower = false)}>
    {#if showPower}
      <div
        transition:fade={{ duration: 300 }}
        class="col-start-1 col-end-2 row-start-1 row-end-2 h-10 w-10">
        <button
          class="m-0 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 p-0"
          onclick={() => {
            signOut();
            navigate('/');
          }}>
          <Icon src={Power} class="h-5 w-5 stroke-2 text-primary" />
        </button>
      </div>
    {:else}
      <div
        transition:fade={{ duration: 300 }}
        class="col-start-1 col-end-2 row-start-1 row-end-2">
        <div class="avatar">
          <div class="w-10 rounded-full">
            <img alt="Avatar" src={session.user?.image} referrerpolicy="no-referrer" />
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <a draggable="false" class="btn btn-primary" onclick={() => signIn('google')}>
    {m.navbar__signin()}
  </a>
{/if}
