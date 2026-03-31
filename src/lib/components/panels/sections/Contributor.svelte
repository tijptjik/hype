<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import Trophy from 'virtual:icons/lucide/trophy'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import Section from '$lib/components/panels/common/Section.svelte'
// TYPES
import type { PanelProps } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()

// PROPS
let { ...panelProps }: PanelProps = $props()

// STATE
let showSuccessIndicator = $state(false)
let successTimer: ReturnType<typeof setTimeout>

onDestroy(() => {
  clearTimeout(successTimer)
})

// HANDLERS
const handleAttributionChange = (target: HTMLInputElement) => {
  const value = target.value

  appCtx.setUserAttribution(
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
  icon="/contributor.svg"
  position="right"
>
  <div
    class="my-2 ml-5 flex flex-row items-center gap-2 rounded-l-md rounded-r-none bg-base-200"
  >
    <input
      name="attribution"
      type="text"
      class="input m-0 h-12 w-full rounded-l-md rounded-r-none border-0 bg-base-200 pl-6.5 pr-10 text-sm placeholder:text-base-content/40 focus:border-none focus:outline-none"
      placeholder={m.settings_contributor_placeholder()}
      value={appCtx.getUser()?.attribution}
      oninput={({ target }) => handleAttributionChange(target as HTMLInputElement)}
      onkeydown={handleKeydown}
    >
    <div class="relative mr-8 grid h-6 w-6 place-items-center stroke-1">
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
