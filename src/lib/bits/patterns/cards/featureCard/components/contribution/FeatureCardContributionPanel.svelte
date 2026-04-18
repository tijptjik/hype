<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import type { Component, Snippet } from 'svelte'
// BITS
import { Icon } from '$lib/bits'
// ICONS
import Heart from 'virtual:icons/lucide/heart'
import Info from 'virtual:icons/lucide/info'
import X from 'virtual:icons/lucide/x'

let {
  viewport,
  eyebrow,
  title,
  helperText = null,
  eyebrowIcon = null,
  infoItems,
  titleIcon = Heart,
  titleIconClass = 'text-primary',
  children,
}: {
  viewport: HTMLElement
  eyebrow: string
  title: string
  helperText?: string | null
  eyebrowIcon?: Component | null
  infoItems: string[]
  titleIcon?: Component | null
  titleIconClass?: string
  children: Snippet
} = $props()

let isInfoExpanded = $state(false)
let panelElement = $state<HTMLElement | null>(null)
let measuredHeight = $state(0)

function measureInfoBoxHeight(): number {
  if (!panelElement) return 0

  const originalWidth = panelElement.offsetWidth
  const tempContainer = document.createElement('div')
  tempContainer.className = 'overflow-hidden bg-black'
  tempContainer.style.position = 'absolute'
  tempContainer.style.visibility = 'hidden'
  tempContainer.style.top = '-9999px'
  tempContainer.style.left = '-9999px'
  tempContainer.style.width = `${originalWidth}px`
  tempContainer.style.maxWidth = `${originalWidth}px`
  tempContainer.style.minWidth = `${originalWidth}px`

  const tempList = document.createElement('ul')
  tempList.className =
    'grid gap-2 border-t border-white/10 bg-black px-5 py-4 text-left text-sm leading-6 text-white/76'

  infoItems.forEach(text => {
    const item = document.createElement('li')
    item.className = 'list-disc ms-5'
    item.textContent = text
    tempList.appendChild(item)
  })

  tempContainer.appendChild(tempList)
  document.body.appendChild(tempContainer)

  const height = tempList.offsetHeight

  document.body.removeChild(tempContainer)
  return height
}

function toggleInfo(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (!isInfoExpanded) {
    measuredHeight = measureInfoBoxHeight()
  }

  isInfoExpanded = !isInfoExpanded
}

function handleSlideStart(): void {
  if (!isInfoExpanded || measuredHeight <= 0) return

  const currentScrollTop = viewport.scrollTop
  const targetScrollTop = currentScrollTop + measuredHeight
  const scrollDuration = 400
  const startTime = performance.now()
  const startScrollTop = currentScrollTop
  const scrollDistance = targetScrollTop - startScrollTop

  function animateScroll(currentTime: number): void {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / scrollDuration, 1)
    const easeOut = 1 - (1 - progress) ** 3

    viewport.scrollTop = startScrollTop + scrollDistance * easeOut

    if (progress < 1) {
      requestAnimationFrame(animateScroll)
    }
  }

  requestAnimationFrame(animateScroll)
}
</script>

<div class="pointer-events-auto w-full shrink-0 bg-black px-3 pb-0 pt-0 w-100:px-6">
  <div bind:this={panelElement} class="overflow-hidden bg-black text-white">
    <button
      type="button"
      class="flex w-full items-start justify-between gap-3 bg-black py-3 text-left"
      onclick={toggleInfo}
    >
      <div
        class="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-white/8"
      >
        {#if titleIcon}
          <Icon src={titleIcon} size="sm" class={titleIconClass} />
        {/if}
      </div>

      <div class="min-w-0 flex-1 text-center">
        {#if eyebrowIcon}
          <div class="flex justify-center">
            <Icon src={eyebrowIcon} size="sm" class="text-white/55" />
          </div>
        {:else}
          <p class="font-mono text-[11px] uppercase tracking-[0.32em] text-white/55">
            {eyebrow}
          </p>
        {/if}
        <h3
          class="mt-2 text-[1.05rem] font-semibold uppercase tracking-[0.16em] text-white"
        >
          {title}
        </h3>
        {#if helperText}
          <p class="mx-auto mt-2 w-full max-w-80 text-sm leading-6 text-white/68">
            {helperText}
          </p>
        {/if}
      </div>

      <div
        class="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-black/25"
      >
        <Icon
          src={isInfoExpanded ? X : Info}
          class="h-6 w-6 text-white/68 transition-colors duration-300"
        />
      </div>
    </button>

    {#if isInfoExpanded}
      <ul
        class="grid gap-2 border-t border-white/10 bg-black px-4 py-2 text-left text-sm leading-6 text-white/76"
        transition:slide={{ duration: 400 }}
        onintrostart={handleSlideStart}
      >
        {#each infoItems as item}
          <li class="ms-5 list-disc">{item}</li>
        {/each}
      </ul>
    {/if}

    <div class="border-t border-white/10 bg-black">{@render children()}</div>
  </div>
</div>
