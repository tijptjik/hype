<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  ChevronDown,
  ChevronUp,
  ExclamationCircle,
  CheckCircle,
  XCircle
} from '@steeze-ui/heroicons';
// TYPES
import type { Task } from '$lib/types';
import type { IconSource } from '@steeze-ui/svelte-icon';

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
let isReviewed = $derived(task?.reviewOutcome !== null);
let reviewerName = $derived(task?.reviewer?.name);
let hasLongReason = $derived(task?.reviewReason && task?.reviewReason?.length > 20);
let reviewIcon = $derived(task?.reviewOutcome === 'accepted' ? CheckCircle : XCircle);

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
      <div class="flex shrink-0 items-center gap-4">
        {#if reviewerName}
          <div class="flex items-center gap-2 rounded-lg">
            <img src={task.reviewer?.image} class="h-8 w-8 rounded-full" />
            <p class="rounded-xl pl-1 pr-2 text-sm font-bold text-base-content">
              {reviewerName}
            </p>
          </div>
        {/if}
        {#if task?.reviewReason}
          <div
            class="shrink-2 relative flex h-8 items-center rounded-lg"
            onmouseenter={() => (isExpanded = true)}
            onmouseleave={() => (isExpanded = false)}>
            <Icon src={ExclamationCircle} class="h-8 w-8 text-base-content" />
            <p class="p-2 uppercase text-base-content">{m.mad_fresh_swan_trap()}</p>
            <p
              class="line-clamp-1 max-w-[200px] text-sm/8 text-base-content {isExpanded
                ? 'opacity-0'
                : 'opacity-100'} overflow-clip p-2 font-mono uppercase transition-opacity duration-300">
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
              <div
                class="absolute left-0 top-full z-30 mt-2 w-full rounded-lg p-2 shadow-lg"
                in:fade={{ duration: 300 }}
                out:fade={{ duration: 300 }}>
                <p
                  class="text whitespace-pre-wrap rounded-xl bg-glass-salmon p-3 leading-8 text-base-content text-glass-salmon-dark">
                  {task.reviewReason}
                </p>
              </div>
            {/if}
          </div>
        {/if}
        <div class="flex h-8 shrink-0 items-center rounded-lg">
          <Icon
            src={reviewIcon}
            class="h-9 w-9 stroke-2 {task?.reviewOutcome === 'accepted'
              ? 'text-glass-accepted'
              : 'text-glass-rejected'}" />
          <p
            class="tilt-neon-watermark text p-2 font-mono font-bold uppercase opacity-100">
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
        <Icon src={action.icon} class="h-6 w-6 stroke-2" />
        {action.label}
      </button>
    {/each}
    {#if acceptActions.length > 0}
      <div class="divider divider-horizontal mx-0"></div>
      {#each acceptActions as action}
        <button
          class="tilt-neon-watermark btn btn-ghost btn-sm hover:bg-transparent hover:{action.onHoverClass}"
          onclick={(e) => handleAction(action.action, e)}>
          <Icon src={action.icon} class="h-6 w-6 stroke-2" />
          {action.label}
        </button>
      {/each}
    {/if}
  {/if}
</div>

{#if showReasonModal}
  <div class="modal modal-open">
    <div
      class="modal-box border-2 border-[#4987E2] shadow-[0_0_15px_rgba(0,0,255,0.5)]">
      <h3 class="mb-4 pb-2 text-center text-lg font-bold">
        {m.north_level_niklas_tap()}
      </h3>
      <div class="form-control">
        <textarea
          class="textarea textarea-bordered h-24 bg-black text-white focus:outline-none focus:ring-0"
          placeholder={m.placeholder__internal_use_only()}
          bind:value={reviewReason}>
        </textarea>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-ghost hover:bg-transparent hover:text-error"
          onclick={() => (showReasonModal = false)}>{m.cancel()}</button>
        <button
          class="btn bg-base-400 uppercase transition-all duration-300 hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300"
          onclick={handleReject}>{m.alive_north_albatross_lead()}</button>
      </div>
    </div>
  </div>
{/if}

<style>
.tilt-neon-watermark {
  font-family: 'Tilt Neon', sans-serif;
  font-optical-sizing: auto;
  font-weight: 400;
  font-style: normal;
  font-variation-settings:
    'XROT' 0,
    'YROT' 0;
}
</style>
