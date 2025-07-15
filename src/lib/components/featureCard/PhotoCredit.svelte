<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ICONS
import { PencilSquare } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
import { getAppCtx } from '$lib/context/app.svelte';

const cardCtx = getCardCtx();
const appCtx = getAppCtx();

let editedAttribution = $state(appCtx.getUser()!.attribution || '');
let editing = $state(!(appCtx.getUser()!.attribution || '').trim());
let timer: ReturnType<typeof setTimeout>;

// CONTEXT
const debounceAndUpdateAttribution = (value: string) => {
  clearTimeout(timer);
  if (cardCtx.getError() === m.validation__attribution_required()) {
    cardCtx.resetError();
  }
  editedAttribution = value; // Keep UI responsive

  timer = setTimeout(async () => {
    if (!appCtx.user?.id) {
      console.warn('User session not found. Cannot update attribution.');
      return;
    }
    try {
      const response = await fetch(`/api/users/${appCtx.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribution: value })
      });
      if (response.ok) {
        if (appCtx.user) {
          appCtx.user.attribution = value;
          cardCtx.setAttribution(value);
        }
      } else {
        console.error('Failed to update attribution:', await response.text());
        // Optionally, handle error, e.g., show a message to the user
      }
    } catch (error) {
      console.error('Error updating attribution:', error);
      // Optionally, handle error
    }
  }, 500);
};

// Ensure editing state is re-evaluated if session changes (e.g. login/logout)
$effect(() => {
  const currentAttr = appCtx.user?.attribution || '';
  editedAttribution = currentAttr;
  editing = !currentAttr.trim();
});
</script>

<p
  class="bg-black px-3 pt-4 text-center font-bold uppercase tracking-wider text-neutral-400 w-100:px-6">
  {m.add_photos__thank_you()}
</p>

<ul
  class="line-height w-full list-inside list-disc gap-2 bg-black px-3 py-2 text-base-content md:px-6">
  <li class="px-3">
    {m.photo_credit_curatorial_review()}
  </li>
  <li class="px-3 pt-2">
    {m.photo_credit_initial_instruction()}
  </li>
  <li class="px-3 pt-2">
    {m.photo_credit_ensure_right_to_share()}
  </li>
</ul>

<div class="pointer-events-auto w-full bg-black px-3 pt-2 md:px-6">
  {#if !editedAttribution.trim() || editing}
    <div class="mb-2 px-12">
      <label
        for="attribution-input"
        class="text mb-3 block text-center text-base-content">
        {m.photo_credit_credited_as()}
      </label>
      <input
        type="text"
        id="attribution-input"
        class="input input-bordered w-full bg-gray-800 text-white placeholder:text-gray-400"
        placeholder={m.photo_credit_input_placeholder()}
        bind:value={editedAttribution}
        oninput={({ target }) =>
          debounceAndUpdateAttribution((target as HTMLInputElement).value)} />
    </div>
  {:else}
    <p class="text-center text-base-content">
      {m.photo_credit_credited_as()}
    </p>
    <div class="flex w-full items-center justify-center gap-2 pt-2 text-center">
      <p class="text-center text-xl font-semibold text-white">{editedAttribution}</p>
      <button
        class="btn btn-ghost btn-sm h-8 w-8 p-0"
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          editing = true;
        }}>
        <Icon
          src={PencilSquare}
          class="h-5 w-5 stroke-1 text-base-content/80 hover:text-base-content" />
      </button>
    </div>
  {/if}
</div>
