<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// BITS-UI
import { Popover } from 'bits-ui'

const uid = $props.id()
const contentId = `${uid}-tooltip`
let anchor = $state<HTMLElement | null>(null)
let text = $state('')
let open = $state(false)
let closeTimer: ReturnType<typeof setTimeout> | undefined

/** Dismiss help without moving focus or changing the underlying control. */
function dismiss(): void {
  clearTimeout(closeTimer)
  open = false
}

/** Find the nearest explicitly labelled control, including nested icons.
 * @param target Event target. @returns The tooltip anchor, if any.
 */
function findAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-tooltip]')
    : null
}

/** Check whether the help only repeats a fully visible label.
 * @param target Tooltip anchor. @param label Proposed help. @returns Whether help is redundant.
 * @remarks Keep labels for icon-only and clipped controls; innerText excludes hidden labels.
 */
function repeatsVisibleLabel(target: HTMLElement, label: string): boolean {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()
  if (normalize(target.innerText ?? '') !== normalize(label)) return false
  return ![target, ...target.querySelectorAll<HTMLElement>('*')].some(
    element =>
      element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight,
  )
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
    repeatsVisibleLabel(target, label)
  ) {
    dismiss()
    return
  }
  anchor = target
  text = label
  open = true
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
      repeatsVisibleLabel(target, label)
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
    show(findAnchor(event.target))
  }
  const out = (event: PointerEvent): void => {
    if (event.relatedTarget instanceof Node && anchor?.contains(event.relatedTarget))
      return
    // Allow the pointer to cross the small gap and hover readable help.
    closeTimer = setTimeout(dismiss, 120)
  }
  const focus = (event: FocusEvent): void => show(findAnchor(event.target))
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
