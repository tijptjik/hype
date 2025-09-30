<script lang="ts">
// TYPES
type Props = {
  title: string;
  subtitle?: string;
  showProgress?: boolean;
  currentStep?: number;
  totalSteps?: number;
};

let {
  title,
  subtitle,
  showProgress = true,
  currentStep = 1,
  totalSteps = 9
}: Props = $props();
</script>

<div class="mb-4">
  <div class="flex items-center justify-between">
    <div class="flex-1">
      <h3 class="card-title text-lg">{title}</h3>
      {#if subtitle}
        <p class="mt-1 text-sm text-base-content/70">{subtitle}</p>
      {/if}
    </div>

    {#if showProgress}
      <div class="flex items-center gap-2 text-sm text-base-content/60">
        <div class="flex gap-1">
          {#each Array(totalSteps) as _, i}
            <div
              class="h-2 w-4 rounded-full {i < currentStep
                ? 'bg-primary'
                : 'bg-base-300'}">
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
