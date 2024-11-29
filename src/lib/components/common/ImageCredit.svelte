<script lang="ts">
import { formatDistanceToNow } from 'date-fns';
// LIB
import { formatDate } from '$lib';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Eye, PlusCircle, InformationCircle } from '@steeze-ui/heroicons';
import Image from '../common/Image.svelte';
// TYPES
import type { User } from '$lib/types';
// TYPES
type Props = {
  userId?: string;
  date?: string;
};

// STATE : PROPS
let { userId, date }: { userId: string; date: string } = $props();

console.log('date', date);

// STATE : DERIVED
let formattedDate = $derived(formatDistanceToNow(new Date(date), { addSuffix: true }));

// STATE : PROMISE
let userPromise = $state<Promise<User>>();

// STATE :: EFFECT : UPDATE PROMISE ON USER ID CHANGE
$effect(() => {
  if (!userId) return;
  userPromise = fetchUser(userId);
});

// UTILITY : FETCH USER
async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}
</script>

<!-- Attribution Card -->
<div class="group relative z-30">
  <!-- Credits Label -->
  <div
    class="absolute bottom-0 right-0 flex items-center justify-center opacity-70 transition-opacity duration-200 group-hover:opacity-0">
    <button class="btn btn-circle">
      <Icon src={InformationCircle} class="h-6 w-6" />
    </button>
  </div>
  <!-- Attribution Card -->
  <div class="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
    {#if userId}
      {#await userPromise}
        <div
          class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/70 p-3 backdrop-blur-sm transition-all duration-200">
          <div class="loading loading-spinner loading-md min-h-12"></div>
        </div>
      {:then user}
        <!-- <div
          class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/70 p-3 backdrop-blur-sm">
          <Image
            src={user.image}
            alt={user.name}
            class="h-12 w-12 rounded-full object-cover" />
          <div class="flex flex-col">
            <span class="font-medium">{user.name}</span>
            <div class="flex items-center gap-1 text-sm text-base-content/60">
              <Icon src={PlusCircle} class="h-4 w-4" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </div> -->
      {:catch error}
        <div
          class="flex min-w-[200px] items-center gap-3 rounded-lg bg-error/10 p-3 backdrop-blur-sm transition-all duration-200">
          <span class="text-sm text-error">{error.message}</span>
        </div>
      {/await}
    {/if}
  </div>
</div>
