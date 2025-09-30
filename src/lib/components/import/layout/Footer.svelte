<script lang="ts">
// SVELTE
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';

const importCtx = getImportCtx();

// Get step info for progress display
function getStepInfo(step: string) {
  const stepMap: Record<string, { currentStep: number; totalSteps: number }> = {
    'column-mapping': { currentStep: 1, totalSteps: 9 },
    'user-matching': { currentStep: 2, totalSteps: 9 },
    'layer-matching': { currentStep: 3, totalSteps: 9 },
    'property-matching': { currentStep: 4, totalSteps: 9 },
    translation: { currentStep: 5, totalSteps: 9 },
    'geo-lookup': { currentStep: 6, totalSteps: 9 },
    'feature-resolution': { currentStep: 7, totalSteps: 9 },
    finished: { currentStep: 9, totalSteps: 9 }
  };

  return stepMap[step] || { currentStep: 1, totalSteps: 9 };
}

// TYPES
type Props = {
  onCancel?: () => void;
  onBack?: () => void;
  onContinue?: () => void;
  onResolve?: () => void;
  continueDisabled?: boolean;
  resolveDisabled?: boolean;
  continueLabel?: string;
  resolveLabel?: string;
  showResolveButton?: boolean;
};

let {
  onCancel,
  onBack,
  onContinue,
  onResolve,
  continueDisabled = false,
  resolveDisabled = false,
  continueLabel = 'Continue',
  resolveLabel = 'Resolve',
  showResolveButton = false
}: Props = $props();

const currentStep = $derived(importCtx.getCurrentStep());
const showBackButton = $derived(
  currentStep !== 'column-mapping' && currentStep !== 'finished'
);
const showCancelButton = $derived(currentStep === 'column-mapping');
</script>

<div class="flex-none p-4">
  <div class="relative flex items-center">
    <!-- Progress Indicator (centered against parent) -->
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="flex items-center gap-2 text-sm text-base-content/60">
        <div class="flex gap-1">
          {#each Array(getStepInfo(currentStep).totalSteps) as _, i}
            {@const stepInfo = getStepInfo(currentStep)}
            <div
              class="h-2 w-4 rounded-full {i < stepInfo.currentStep
                ? 'bg-primary'
                : 'bg-base-300'}">
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Action Buttons (right) -->
    <div class="ml-auto flex gap-2">
      {#if showCancelButton && onCancel}
        <button class="btn btn-ghost" onclick={onCancel}>Cancel</button>
      {/if}

      {#if showBackButton && onBack}
        <button class="btn btn-ghost" onclick={onBack}>Back</button>
      {/if}

      {#if showResolveButton && onResolve}
        <button class="btn btn-warning" onclick={onResolve} disabled={resolveDisabled}>
          {resolveLabel}
        </button>
      {/if}

      {#if onContinue}
        <button
          class="btn btn-primary"
          onclick={onContinue}
          disabled={continueDisabled}>
          {continueLabel}
        </button>
      {/if}
    </div>
  </div>
</div>
