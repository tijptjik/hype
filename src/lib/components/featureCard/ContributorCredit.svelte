<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { PencilSquare, Check } from '@steeze-ui/heroicons';

// CONTEXT
const cardCtx = getCardCtx();
const appCtx = getAppCtx();

// STATE
let editedAttribution = $state(appCtx.getUser()!.attribution || '');
let originalAttribution = $state(appCtx.getUser()!.attribution || '');
let editing = $state(!(appCtx.getUser()!.attribution || '').trim());
let isSaveSuccess = $state(false);

// HANDLERS
async function saveAttribution() {
  if (cardCtx.getError() === m.validation__attribution_required()) {
    cardCtx.resetError();
  }

  if (!appCtx.user?.id) {
    console.warn('User session not found. Cannot update attribution.');
    return;
  }

  try {
    const response = await fetch(`/api/users/${appCtx.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribution: editedAttribution })
    });

    if (response.ok) {
      if (appCtx.user) {
        appCtx.user.attribution = editedAttribution;
        cardCtx.setAttribution(editedAttribution);
        originalAttribution = editedAttribution;
        isSaveSuccess = true;
        setTimeout(() => {
          isSaveSuccess = false;
        }, 2000);
      }
    } else {
      console.error('Failed to update attribution:', await response.text());
    }
  } catch (error) {
    console.error('Error updating attribution:', error);
  }

  editing = false;
}

function cancelEdit() {
  editedAttribution = originalAttribution;
  editing = false;
}

function startEdit() {
  originalAttribution = editedAttribution;
  editing = true;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveAttribution();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const input = document.getElementById('attribution-input');
  const checkmarkButton = document.getElementById('checkmark-button');
  const pencilButton = document.getElementById('pencil-button');

  if (
    input &&
    !input.contains(target) &&
    checkmarkButton &&
    !checkmarkButton.contains(target) &&
    pencilButton &&
    !pencilButton.contains(target)
  ) {
    cancelEdit();
  }
}

// Click outside action
function clickOutside(node: HTMLElement, handler: (event: MouseEvent) => void) {
  const handleClick = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) {
      handler(event);
    }
  };
  document.addEventListener('click', handleClick, true);
  return {
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
}

// Common button handler to prevent event bubbling
function handleButtonClick(e: MouseEvent, callback: () => void) {
  e.preventDefault();
  e.stopPropagation();
  callback();
}

// Common button classes
const buttonClasses = 'btn btn-ghost btn-sm h-8 w-8 p-0';

// Ensure editing state is re-evaluated if session changes (e.g. login/logout)
$effect(() => {
  const currentAttr = appCtx.user?.attribution || '';
  editedAttribution = currentAttr;
  originalAttribution = currentAttr;
  editing = !currentAttr.trim();
});
</script>

<div
  class="pointer-events-auto flex w-full items-center gap-4 bg-black px-3 pb-2 pt-4 w-100:px-6">
  <p
    class="flex w-20 min-w-0 flex-grow items-center overflow-hidden font-bold uppercase text-base-content/30 w-80:w-28">
    Name to credit
  </p>
  <div
    class="flex h-full w-full min-w-0 flex-grow items-center justify-center gap-2 overflow-hidden">
    {#if !editedAttribution.trim() || editing}
      <input
        type="text"
        id="attribution-input"
        class="h-8 min-w-0 flex-grow rounded-none border-0 border-b-2 border-gray-400 bg-transparent text-center text-xl font-semibold leading-8 text-white caret-white placeholder:text-gray-400 focus:border-primary focus:outline-none"
        placeholder={m.photo_credit_input_placeholder()}
        bind:value={editedAttribution}
        onkeydown={handleKeydown}
        use:clickOutside={handleClickOutside} />
    {:else}
      <p class="min-w-0 flex-grow text-center text-xl font-semibold text-white">
        {editedAttribution}
      </p>
    {/if}
    <div class="swap {editing || isSaveSuccess ? '' : 'swap-active'}">
      <button
        id="checkmark-button"
        class="{buttonClasses} swap-off"
        onclick={(e) => handleButtonClick(e, startEdit)}>
        <Icon
          src={Check}
          class="h-5 w-5 stroke-[2px] {isSaveSuccess
            ? 'text-success'
            : 'text-primary'} transition-all duration-300 hover:text-primary/80" />
      </button>
      <button
        id="pencil-button"
        class="{buttonClasses} swap-on"
        onclick={(e) => handleButtonClick(e, saveAttribution)}>
        <Icon
          src={PencilSquare}
          class="h-5 w-5 stroke-[2px] text-base-content/80 hover:text-base-content" />
      </button>
    </div>
  </div>
</div>
