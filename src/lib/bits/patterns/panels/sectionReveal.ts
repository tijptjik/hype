// SVELTE
import { getContext, setContext } from 'svelte'

type SectionReveal = (section: HTMLElement) => void
const key = Symbol('panel-section-reveal')

/**
 * Provides panel-local behavior for sections opened by the user.
 * @param reveal - Scroll callback owned by the containing panel.
 * @returns Nothing.
 */
export function setSectionReveal(reveal: SectionReveal): void {
  setContext(key, reveal)
}

/** Returns an optional containing panel's reveal callback. @returns Panel-local reveal behavior. */
export function getSectionReveal(): SectionReveal | undefined {
  return getContext<SectionReveal | undefined>(key)
}

/**
 * Scrolls an expanded section just far enough to fit, without hiding its header.
 * @param container - The panel's own scrolling viewport.
 * @param section - Expanded section, including its header.
 * @param reducedMotion - Whether to skip smooth scrolling.
 * @returns Nothing.
 * @remarks Tall sections stop at the viewport top. Other panels and the page never scroll.
 */
export function revealPanelSection(
  container: HTMLElement | undefined,
  section: HTMLElement,
  reducedMotion: boolean,
): void {
  if (!container?.contains(section)) return
  const viewport = container.getBoundingClientRect()
  const bounds = section.getBoundingClientRect()
  const visualViewport = window.visualViewport
  const top = Math.max(
    viewport.top + container.clientTop,
    visualViewport?.offsetTop ?? 0,
  )
  const bottom = Math.min(
    viewport.top + container.clientTop + container.clientHeight,
    visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : window.innerHeight,
  )
  const distance = Math.min(bounds.bottom - bottom, bounds.top - top)
  if (distance <= 0) return
  container.scrollTo({
    top: container.scrollTop + distance,
    behavior: reducedMotion ? 'instant' : 'smooth',
  })
}
