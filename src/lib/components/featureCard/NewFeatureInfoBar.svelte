<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import InformationCircle from 'virtual:icons/lucide/info'
import Heart from 'virtual:icons/lucide/heart'

// PROPS
let { viewport }: { viewport: HTMLElement } = $props()

// CONTEXT
const appCtx = getAppCtx()

// STATE
let isInfoExpanded = $state(false)
let infoElement: HTMLElement
let measuredHeight = $state(0)

// PRE-MEASUREMENT
function measureInfoBoxHeight(): number {
  if (!infoElement) return 0

  const originalWidth = infoElement.offsetWidth

  // Create measurement structure with real content
  const tempContainer = document.createElement('div')
  tempContainer.className = infoElement.className
  tempContainer.style.position = 'absolute'
  tempContainer.style.visibility = 'hidden'
  tempContainer.style.top = '-9999px'
  tempContainer.style.left = '-9999px'
  tempContainer.style.width = `${originalWidth}px`
  tempContainer.style.maxWidth = `${originalWidth}px`
  tempContainer.style.minWidth = `${originalWidth}px`

  const tempUl = document.createElement('ul')
  tempUl.className =
    'cursor-transparent line-height pointer-events-auto w-full list-inside list-disc gap-2 bg-black px-3 py-2 text-base-content transition-all duration-300 md:px-6'

  const listItems = [
    m.photo_credit_curatorial_review(),
    m.photo_credit_initial_instruction(),
    m.photo_credit_ensure_right_to_share(),
  ]

  listItems.forEach((text, index) => {
    const li = document.createElement('li')
    li.className = index === 0 ? 'px-3' : 'px-3 pt-2'
    li.textContent = text
    tempUl.appendChild(li)
  })

  tempContainer.appendChild(tempUl)
  document.body.appendChild(tempContainer)

  const height = tempUl.offsetHeight

  document.body.removeChild(tempContainer)
  return height
}

let toggleInfo = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()

  if (!isInfoExpanded) {
    measuredHeight = measureInfoBoxHeight()
  }

  isInfoExpanded = !isInfoExpanded
}

// SCROLL MANAGEMENT
function handleSlideStart() {
  if (!isInfoExpanded || !viewport || measuredHeight <= 0) return

  const currentScrollTop = viewport.scrollTop
  const targetScrollTop = currentScrollTop + measuredHeight

  // Synchronized scroll animation (400ms to match slide transition)
  const scrollDuration = 400
  const startTime = performance.now()
  const startScrollTop = currentScrollTop
  const scrollDistance = targetScrollTop - startScrollTop

  function animateScroll(currentTime: number) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / scrollDuration, 1)

    // Ease-out curve
    const easeOut = 1 - (1 - progress) ** 3
    const newScrollTop = startScrollTop + scrollDistance * easeOut

    viewport.scrollTop = newScrollTop

    if (progress < 1) {
      requestAnimationFrame(animateScroll)
    }
  }

  requestAnimationFrame(animateScroll)
}
</script>

<div
  bind:this={infoElement}
  class="cursor-transparent pointer-events-auto flex flex-row items-center justify-between gap-2 bg-black px-3 pt-4 w-100:px-6"
  onclick={toggleInfo}
>
  <Icon src={InformationCircle} class="h-6 w-6 stroke-[2px] opacity-0" />
  <p class="flex gap-2 text-center font-bold uppercase tracking-wider">
    <Icon src={Heart} theme="solid" class="h-6 w-6 stroke-[2px] text-primary" />
    {m.new_feature__thank_you()}
  </p>
  <Icon src={InformationCircle} class="h-6 w-6 stroke-[2px] text-neutral-400" />
</div>

{#if isInfoExpanded}
  <ul
    class="cursor-transparent line-height pointer-events-auto w-full list-inside list-disc gap-2 bg-black px-3 py-2 text-base-content transition-all duration-300 md:px-6"
    transition:slide={{ duration: 400 }}
    onintrostart={handleSlideStart}
  >
    <li class="px-3">{m.photo_credit_curatorial_review()}</li>
    <li class="px-3 pt-2">{m.photo_credit_initial_instruction()}</li>
    <li class="px-3 pt-2">{m.photo_credit_ensure_right_to_share()}</li>
  </ul>
{/if}
