<script lang="ts">
import { goto } from '$app/navigation'
// ICONS
import { Icon } from '#lib/bits/index.js'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronRight from 'virtual:icons/proicons/chevron-right'

type Props = {
  title: string
  description?: string
  isOpen: boolean
  onToggle: (event: MouseEvent) => void
  onNavigate?: (event: MouseEvent) => void
  href?: string | null
}

let { title, description, isOpen, onToggle, onNavigate, href = null }: Props = $props()

const onNavigateToIndex = (event: MouseEvent): void => {
  if (onNavigate) {
    onNavigate(event)
    return
  }

  if (!href) return

  event.preventDefault()
  void goto(href)
}

const onPrimaryAction = (event: MouseEvent): void => {
  if (onNavigate) {
    onNavigateToIndex(event)
    return
  }

  if (href) {
    onNavigateToIndex(event)
    return
  }

  onToggle(event)
}
</script>

<div class="bits-theme flex flex-1 items-start">
  <button
    type="button"
    class="flex shrink-0 items-center justify-center pr-3 pl-4 focus:ring-0 focus:outline-none"
    onclick={onToggle}
    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${title} section`}
  >
    <Icon src={isOpen ? ChevronDown : ChevronRight} class="h-[1.125rem] w-[1.125rem]" />
  </button>
  <button
    type="button"
    class="w-full text-left focus:ring-0 focus:outline-none"
    onclick={onPrimaryAction}
    aria-label={`${title} section header`}
  >
    <div class="w-full space-y-0.5">
      <div class="flex w-full items-center">
        <h3 class="text-sm tracking-widest uppercase">{title}</h3>
      </div>
      {#if description}
        <p class="text-base-content/60 text-left text-sm">{description}</p>
      {/if}
    </div>
  </button>
</div>
