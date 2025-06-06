<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  ChevronDown,
  ChevronUp,
  ExclamationCircle,
  CheckCircle,
  XCircle,
} from '@steeze-ui/heroicons';
// TYPES
import type { Task } from '$lib/types';
import type { IconSource } from '@steeze-ui/svelte-icon';
// I18N
import { m } from '$lib/i18n';

// PROPS
let { task, rejectActions, acceptActions, onAction } = $props<{
  task: Task;
  rejectActions: Array<{
    label: string;
    icon: IconSource;
    action: string;
    onHoverClass: string;
  }>;
  acceptActions: Array<{
    label: string;
    icon: IconSource;
    action: string;
    onHoverClass: string;
  }>;
  onAction: (action: string, e: Event) => void;
}>();

// STATE
let isExpanded = $state(false);
let showReasonModal = $state(false);
let reviewReason = $state('');
// COMPUTED
let isReviewed = $derived(task.reviewOutcome !== null);
let reviewerName = $derived(task.reviewer?.name);
let hasLongReason = $derived(task.reviewReason && task.reviewReason.length > 20);
let reviewIcon = $derived(task.reviewOutcome === 'accepted' ? CheckCircle : XCircle);

// ACTIONS
function handleAction(action: string, e: Event) {
  if (action === 'reject') {
    showReasonModal = true;
  } else {
    onAction(action, e);
  }
}

function handleReject(e: Event) {
  e.preventDefault();
  onAction('reject', e, reviewReason);
  showReasonModal = false;
  reviewReason = '';
}

function toggleExpand() {
  isExpanded = !isExpanded;
}

function closeExpand(e: MouseEvent) {
  if (isExpanded) {
    isExpanded = false;
  }
}
</script>

<div class="flex items-center gap-4" onclick={closeExpand}>
  {#if isReviewed}
    <div class="flex flex-col gap-2 px-3 py-2">
      <div class="flex items-center gap-4 shrink-0">
        {#if reviewerName}
          <div class="flex items-center gap-2 rounded-lg bg-base-200">
            <img src={task.reviewer?.image} class="h-8 w-8 rounded-full" />
            <p class="rounded-xl bg-base-200 pl-1 pr-2 text-sm text-base-content">{reviewerName}</p>
          </div>
        {/if}
        {#if task.reviewReason}
          <div class="relative flex items-center rounded-lg bg-base-200 h-8 shrink-2"
          onmouseenter={() => isExpanded = true}
          onmouseleave={() => isExpanded = false}
          >
            <Icon src={ExclamationCircle} class="h-8 w-8 text-base-content" />
            <p class="uppercase text-base-content p-2">{m.mad_fresh_swan_trap()}</p>
            <p class="text-sm/8 text-base-content max-w-[200px] line-clamp-1 {isExpanded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300 p-2 uppercase font-mono overflow-clip">
              {task.reviewReason}
            </p>
            {#if hasLongReason}
              <button
                class="btn btn-ghost btn-xs"
                onclick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}>
                <Icon src={isExpanded ? ChevronUp : ChevronDown} class="h-4 w-4" />
              </button>
            {/if}
            {#if isExpanded}
              <div class="absolute left-0 top-full mt-2 w-full bg-base-200 rounded-lg shadow-lg p-2 z-30" in:fade={{ duration: 300 }} out:fade={{ duration: 300 }}>
                <p class="text-sm text-base-content whitespace-pre-wrap p-2 leading-8">
                  {task.reviewReason}
                </p>
              </div>
            {/if}
          </div>
        {/if}
        <div class="flex items-center rounded-lg bg-base-200 h-8 shrink-0">
          <Icon
            src={reviewIcon}
            class="h-8 w-8 {task.reviewOutcome === 'accepted'
              ? 'text-success'
              : 'text-error'}" />
          <p class="uppercase text-base-content p-2">{m.mad_fresh_swan_trip()}</p>
          <p class="font-mono text-sm uppercase text-neutral-content p-2">
            {task.reviewAction?.replaceAll('-', ' ')}
          </p>
        </div>
      </div>
    </div>
  {:else}
    {#each rejectActions as action}
      <button
        class="btn btn-ghost btn-sm hover:bg-transparent hover:{action.onHoverClass}"
        onclick={(e) => handleAction(action.action, e)}>
        <Icon src={action.icon} class="h-4 w-4" />
        {action.label}
      </button>
    {/each}
    {#if acceptActions.length > 0}
      <div class="divider divider-horizontal"></div>
      {#each acceptActions as action}
        <button
          class="btn btn-ghost btn-sm hover:bg-transparent hover:{action.onHoverClass}"
          onclick={(e) => handleAction(action.action, e)}>
          <Icon src={action.icon} class="h-4 w-4" />
          {action.label}
        </button>
      {/each}
    {/if}
  {/if}
</div>

{#if showReasonModal}
  <div class="modal modal-open">
    <div class="modal-box border-2 border-[#4987E2] bg-black shadow-[0_0_15px_rgba(0,0,255,0.5)]">
      <h3 class="mb-4 text-lg font-bold text-center pb-2">Reason for rejection</h3>
      <div class="form-control">
        <textarea
          class="textarea textarea-bordered h-24 bg-black text-white focus:outline-none focus:ring-0"
          placeholder="For internal use only..."
          bind:value={reviewReason}>
        </textarea>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost hover:bg-transparent hover:text-error" onclick={() => (showReasonModal = false)}>Cancel</button>
        <button class="btn transition-all duration-300 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300" onclick={handleReject}>Reject</button>
      </div>
    </div>
  </div>
{/if}
