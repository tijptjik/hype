// THIRD-PARTY
import { dndState } from '@thisux/sveltednd'
import type { DraggableOptions } from '@thisux/sveltednd'

type PreviewOptions = {
  config: DraggableOptions<{ id: string }>
  active: boolean
}

/** Show a noninteractive card snapshot beneath the pointer for library-owned drags.
 * @param node Original option card, kept in place by Svelte DnD.
 * @param initial Library configuration and reactive source ownership.
 * @returns Update and cleanup hooks for the card's drag-preview lifecycle.
 * @remarks The preview registers no form controls, takes no pointer events and never
 * mutates ordering. Pointer and HTML5 drops remain owned by @thisux/sveltednd.
 */
export function optionDragPreview(
  node: HTMLElement,
  initial: PreviewOptions,
): {
  update(options: PreviewOptions): void
  destroy(): void
} {
  let options = initial
  const document = node.ownerDocument
  const ownerWindow = document.defaultView
  if (!ownerWindow) return { update() {}, destroy() {} }
  const view = ownerWindow
  let preview: HTMLElement | null = null
  let portal: HTMLDivElement | null = null
  let pointer: number | null = null
  let origin = { x: 0, y: 0 }
  let position = { x: 0, y: 0 }
  let width = 0
  let frame = 0

  /** Position the card below the cursor, with its horizontal centre at the pointer. */
  function paint(): void {
    frame = 0
    if (!preview) return
    preview.style.setProperty(
      'transform',
      `translate3d(${position.x - width / 2}px, ${position.y + 12}px, 0)`,
      'important',
    )
  }

  /** Freeze the rendered subgrid geometry before moving the snapshot out of its grid. */
  function create(): void {
    if (preview) return
    const rect = node.getBoundingClientRect()
    const computed = view.getComputedStyle(node)
    const clone = node.cloneNode(true) as HTMLElement
    portal = document.createElement('div')
    portal.className =
      'bits-theme pointer-events-none fixed inset-0 z-[250] overflow-hidden'
    portal.setAttribute('aria-hidden', 'true')
    portal.inert = true
    portal.style.font = computed.font
    portal.style.color = computed.color
    // Preserve the source's hub theme without moving or remounting any live controls.
    for (const property of computed) {
      if (property.startsWith('--'))
        portal.style.setProperty(property, computed.getPropertyValue(property))
    }
    width = rect.width
    for (const [index, child] of [...node.children].entries()) {
      const copy = clone.children[index]
      if (!(child instanceof HTMLElement) || !(copy instanceof HTMLElement)) continue
      const box = child.getBoundingClientRect()
      copy.style.position = 'absolute'
      copy.style.left = `${box.left - rect.left - node.clientLeft}px`
      copy.style.top = `${box.top - rect.top - node.clientTop}px`
      copy.style.width = `${box.width}px`
      copy.style.height = `${box.height}px`
      copy.style.margin = '0'
    }
    clone.querySelectorAll('input, [data-option-drop-indicator]').forEach(element => {
      element.remove()
    })
    // A visual clone must not duplicate remote-form registration or drag selectors.
    for (const element of [clone, ...clone.querySelectorAll('*')]) {
      for (const attribute of [...element.attributes]) {
        if (
          ['id', 'name', 'form', 'autofocus', 'tabindex'].includes(attribute.name) ||
          (attribute.name.startsWith('data-') && attribute.name !== 'data-placeholder')
        )
          element.removeAttribute(attribute.name)
      }
    }
    clone.classList.remove(
      'bits-project-field-card__value-item--dragging',
      'bits-project-field-card__value-item--drag-over',
      'drop-left',
      'drop-right',
    )
    for (const [property, value] of Object.entries({
      position: 'relative',
      display: 'block',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: '1',
      margin: '0',
      transform: 'none',
      'pointer-events': 'none',
      'border-color': 'var(--color-primary)',
      background: `linear-gradient(${computed.backgroundColor}, ${computed.backgroundColor}), var(--form-workspace, var(--color-panel))`,
      'box-shadow':
        '0 16px 48px color-mix(in oklab, var(--color-foreground) 25%, transparent)',
    }))
      clone.style.setProperty(property, value, 'important')
    clone.dataset.optionDragPreview = ''
    preview = clone
    portal.append(clone)
    document.body.append(portal)
    paint()
  }

  /** Drop all preview resources on release, library reset, cancellation or unmount. */
  function stop(): void {
    pointer = null
    view.cancelAnimationFrame(frame)
    frame = 0
    portal?.remove()
    portal = null
    preview = null
    view.removeEventListener('pointermove', move)
    view.removeEventListener('pointerup', stop)
    view.removeEventListener('pointercancel', cancel)
    view.removeEventListener('dragover', drag)
    view.removeEventListener('dragend', stop)
    view.removeEventListener('drop', stop)
    view.removeEventListener('blur', stop)
  }

  /** Paint at most once per frame while retaining native hit-testing beneath the preview. */
  function move(event: PointerEvent): void {
    if (event.pointerId !== pointer) return
    position = { x: event.clientX, y: event.clientY }
    if (!preview && Math.hypot(position.x - origin.x, position.y - origin.y) >= 4)
      create()
    if (preview && !frame) frame = view.requestAnimationFrame(paint)
  }

  /** Keep a native HTML5 drag preview synchronized after pointer events are canceled. */
  function drag(event: DragEvent): void {
    position = { x: event.clientX, y: event.clientY }
    create()
    if (!frame) frame = view.requestAnimationFrame(paint)
  }

  /** Ignore the browser's pointer cancellation when it switches to a native drag. */
  function cancel(): void {
    if (dndState.dragInput !== 'html5') stop()
  }

  /** Start only after the installed DnD action has accepted this card's handle. */
  function start(event: PointerEvent): void {
    if (
      options.config.disabled ||
      !dndState.isDragging ||
      dndState.sourceContainer !== options.config.container
    )
      return
    if (
      !(event.target instanceof Element) ||
      !options.config.handle ||
      !event.target.closest(options.config.handle)
    )
      return
    stop()
    pointer = event.pointerId
    origin = position = { x: event.clientX, y: event.clientY }
    view.addEventListener('pointermove', move)
    view.addEventListener('pointerup', stop)
    view.addEventListener('pointercancel', cancel)
    view.addEventListener('dragover', drag)
    view.addEventListener('dragend', stop)
    view.addEventListener('drop', stop)
    view.addEventListener('blur', stop)
  }

  /** Replace the native screenshot so the same full card preview serves both input paths. */
  function nativeStart(event: DragEvent): void {
    if (event.defaultPrevented || dndState.sourceContainer !== options.config.container)
      return
    const blank = document.createElement('canvas')
    blank.width = blank.height = 1
    event.dataTransfer?.setDragImage(blank, 0, 0)
    drag(event)
  }

  node.addEventListener('pointerdown', start)
  node.addEventListener('dragstart', nativeStart)
  return {
    update(next): void {
      options = next
      if (!next.active) stop()
    },
    destroy(): void {
      stop()
      node.removeEventListener('pointerdown', start)
      node.removeEventListener('dragstart', nativeStart)
    },
  }
}
