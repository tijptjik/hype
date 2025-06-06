<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Eye, PlusCircle } from '@steeze-ui/heroicons';
import { formatDate } from '$lib';
import { formatDistanceToNow } from 'date-fns';
import Image from '../common/Image.svelte';
import User from '../forms/actions/User.svelte';

// TYPES
interface UserData {
  id: string;
  name: string | null;
  image: string | null;
  [key: string]: any;
}

type Props = {
  userId: string | null;
  date: string | undefined;
  type?: 'contributor' | 'publisher' | 'imageContributor';
  class?: string;
  friendlyDate?: boolean;
};

// STATE : PROPS
let {
  userId,
  date,
  type = 'imageContributor',
  class: className = '',
  friendlyDate = true
}: Props = $props();

// STATE : DERIVED
let formattedDate = $derived(
  date
    ? friendlyDate
      ? formatDistanceToNow(new Date(date), { addSuffix: true })
      : formatDate(date)
    : ''
);

// STATE : PROMISE
let userPromise: Promise<UserData> = $derived(fetchUser(userId));

// FETCH USER
async function fetchUser(id: string | null): Promise<UserData> {
  if (!id) throw new Error('Invalid user ID');
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('Failed to fetch user');
  return await res.json();
}
</script>

<!-- <div class="opacity-0 transition-opacity duration-200 group-hover:opacity-100"> -->
<div>
  {#if userId}
    {#await userPromise}
      <div
        class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/30 p-3 backdrop-blur-sm transition-all duration-200">
        <div class="loading loading-spinner loading-md min-h-12"></div>
      </div>
    {:then user}
      <div
        class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/60 p-3 backdrop-blur-sm">
        <Image
          src={user.image || ''}
          alt={user.name || 'Unknown User'}
          class="h-12 w-12 rounded-full object-cover" />
        <div class="flex flex-col">
          <span class="font-medium">{user.name ?? 'Unknown User'}</span>
          <div class="flex items-center gap-1 text-sm text-base-content/60">
            <Icon
              src={type.toLowerCase().includes('contributor') ? PlusCircle : Eye}
              class="h-4 w-4" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
    {:catch error}
      <div
        class="flex min-w-[200px] items-center gap-3 rounded-lg bg-error/10 p-3 backdrop-blur-sm transition-all duration-200">
        <span class="text-sm text-error">{error.message}</span>
      </div>
    {/await}
  {/if}
</div>
