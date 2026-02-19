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
import { PencilSquare, InformationCircle, Check, Heart } from '@steeze-ui/heroicons'

// PROPS
let { viewport }: { viewport: HTMLElement } = $props()

// CONTEXT
const cardCtx = getCardCtx()
const appCtx = getAppCtx()

// STATE
let editedAttribution = $state(appCtx.getUser()!.attribution || '')
let originalAttribution = $state(appCtx.getUser()!.attribution || '')
let editing = $state(!(appCtx.getUser()!.attribution || '').trim())
let timer: ReturnType<typeof setTimeout>
let isInfoExpanded = $state(false)
let isSaveSuccess = $state(false)
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

// HANDLERS
async function saveAttribution() {
  if (cardCtx.getError() === m.validation__attribution_required()) {
    cardCtx.resetError()
  }

  if (!appCtx.user?.id) {
    console.warn('User session not found. Cannot update attribution.')
    return
  }

  try {
    const response = await fetch(`/api/users/${appCtx.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribution: editedAttribution }),
    })

    if (response.ok) {
      if (appCtx.user) {
        appCtx.user.attribution = editedAttribution
        cardCtx.setAttribution(editedAttribution)
        originalAttribution = editedAttribution
        isSaveSuccess = true
        setTimeout(() => {
          isSaveSuccess = false
        }, 2000)
      }
    } else {
      console.error('Failed to update attribution:', await response.text())
    }
  } catch (error) {
    console.error('Error updating attribution:', error)
  }

  editing = false
}

function cancelEdit() {
  editedAttribution = originalAttribution
  editing = false
}

function startEdit() {
  originalAttribution = editedAttribution
  editing = true
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveAttribution()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  const input = document.getElementById('attribution-input')
  const checkmarkButton = document.getElementById('checkmark-button')
  const pencilButton = document.getElementById('pencil-button')

  if (
    input &&
    !input.contains(target) &&
    checkmarkButton &&
    !checkmarkButton.contains(target) &&
    pencilButton &&
    !pencilButton.contains(target)
  ) {
    cancelEdit()
  }
}

// Click outside action
function clickOutside(node: HTMLElement, handler: (event: MouseEvent) => void) {
  const handleClick = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) {
      handler(event)
    }
  }

  document.addEventListener('click', handleClick, true)

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true)
    },
  }
}

// Common button handler to prevent event bubbling
function handleButtonClick(e: MouseEvent, callback: () => void) {
  e.preventDefault()
  e.stopPropagation()
  callback()
}

// Common button classes
const buttonClasses = 'btn btn-ghost btn-sm h-8 w-8 p-0'

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

// Ensure editing state is re-evaluated if session changes (e.g. login/logout)
$effect(() => {
  const currentAttr = appCtx.user?.attribution || ''
  editedAttribution = currentAttr
  originalAttribution = currentAttr
  editing = !currentAttr.trim()
})
</script>

<div
  bind:this={infoElement}
  class="cursor-transparent pointer-events-auto flex flex-row items-center justify-between gap-2 bg-black px-3 pt-4 w-100:px-6"
  onclick={toggleInfo}
>
  <Icon src={InformationCircle} class="h-6 w-6 stroke-[2px] opacity-0" />
  <p class="flex gap-2 text-center font-bold uppercase tracking-wider">
    <Icon src={Heart} theme="solid" class="h-6 w-6 stroke-[2px] text-primary" />
    {m.add_photos__thank_you()}
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

<div
  class="pointer-events-auto flex w-full items-center gap-4 bg-black px-3 pb-2 pt-4 w-100:px-6"
>
  <p
    class="flex w-20 min-w-0 flex-grow items-center overflow-hidden font-bold uppercase text-base-content/30 w-80:w-28"
  >
    Name to credit
  </p>
  <div
    class="flex h-full w-full min-w-0 flex-grow items-center justify-center gap-2 overflow-hidden"
  >
    {#if !editedAttribution.trim() || editing}
      <input
        type="text"
        id="attribution-input"
        class="h-8 min-w-0 flex-grow rounded-none border-0 border-b-2 border-gray-400 bg-transparent text-center text-xl font-semibold leading-8 text-white caret-white placeholder:text-gray-400 focus:border-primary focus:outline-none"
        placeholder={m.photo_credit_input_placeholder()}
        bind:value={editedAttribution}
        onkeydown={handleKeydown}
        use:clickOutside={handleClickOutside}
      >
    {:else}
      <p class="min-w-0 flex-grow text-center text-xl font-semibold text-white">
        {editedAttribution}
      </p>
    {/if}
    <div class="swap {editing || isSaveSuccess ? '' : 'swap-active'}">
      <button
        id="checkmark-button"
        class="{buttonClasses} swap-off"
        onclick={(e) => handleButtonClick(e, startEdit)}
      >
        <Icon
          src={Check}
          class="h-5 w-5 stroke-[2px] {isSaveSuccess
            ? 'text-success'
            : 'text-primary'} transition-all duration-300 hover:text-primary/80"
        />
      </button>
      <button
        id="pencil-button"
        class="{buttonClasses} swap-on"
        onclick={(e) => handleButtonClick(e, saveAttribution)}
      >
        <Icon
          src={PencilSquare}
          class="h-5 w-5 stroke-[2px] text-base-content/80 hover:text-base-content"
        />
      </button>
    </div>
  </div>
</div>
