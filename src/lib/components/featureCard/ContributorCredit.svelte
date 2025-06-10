<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { debouncedUpdateUserAttribution } from '$lib/client/services/user';
// ICONS
import { PencilSquare } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getAppCtx } from '$lib/context/app.svelte';

// CONTEXT
const cardCtx = getFeatureCardContext();
const appCtx = getAppCtx();

// STATE
let inputElement: HTMLInputElement | null = $state(null);
let editedAttribution = $state(
  appCtx.getUser()?.attribution || m.tidy_level_hawk_belong()
);
let originalAttribution = $state('');
let editing = $state(!(appCtx.getUser()?.attribution || '').trim());

// HANDLERS
function handleEditMode(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  originalAttribution = editedAttribution;
  // Clear attribution if it's the placeholder value
  if (editedAttribution === m.tidy_level_hawk_belong()) {
    editedAttribution = '';
  }
  editing = true;
  setTimeout(() => {
    inputElement?.focus();
  }, 0);
}

async function handleAttributionSubmit() {
  if (editedAttribution.trim()) {
    editing = false;
    await handleAttributionUpdate(editedAttribution);
  }
}

function handleAttributionCancel() {
  editedAttribution = originalAttribution;
  editing = false;
}

const handleAttributionUpdate = async (value: string) => {
  if (cardCtx.getError() === m.validation__attribution_required()) {
    cardCtx.resetError();
  }

  await debouncedUpdateUserAttribution(
    appCtx.user!.id,
    value,
    // onSuccess
    (attribution) => {
      appCtx.getUser()!.attribution = attribution;
      cardCtx.setAttribution(attribution);
    },
    // onError
    (error) => {
      console.error('Error updating attribution:', error);
    }
  );
};

// Ensure editing state is re-evaluated if session changes (e.g. login/logout)
$effect(() => {
  const currentAttr = appCtx.getUser()?.attribution || '';
  editedAttribution = currentAttr;
  editing = !currentAttr.trim();
});
</script>

<p
  class="bg-black px-3 pt-4 text-center font-bold uppercase tracking-wider text-neutral-400 w-100:px-6">
  {m.new_feature__thank_you()}
</p>

<div class="pointer-events-auto w-full bg-black px-3 pt-2 caret-transparent md:px-6">
  {#if !editedAttribution.trim() || editing}
    <div class="mb-2 px-12">
      <label
        for="attribution-input"
        class="text mb-3 block text-center text-base-content">
        {m.add_feature__credit_prompt()}
      </label>
      <input
        type="text"
        id="attribution-input"
        bind:this={inputElement}
        class="input input-bordered w-full bg-black text-center font-bold caret-white focus:outline-none"
        placeholder={m.photo_credit_input_placeholder()}
        bind:value={editedAttribution}
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Tab') {
            handleAttributionSubmit();
          } else if (e.key === 'Escape') {
            handleAttributionCancel();
          }
        }}
        onblur={handleAttributionSubmit} />
    </div>
  {:else}
    <p class="text-center text-base-content">
      {m.add_feature__credit_prompt()}
    </p>
    <div
      class="group flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 pt-2 text-center caret-transparent"
      onclick={handleEditMode}>
      <p class="text-center text-xl font-semibold text-white">{editedAttribution}</p>
      <button
        class="btn btn-ghost btn-sm flex h-8 items-center justify-center rounded-lg focus:outline-none group-hover:bg-base-300 group-focus:text-primary group-focus:outline-none group-active:bg-base-200">
        <Icon
          src={PencilSquare}
          class="h-5 w-5 stroke-1 text-base-content/80 group-hover:text-base-content" />
      </button>
    </div>
  {/if}
</div>
