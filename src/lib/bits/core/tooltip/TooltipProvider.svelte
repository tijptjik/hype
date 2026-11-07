<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// BITS-UI
import { Popover } from 'bits-ui'
// TOOLTIP POLICY
import { repeatsVisibleTooltipLabel } from './tooltipLabel.js'

const uid = $props.id()
const contentId = `${uid}-tooltip`
let anchor = $state<HTMLElement | null>(null)
let text = $state('')
let open = $state(false)
let pendingAnchor: HTMLElement | null = null
let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

/** Dismiss help without moving focus or changing the underlying control. */
function dismiss(): void {
  clearTimeout(openTimer)
  clearTimeout(closeTimer)
  pendingAnchor = null
  open = false
}

/** Find the nearest explicitly labelled control, including nested icons.
 * @param target Event target. @returns The tooltip anchor, if any.
 */
function findAnchor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  // Older markup must not produce a second, native copy of its visible label.
  const native = target.closest<HTMLElement>('[title]')
  if (native && repeatsVisibleTooltipLabel(native, native.getAttribute('title') ?? ''))
    native.removeAttribute('title')
  return target.closest<HTMLElement>('[data-tooltip]')
}

/** Show the shared themed help for a control without adding a layout wrapper.
 * @param target Element carrying the help text. @returns Nothing.
 */
function show(target: HTMLElement | null): void {
  clearTimeout(closeTimer)
  const label = target?.getAttribute('data-tooltip')?.trim()
  if (
    !target ||
    !label ||
    target.closest('.bits-tooltip__trigger') ||
    target.getAttribute('aria-expanded') === 'true' ||
    repeatsVisibleTooltipLabel(target, label)
  ) {
    dismiss()
    return
  }
  anchor = target
  text = label
  open = true
}

/** Wait for sustained hover or focus before showing help.
 * @param target Element requesting help. @returns Nothing.
 */
function scheduleShow(target: HTMLElement | null): void {
  clearTimeout(closeTimer)
  if (target && (target === pendingAnchor || (target === anchor && open))) return
  dismiss()
  if (!target) return
  pendingAnchor = target
  openTimer = setTimeout(() => {
    pendingAnchor = null
    if (target.isConnected) show(target)
  }, 500)
}

// Keep existing accessible descriptions intact and remove only our own reference.
$effect(() => {
  if (!open || !anchor) return
  const target = anchor
  const ids = new Set(
    (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
  )
  ids.add(contentId)
  target.setAttribute('aria-describedby', [...ids].join(' '))
  const observer = new MutationObserver(() => {
    const label = target.getAttribute('data-tooltip')?.trim()
    if (
      !label ||
      target.getAttribute('aria-expanded') === 'true' ||
      repeatsVisibleTooltipLabel(target, label)
    )
      dismiss()
    else text = label
  })
  observer.observe(target, {
    attributes: true,
    attributeFilter: ['data-tooltip', 'aria-expanded'],
  })
  return () => {
    observer.disconnect()
    const remaining = (target.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(id => id && id !== contentId)
    if (remaining.length) target.setAttribute('aria-describedby', remaining.join(' '))
    else target.removeAttribute('aria-describedby')
  }
})

// Delegate to dynamic controls and portalled menus without changing their DOM or tab order.
onMount(() => {
  const over = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    if (
      event.target instanceof Element &&
      event.target.closest(`#${CSS.escape(contentId)}`)
    ) {
      clearTimeout(closeTimer)
      return
    }
    scheduleShow(findAnchor(event.target))
  }
  const out = (event: PointerEvent): void => {
    if (
      event.relatedTarget instanceof Node &&
      (pendingAnchor ?? anchor)?.contains(event.relatedTarget)
    )
      return
    clearTimeout(openTimer)
    pendingAnchor = null
    // Allow the pointer to cross the small gap and hover readable help.
    closeTimer = setTimeout(dismiss, 120)
  }
  const focus = (event: FocusEvent): void => scheduleShow(findAnchor(event.target))
  const blur = (): void => dismiss()
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') dismiss()
  }
  const scroll = (event: Event): void => {
    if (
      event.target instanceof Node &&
      document.getElementById(contentId)?.contains(event.target)
    )
      return
    dismiss()
  }
  document.addEventListener('pointerover', over)
  document.addEventListener('pointerout', out)
  document.addEventListener('focusin', focus)
  document.addEventListener('focusout', blur)
  document.addEventListener('pointerdown', dismiss)
  document.addEventListener('keydown', key)
  document.addEventListener('scroll', scroll, true)
  window.addEventListener('resize', dismiss)
  return () => {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    document.removeEventListener('pointerover', over)
    document.removeEventListener('pointerout', out)
    document.removeEventListener('focusin', focus)
    document.removeEventListener('focusout', blur)
    document.removeEventListener('pointerdown', dismiss)
    document.removeEventListener('keydown', key)
    document.removeEventListener('scroll', scroll, true)
    window.removeEventListener('resize', dismiss)
  }
})
</script>

<Popover.Root bind:open>
  <Popover.Portal>
    <Popover.Content
      id={contentId}
      role="tooltip"
      class="bits-theme bits-tooltip__content"
      customAnchor={anchor}
      side="top"
      sideOffset={8}
      collisionPadding={16}
      strategy="fixed"
      hideWhenDetached={true}
      trapFocus={false}
      preventScroll={false}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      >{text}</Popover.Content
    >
  </Popover.Portal>
</Popover.Root>
