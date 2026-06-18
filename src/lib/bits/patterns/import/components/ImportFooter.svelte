<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { ImportFooterProps } from './importLayout.types'

let {
  onBack,
  onContinue,
  onSecondary,
  backLabel = 'Back',
  continueDisabled = false,
  secondaryDisabled = false,
  continueLabel = 'Continue',
  secondaryLabel = '',
  leftMetaText = '',
  rightMetaText = '',
  showPips = true,
  currentStep = 1,
  totalSteps = 8,
  class: className = '',
}: ImportFooterProps = $props()
</script>

<div class={`flex-none px-5 py-4 ${className}`}>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
    <div class="flex justify-start gap-2">
      {#if onBack}
        <Button
          text={backLabel}
          style="ghost"
          color="light"
          size="md"
          onClick={onBack}
        />
      {/if}
      {#if leftMetaText}
        <div
          class="flex items-center rounded-lg border border-base-content/10 bg-base-100/60 px-3 text-sm text-base-content/70"
        >
          {leftMetaText}
        </div>
      {/if}
    </div>

    <div class="flex items-center justify-center gap-2 text-sm text-base-content/60">
      {#if showPips}
        <div class="flex gap-1">
          {#each Array(totalSteps) as _, i}
            {@const activeIndex = Math.max(1, currentStep)}
            <div
              class="h-2 w-4 rounded-full {i < activeIndex
                ? 'bg-primary'
                : 'bg-base-300'}"
            ></div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex justify-end gap-2">
      {#if onSecondary && secondaryLabel}
        <Button
          text={secondaryLabel}
          style="soft"
          color="neutral"
          size="md"
          onClick={onSecondary}
          disabled={secondaryDisabled}
        />
      {/if}

      {#if rightMetaText}
        <div class="flex items-center rounded-lg px-3 text-sm text-base-content/70">
          {rightMetaText}
        </div>
      {/if}

      {#if onContinue}
        <Button
          text={continueLabel}
          style="none"
          color="primary"
          size="md"
          onClick={onContinue}
          disabled={continueDisabled}
        />
      {/if}
    </div>
  </div>
</div>
