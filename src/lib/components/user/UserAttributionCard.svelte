<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Eye, PlusCircle } from '@steeze-ui/heroicons';
import { formatDate } from '$lib';
import Image from '../common/Image.svelte';

type Props = {
  type: 'contributor' | 'publisher';
};

// STATE : PROPS
let cardProps: Props = $props();

// STATE : FORM
let { form } = cardProps.form;
let userId = $derived(
  cardProps.type === 'contributor' ? $form.contributorId : $form.publisherId
);
let date = $derived(cardProps.type === 'contributor' ? $form.createdAt : $form.publishedAt);

// STATE : PROMISE
let userPromise = $state<Promise<{ name: string; image: string }>>();

// FETCH USER
async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

// EFFECT : UPDATE PROMISE ON USER ID CHANGE
$effect(() => {
  if (!userId) return;
  userPromise = fetchUser(userId);
});
</script>

{#await userPromise}
  <div
    class="flex  min-w-[200px] items-center gap-3 rounded-lg bg-base-200/40 p-3 backdrop-blur-sm transition-all duration-200">
    <div class="min-h-12 loading loading-spinner loading-md"></div>
  </div>
{:then user }
  <div
    class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/40 p-3 backdrop-blur-sm ">
    <Image
      src={user.image}
      alt={user.name}
      class="h-12 w-12 rounded-full object-cover" />
    <div class="flex flex-col">
      <span class="font-medium">{user.name}</span>
      <div class="flex items-center gap-1 text-sm text-base-content/60">
        <Icon
          src={cardProps.type === 'contributor' ? PlusCircle : Eye}
          class="h-4 w-4" />
        <span>{formatDate(date)}</span>
      </div>
    </div>
  </div>
{:catch error}
  <div
    class="flex min-w-[200px] items-center gap-3 rounded-lg bg-error/10 p-3 backdrop-blur-sm transition-all duration-200">
    <span class="text-sm text-error">{error.message}</span>
  </div>
{/await}
