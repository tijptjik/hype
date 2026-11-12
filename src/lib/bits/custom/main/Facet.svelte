<script lang="ts">
import { untrack } from 'svelte'
import { cx } from '#lib/bits/utils.js'
import { FormFacetNav } from '#lib/bits/patterns/forms/formFacetNav/index.js'
import type { MainFacetProps } from './main.types'

let {
  children,
  class: className = '',
  isVisible = true,
  transition = 'none',
  attrs = {},
  previousAction = null,
  nextAction = null,
  centerAction = null,
  fillHeight = false,
  navMode = 'centered',
  contentClass = '',
  bottomClearance = 320,
  extraScroll = 0,
  edgeToEdge = false,
}: MainFacetProps = $props()

const FACET_OVERSCROLL = 96
const FACET_FOOTER_GUTTER = 32

let facetElement = $state<HTMLElement | null>(null)
let innerElement = $state<HTMLDivElement | null>(null)
let bodyElement = $state<HTMLDivElement | null>(null)
let navElement = $state<HTMLDivElement | null>(null)
let bodyMinHeight = $state(0)
let bodyHeight = $state<number | null>(null)
let tailSpacer = $state(0)
let navShellStyle = $state('')
let bodyBottomPadding = $state(0)
let overlayBottomSpace = $state(0)
let isScrolled = $state(false)

const hasFacetNav = $derived(Boolean(previousAction || nextAction || centerAction))
const FACET_BOTTOM_CLEARANCE = 24

const facetClass = $derived(
  [
    'bits-theme bits-main__section',
    fillHeight ? 'bits-main__section--fill-height' : '',
    edgeToEdge ? 'bits-main__section--edge-to-edge' : '',
    transition === 'fade' ? 'bits-main__section--fade' : '',
    transition === 'fade' && isVisible ? 'bits-main__section--active' : '',
    transition === 'fade' && !isVisible ? 'bits-main__section--faded' : '',
    transition !== 'fade' && !isVisible ? 'bits-main__section--hidden' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const innerClass = $derived(
  [
    'bits-main__section-inner',
    fillHeight ? 'bits-main__section-inner--fill-height' : '',
    edgeToEdge ? 'bits-main__section-inner--edge-to-edge' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

const bodyClass = $derived(
  [
    'bits-main__section-body',
    fillHeight ? 'bits-main__section-body--fill-height' : '',
    edgeToEdge ? 'bits-main__section-body--edge-to-edge' : '',
    contentClass,
  ]
    .filter(Boolean)
    .join(' '),
)
const bodyStyle = $derived(
  [
    `--bits-main-section-body-min-height: ${Math.max(0, bodyMinHeight)}px`,
    bodyHeight != null
      ? `--bits-main-section-body-height: ${Math.max(0, bodyHeight)}px`
      : '--bits-main-section-body-height: auto',
    `padding-bottom: ${Math.max(0, bodyBottomPadding)}px`,
    `--facet-overlay-bottom-space: ${overlayBottomSpace}px`,
    // Extra travel must follow the content instead of sitting behind overflowing flex children.
    extraScroll > 0 ? `min-height: ${Math.max(0, bodyMinHeight)}px` : '',
    navMode !== 'centered' && bodyHeight != null
      ? `flex: 0 0 ${Math.max(0, bodyHeight)}px; height: ${Math.max(0, bodyHeight)}px`
      : '',
  ].join('; '),
)
const tailSpacerStyle = $derived(`height: ${Math.max(0, tailSpacer)}px;`)
const navShellClass = $derived(
  cx(
    'fixed z-[120] flex min-h-12 items-center pt-0',
    navMode === 'overlay'
      ? 'pointer-events-none [&_button]:pointer-events-auto'
      : 'pointer-events-auto',
  ),
)
const navContentClass = 'min-h-12 py-0'
const isViewportConstrainedFacet = $derived(navMode !== 'centered')

function getReservedBottomSpace(navHeight: number): number {
  // Overlay navigation does not reserve a blank band below the content.
  if (navMode === 'overlay') return 0
  if (isViewportConstrainedFacet) {
    return Math.max(FACET_BOTTOM_CLEARANCE, navHeight + FACET_FOOTER_GUTTER)
  }

  return Math.max(
    FACET_BOTTOM_CLEARANCE,
    hasFacetNav ? navHeight + FACET_FOOTER_GUTTER : FACET_BOTTOM_CLEARANCE,
    bottomClearance,
  )
}

function isLayoutDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.location.search.includes('debugLayout=1') ||
    window.localStorage.getItem('bits-debug-layout') === '1'
  )
}

function logInnerChildrenHeights(): void {
  if (!isLayoutDebugEnabled()) return
  const inner = innerElement
  if (!inner) return

  console.groupCollapsed('[Main.Facet] inner children heights')
  console.table(
    Array.from(inner.children).map((child, index) => {
      if (!(child instanceof HTMLElement)) {
        return {
          index,
          tag: child.tagName?.toLowerCase?.() ?? 'unknown',
          className: '',
          height: 0,
          clientHeight: 0,
          scrollHeight: 0,
          flex: '',
        }
      }

      const styles = getComputedStyle(child)
      return {
        index,
        tag: child.tagName.toLowerCase(),
        className: child.className,
        height: child.getBoundingClientRect().height,
        clientHeight: child.clientHeight,
        scrollHeight: child.scrollHeight,
        flex: styles.flex,
      }
    }),
  )
  console.groupEnd()
}

/** Measure intrinsic content without retaining a scroll clamp from temporary sizing.
 * @param body Facet content whose minimum height is temporarily released.
 * @returns Natural content height including transformed direct children.
 */
function getBodyContentHeight(body: HTMLDivElement): number {
  const previousInlineMinHeight = body.style.minHeight
  const previousInlineHeight = body.style.height
  const facet = facetElement
  const previousScrollTop = facet?.scrollTop ?? 0

  body.style.minHeight = '0px'
  body.style.height = 'auto'

  try {
    const scrollHeight = Math.ceil(body.scrollHeight)
    if (body.children.length === 0) return scrollHeight

    const bodyTop = body.getBoundingClientRect().top
    let contentHeight = scrollHeight

    // Direct child bounds help when transformed content paints beyond the
    // element's normal flow size, while scrollHeight captures regular overflow.
    for (const child of Array.from(body.children)) {
      if (!(child instanceof HTMLElement)) continue
      const rect = child.getBoundingClientRect()
      contentHeight = Math.max(contentHeight, rect.bottom - bodyTop)
    }
    return Math.ceil(contentHeight)
  } finally {
    body.style.minHeight = previousInlineMinHeight
    body.style.height = previousInlineHeight
    // Releasing the minimum can briefly remove trailing scroll travel and clamp scrollTop.
    // Restore only that measurement-induced clamp; leave unchanged smooth scrolling alone.
    if (facet && facet.scrollTop !== previousScrollTop)
      facet.scrollTo({ top: previousScrollTop, behavior: 'instant' })
  }
}

/** Update footer geometry, optionally retaining content clearance during a resize.
 * @param measureContent Whether to remeasure intrinsic content height.
 * @returns Nothing.
 */
function measureLayout(measureContent = true): void {
  if (!isVisible) return
  const facet = facetElement
  const body = bodyElement
  overlayBottomSpace = 0

  if (!facet || !body) {
    bodyMinHeight = 0
    bodyHeight = edgeToEdge ? 0 : null
    bodyBottomPadding = edgeToEdge
      ? 0
      : isViewportConstrainedFacet
        ? FACET_BOTTOM_CLEARANCE
        : 0
    tailSpacer = edgeToEdge
      ? 0
      : isViewportConstrainedFacet
        ? 0
        : FACET_BOTTOM_CLEARANCE
    navShellStyle = ''
    return
  }

  const availableHeight = facet.clientHeight

  if (edgeToEdge) {
    bodyMinHeight = 0
    bodyHeight = availableHeight
    bodyBottomPadding = 0
    tailSpacer = 0
    navShellStyle = ''
    return
  }

  const navHeight = hasFacetNav && navElement ? navElement.offsetHeight : 0
  const facetRect = facet.getBoundingClientRect()
  const bottomInset =
    Math.max(16, window.innerHeight - facetRect.bottom + 16) +
    (centerAction?.bottomOffset ?? 0)
  // Empty states can center above overlay actions without shortening result lists.
  if (navMode === 'overlay' && hasFacetNav)
    overlayBottomSpace = Math.max(
      0,
      navHeight + bottomInset - (window.innerHeight - facetRect.bottom),
    )
  // Anchor to the facet itself; the navigation shell owns its content gutter.
  const left = Math.max(0, Math.round(facetRect.left))
  const width = Math.max(0, Math.round(facetRect.width))

  // Move only the center action; previous/next navigation remains at the footer.
  const bodyCenter =
    facetRect.top + Math.max(0, availableHeight - getReservedBottomSpace(navHeight)) / 2
  const navCenter = window.innerHeight - bottomInset - navHeight / 2
  navShellStyle =
    hasFacetNav && width > 0
      ? `left: ${left}px; width: ${width}px; bottom: ${bottomInset}px; --facet-center-action-offset: ${Math.min(0, bodyCenter - navCenter)}px;`
      : ''

  // Fixed footer facets constrain the content box, so nested lists cannot grow beneath navigation.
  if (isViewportConstrainedFacet) {
    bodyMinHeight = 0
    bodyHeight = Math.max(0, availableHeight - getReservedBottomSpace(navHeight))
    bodyBottomPadding = 0
    tailSpacer = 0
    return
  }
  if (!measureContent) return
  bodyHeight = null
  bodyBottomPadding = 0
  const bodyContentHeight = getBodyContentHeight(body)
  // Some profiles need actual scroll travel even when their contents fit in the viewport.
  if (extraScroll > 0) {
    bodyMinHeight = bodyContentHeight
    tailSpacer =
      Math.max(0, availableHeight - bodyContentHeight) +
      Math.max(extraScroll, getReservedBottomSpace(navHeight))
    logInnerChildrenHeights()
    return
  }

  const contentHeight = bodyContentHeight + navHeight
  const remainingHeight = Math.max(0, availableHeight - contentHeight)

  // Existing free space counts toward clearance; short lists must not gain artificial scroll travel.
  if (bottomClearance > 0) {
    bodyMinHeight = bodyContentHeight
    tailSpacer = Math.max(remainingHeight, getReservedBottomSpace(navHeight))
    logInnerChildrenHeights()
    return
  }

  if (contentHeight <= availableHeight) {
    const leadSpace = Math.floor(remainingHeight / 2)
    const trailSpace = remainingHeight - leadSpace

    bodyMinHeight = bodyContentHeight + leadSpace
    tailSpacer = isViewportConstrainedFacet
      ? 0
      : trailSpace + getReservedBottomSpace(navHeight)
    logInnerChildrenHeights()
    return
  }

  bodyMinHeight = bodyContentHeight
  tailSpacer = isViewportConstrainedFacet
    ? 0
    : Math.max(
        FACET_BOTTOM_CLEARANCE,
        hasFacetNav ? navHeight + FACET_OVERSCROLL : FACET_BOTTOM_CLEARANCE,
        bottomClearance,
      )
  logInnerChildrenHeights()
}

// Coalesce observer callbacks; keep footer geometry live while content reflow settles.
let layoutFrame: number | null = null
let contentTimer: ReturnType<typeof setTimeout> | null = null
let contentMeasurementPending = false
const CONTENT_RESIZE_SETTLE_MS = 80

/** Queue one layout pass for the next frame.
 * @param measureContent Whether this pass must refresh scroll clearance.
 * @returns Nothing.
 */
function scheduleLayout(measureContent = true): void {
  if (!isVisible) return
  contentMeasurementPending ||= measureContent
  if (layoutFrame !== null) return
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = null
    const refreshContent = contentMeasurementPending
    contentMeasurementPending = false
    measureLayout(refreshContent)
  })
}

/** Keep navigation aligned during resizing and measure content after it settles.
 * @returns Nothing.
 */
function scheduleResizeLayout(): void {
  scheduleLayout(false)
  if (contentTimer !== null) clearTimeout(contentTimer)
  contentTimer = setTimeout(() => {
    contentTimer = null
    scheduleLayout()
  }, CONTENT_RESIZE_SETTLE_MS)
}

$effect(() => {
  centerAction?.bottomOffset
  hasFacetNav
  fillHeight
  navMode
  contentClass
  bottomClearance
  extraScroll
  edgeToEdge
  if (isVisible) untrack(() => scheduleLayout())
})

$effect(() => {
  const facet = facetElement
  const body = bodyElement
  const nav = navElement
  if (!isVisible || !facet || !body) return

  const observer = new ResizeObserver(scheduleResizeLayout)
  observer.observe(facet)
  observer.observe(body)
  if (nav) observer.observe(nav)
  // Collapsing content can leave the measured minimum height unchanged, so resize alone misses it.
  const contentObserver = new MutationObserver(() => scheduleLayout())
  contentObserver.observe(body, { childList: true, subtree: true })
  // Let the surrounding workspace close its frame once this facet scrolls.
  const updateScrollState = (): void => {
    isScrolled = facet.scrollTop > 0
  }
  facet.addEventListener('scroll', updateScrollState, { passive: true })
  updateScrollState()
  const handleLayoutSettled = (): void => {
    scheduleLayout()
  }
  window.addEventListener('bits:facet-layout-settled', handleLayoutSettled)
  untrack(() => scheduleLayout())

  return () => {
    observer.disconnect()
    contentObserver.disconnect()
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame)
    if (contentTimer !== null) clearTimeout(contentTimer)
    layoutFrame = null
    contentTimer = null
    contentMeasurementPending = false
    facet.removeEventListener('scroll', updateScrollState)
    window.removeEventListener('bits:facet-layout-settled', handleLayoutSettled)
  }
})
</script>

{#if transition === 'fade'}
  <section
    bind:this={facetElement}
    {...attrs}
    class={facetClass}
    aria-hidden={!isVisible}
    data-facet-scrolled={isVisible && isScrolled}
    inert={!isVisible}
  >
    <div bind:this={innerElement} class={innerClass}>
      <div bind:this={bodyElement} class={bodyClass} style={bodyStyle}>
        {@render children?.()}
      </div>
      {#if tailSpacer > 0}
        <!-- Clearance space must not intercept controls when asynchronous content grows. -->
        <div
          class="pointer-events-none flex-none"
          data-facet-scroll-clearance
          aria-hidden="true"
          style={tailSpacerStyle}
        ></div>
      {/if}
    </div>
  </section>
  {#if hasFacetNav && isVisible}
    <div
      bind:this={navElement}
      data-facet-nav
      class={navShellClass}
      style={navShellStyle}
    >
      <FormFacetNav
        {previousAction}
        {nextAction}
        {centerAction}
        class={navContentClass}
      />
    </div>
  {/if}
{:else}
  <section
    bind:this={facetElement}
    {...attrs}
    class={facetClass}
    hidden={!isVisible}
    aria-hidden={!isVisible}
    data-facet-scrolled={isVisible && isScrolled}
  >
    <div bind:this={innerElement} class={innerClass}>
      <div bind:this={bodyElement} class={bodyClass} style={bodyStyle}>
        {@render children?.()}
      </div>
      {#if tailSpacer > 0}
        <!-- Clearance space must not intercept controls when asynchronous content grows. -->
        <div
          class="pointer-events-none flex-none"
          data-facet-scroll-clearance
          aria-hidden="true"
          style={tailSpacerStyle}
        ></div>
      {/if}
    </div>
  </section>
  {#if hasFacetNav && isVisible}
    <div
      bind:this={navElement}
      data-facet-nav
      class={navShellClass}
      style={navShellStyle}
    >
      <FormFacetNav
        {previousAction}
        {nextAction}
        {centerAction}
        class={navContentClass}
      />
    </div>
  {/if}
{/if}
