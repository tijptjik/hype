<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
import { fade } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { Icon } from '#lib/bits/index.js'
import Trophy from 'virtual:icons/proicons/trophy'
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

// CONTEXT

// PROPS
let {
  attribution,
  onAttribution,
  ...panelProps
}: PanelProps & {
  attribution?: string | null
  onAttribution: (
    attribution: string,
    onSuccess?: (attribution: string) => void,
    onError?: (error: unknown) => void,
  ) => void | Promise<void>
} = $props()

// STATE
let showSuccessIndicator = $state(false)
let successTimer: ReturnType<typeof setTimeout>

onDestroy(() => {
  clearTimeout(successTimer)
})

// HANDLERS
const handleAttributionChange = (target: HTMLInputElement) => {
  const value = target.value

  onAttribution(
    value,
    // onSuccess
    () => {
      showSuccessIndicator = true
      clearTimeout(successTimer)
      successTimer = setTimeout(() => {
        showSuccessIndicator = false
      }, 2500)
    },
    // onError
    error => {
      console.error('Failed to save attribution:', error)
      showSuccessIndicator = false
    },
  )
}

const handleKeydown = () => {
  // Immediately hide success indicator when user starts typing
  showSuccessIndicator = false
  clearTimeout(successTimer)
}
</script>

<Section
  title={m.settings_contributor_title()}
  iconGraphicClass="scale-125 origin-bottom-right mr-1"
  icon={Trophy}
  {...panelProps}
>
  <div
    class="mx-6 mt-2 mb-6 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
  >
    <input
      name="attribution"
      type="text"
      class="m-0 h-12 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
      placeholder={m.settings_contributor_placeholder()}
      value={attribution}
      oninput={({ target }) => handleAttributionChange(target as HTMLInputElement)}
      onkeydown={handleKeydown}
    >
    <div class="relative mr-3 grid h-6 w-6 shrink-0 place-items-center stroke-1">
      {#if showSuccessIndicator}
        <div
          class="col-start-1 row-start-1 text-success"
          in:fade={{ duration: 300 }}
          out:fade={{ duration: 300 }}
        >
          <Icon src={CheckCircle} class="h-6 w-6" />
        </div>
      {:else}
        <div
          class="col-start-1 row-start-1 text-base-content/60"
          in:fade={{ duration: 800 }}
          out:fade={{ duration: 300 }}
        >
          <Icon src={Trophy} class="h-6 w-6" />
        </div>
      {/if}
    </div>
  </div>
</Section>
