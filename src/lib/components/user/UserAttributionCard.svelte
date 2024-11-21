<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Eye, PlusCircle } from '@steeze-ui/heroicons';
import { formatDate } from '$lib';
import { fade, scale } from 'svelte/transition';

type Props = {
  userId: string;
  date: string;
  type: 'contributor' | 'publisher';
};

// STATE : PROPS
let { userId, date, type }: Props = $props();

// STATE : DATA
let user = $state<{
  name: string;
  image: string;
} | null>(null);

// EFFECTS : FETCH USER
$effect(async () => {
  if (!userId) return;

  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch user');
    user = await response.json();
  } catch (err) {
    console.error('Error fetching user:', err);
    user = null;
  }
});
</script>

<div
  class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/40 p-3 backdrop-blur-sm transition-all duration-200"
  in:scale={{ duration: 150 }}
  out:scale={{ duration: 300 }}>
  <img src={user?.image} alt={user?.name} class="h-12 w-12 rounded-full object-cover" />
  <div class="flex flex-col">
    <span class="font-medium">{user?.name ?? 'Loading...'}</span>
    <div class="flex items-center gap-1 text-sm text-base-content/60">
      <Icon src={type === 'contributor' ? PlusCircle : Eye} class="h-4 w-4" />
      <span>{formatDate(date)}</span>
    </div>
  </div>
</div>
