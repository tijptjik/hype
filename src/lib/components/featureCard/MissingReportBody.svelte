<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import Heart from 'virtual:icons/lucide/heart'
import InformationCircle from 'virtual:icons/lucide/info'

// PROPS
let { viewport }: { viewport: HTMLElement } = $props()

// CONTEXT
const cardCtx = getCardCtx()

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
    m.report_missing__curatorial_review(),
    m.report_missing__initial_instruction(),
    m.report_missing__add_photo_instructions(),
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

// HANDLERS
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
  class="pointer-events-auto flex h-auto min-h-12 shrink-0 basis-auto flex-col overflow-y-auto bg-black pb-1"
>
  <div
    class="cursor-transparent pointer-events-auto flex flex-row items-center justify-between gap-2 bg-black px-3 pt-4 hover:cursor-pointer w-100:px-6"
    onclick={toggleInfo}
  >
    <Icon src={InformationCircle} class="h-6 w-6 stroke-[2px] opacity-0" />
    <p class="flex gap-2 text-center font-bold uppercase tracking-wider">
      <Icon src={Heart} theme="solid" class="h-6 w-6 stroke-[2px] text-primary" />
      {m.report_missing__preface()}
    </p>
    <Icon src={InformationCircle} class="h-6 w-6 stroke-[2px] hover:text-white/70" />
  </div>

  {#if isInfoExpanded}
    <ul
      class="cursor-transparent line-height pointer-events-auto w-full list-inside list-disc gap-2 bg-black px-3 py-2 text-base-content transition-all duration-300 md:px-6"
      transition:slide={{ duration: 400 }}
      onintrostart={handleSlideStart}
    >
      <li class="px-3">{m.report_missing__curatorial_review()}</li>
      <li class="px-3 pt-2">{m.report_missing__initial_instruction()}</li>
      <li class="px-3 pt-2">{m.report_missing__add_photo_instructions()}</li>
    </ul>
  {/if}

  <div class="pointer-events-auto bg-black px-3 pb-1 pt-4 w-100:px-6">
    <textarea
      id="missing-reason"
      bind:value={cardCtx.userData.missingReason}
      class="w-full rounded-md border-2 border-primary/60 bg-base-300 p-3 text-white caret-white focus:outline-none focus:placeholder:opacity-0"
      style="
        -webkit-appearance: none; 
        -webkit-tap-highlight-color: transparent;
        -webkit-text-fill-color: white;
        caret-color: white;
        "
      rows="3"
      placeholder={m.report_missing__placeholder()}
    ></textarea>
  </div>
</div>
