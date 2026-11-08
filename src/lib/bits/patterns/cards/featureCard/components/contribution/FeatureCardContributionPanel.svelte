<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import type { Component, Snippet } from 'svelte'
// BITS
import { Icon } from '#lib/bits/index.js'
// ICONS
import Heart from 'virtual:icons/proicons/heart'
import Info from 'virtual:icons/proicons/info'
import X from 'virtual:icons/proicons/cancel'

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
  tempContainer.className = 'overflow-hidden bg-(--theme-panel)'
  tempContainer.style.position = 'absolute'
  tempContainer.style.visibility = 'hidden'
  tempContainer.style.top = '-9999px'
  tempContainer.style.left = '-9999px'
  tempContainer.style.width = `${originalWidth}px`
  tempContainer.style.maxWidth = `${originalWidth}px`
  tempContainer.style.minWidth = `${originalWidth}px`

  const tempList = document.createElement('ul')
  tempList.className =
    'grid gap-2 border-t border-border-input bg-(--theme-panel) px-5 py-4 text-left text-sm leading-6 text-muted-foreground'

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

<div
  class="w-100:px-6 pointer-events-auto w-full shrink-0 bg-(--theme-panel) px-3 pt-0 pb-0"
>
  <div
    bind:this={panelElement}
    class="text-base-content overflow-hidden bg-(--theme-panel)"
  >
    <button
      type="button"
      class="flex w-full items-start justify-between gap-3 bg-(--theme-panel) py-3 text-left"
      onclick={toggleInfo}
    >
      <div
        class="bg-base-content/8 flex min-h-10 min-w-10 items-center justify-center rounded-full"
      >
        {#if titleIcon}
          <Icon src={titleIcon} size="sm" class={titleIconClass} />
        {/if}
      </div>

      <div class="min-w-0 flex-1 text-center">
        {#if eyebrowIcon}
          <div class="flex justify-center">
            <Icon src={eyebrowIcon} size="sm" class="text-muted-foreground" />
          </div>
        {:else}
          <p
            class="text-muted-foreground font-mono text-[11px] tracking-[0.32em] uppercase"
          >
            {eyebrow}
          </p>
        {/if}
        <h3
          class="text-base-content mt-2 text-[1.05rem] font-semibold tracking-[0.16em] uppercase"
        >
          {title}
        </h3>
        {#if helperText}
          <p
            class="text-muted-foreground mx-auto mt-2 w-full max-w-80 text-sm leading-6"
          >
            {helperText}
          </p>
        {/if}
      </div>

      <div
        class="bg-base-200 flex min-h-10 min-w-10 items-center justify-center rounded-full"
      >
        <Icon
          src={isInfoExpanded ? X : Info}
          class="text-muted-foreground h-6 w-6 transition-colors duration-300"
        />
      </div>
    </button>

    {#if isInfoExpanded}
      <ul
        class="border-border-input text-muted-foreground grid gap-2 border-t bg-(--theme-panel) px-4 py-2 text-left text-sm leading-6"
        transition:slide={{ duration: 400 }}
        onintrostart={handleSlideStart}
      >
        {#each infoItems as item}
          <li class="ms-5 list-disc">{item}</li>
        {/each}
      </ul>
    {/if}

    <div class="border-border-input border-t bg-(--theme-panel)">
      {@render children()}
    </div>
  </div>
</div>
