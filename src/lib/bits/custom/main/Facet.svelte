<script lang="ts">
import { onMount } from 'svelte'
import { FormFacetNav } from '$lib/bits/patterns/forms/formFacetNav'
import type { MainFacetProps } from './main.types'

let {
  children,
  class: className = '',
  isVisible = true,
  transition = 'none',
  attrs = {},
  previousAction = null,
  nextAction = null,
  fillHeight = false,
  navMode = 'centered',
  contentClass = '',
}: MainFacetProps = $props()

const FACET_OVERSCROLL = 96
const FACET_FOOTER_GUTTER = 48

let facetElement = $state<HTMLElement | null>(null)
let innerElement = $state<HTMLDivElement | null>(null)
let bodyElement = $state<HTMLDivElement | null>(null)
let navElement = $state<HTMLDivElement | null>(null)
let bodyMinHeight = $state(0)
let bodyHeight = $state<number | null>(null)
let tailSpacer = $state(0)
let hasScrollableOverflow = $state(false)

const hasFacetNav = $derived(Boolean(previousAction || nextAction))
const isRequestedFooterNav = $derived(hasFacetNav && navMode === 'footer')
const isFooterNav = $derived(isRequestedFooterNav && !hasScrollableOverflow)

const facetClass = $derived(
  [
    'bits-theme bits-main__section',
    fillHeight ? 'bits-main__section--fill-height' : '',
    transition === 'fade' ? 'bits-main__section--fade' : '',
    transition === 'fade' && isVisible ? 'bits-main__section--active' : '',
    transition === 'fade' && !isVisible ? 'bits-main__section--faded' : '',
    transition !== 'fade' && !isVisible ? 'bits-main__section--hidden' : '',
    isFooterNav ? 'bits-main__section--footer-nav' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const innerClass = $derived(
  [
    'bits-main__section-inner',
    fillHeight ? 'bits-main__section-inner--fill-height' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

const bodyClass = $derived(
  [
    'bits-main__section-body',
    fillHeight ? 'bits-main__section-body--fill-height' : '',
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
  ].join('; '),
)
const tailSpacerStyle = $derived(`height: ${Math.max(0, tailSpacer)}px;`)
const navClass = $derived(
  ['bits-main__section-nav', isFooterNav ? 'bits-main__section-nav--footer' : '']
    .filter(Boolean)
    .join(' '),
)

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

function getBodyContentHeight(body: HTMLDivElement): number {
  const previousInlineMinHeight = body.style.minHeight
  const previousInlineHeight = body.style.height

  body.style.minHeight = '0px'
  body.style.height = 'auto'

  const scrollHeight = Math.ceil(body.scrollHeight)

  if (body.children.length === 0) {
    body.style.minHeight = previousInlineMinHeight
    body.style.height = previousInlineHeight
    return scrollHeight
  }

  const bodyTop = body.getBoundingClientRect().top
  let contentHeight = scrollHeight

  // Direct child bounds help when transformed content paints beyond the
  // element's normal flow size, while scrollHeight captures regular overflow.
  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) continue
    const rect = child.getBoundingClientRect()
    contentHeight = Math.max(contentHeight, rect.bottom - bodyTop)
  }

  body.style.minHeight = previousInlineMinHeight
  body.style.height = previousInlineHeight

  return Math.ceil(contentHeight)
}

function measureLayout(): void {
  const facet = facetElement
  const body = bodyElement

  if (!facet || !body) {
    bodyMinHeight = 0
    bodyHeight = null
    tailSpacer = 0
    hasScrollableOverflow = false
    return
  }

  const availableHeight = facet.clientHeight
  const navHeight = hasFacetNav && navElement ? navElement.offsetHeight : 0
  const bodyContentHeight = getBodyContentHeight(body)
  const contentHeight = bodyContentHeight + navHeight
  const remainingHeight = Math.max(0, availableHeight - contentHeight)
  const hasVerticalOverflow = body.scrollHeight > body.clientHeight + 1
  const hasHorizontalOverflow = body.scrollWidth > body.clientWidth + 1

  hasScrollableOverflow = hasVerticalOverflow || hasHorizontalOverflow

  if (isFooterNav) {
    bodyHeight = null
    bodyMinHeight = 0
    tailSpacer = 0
    logInnerChildrenHeights()
    return
  }

  bodyHeight = null

  if (contentHeight <= availableHeight) {
    const leadSpace = Math.floor(remainingHeight / 2)
    const trailSpace = remainingHeight - leadSpace

    bodyMinHeight = bodyContentHeight + leadSpace
    tailSpacer = trailSpace
    logInnerChildrenHeights()
    return
  }

  bodyMinHeight = bodyContentHeight
  tailSpacer = hasFacetNav ? FACET_OVERSCROLL : 0
  logInnerChildrenHeights()
}

$effect(() => {
  hasFacetNav
  fillHeight
  navMode
  contentClass
  queueMicrotask(measureLayout)
})

onMount(() => {
  const facet = facetElement
  const body = bodyElement

  if (!facet || !body) return

  const observer = new ResizeObserver(() => {
    measureLayout()
  })

  observer.observe(facet)
  observer.observe(body)
  if (navElement) observer.observe(navElement)
  const handleLayoutSettled = (): void => {
    queueMicrotask(measureLayout)
  }
  window.addEventListener('bits:facet-layout-settled', handleLayoutSettled)
  queueMicrotask(measureLayout)

  return () => {
    observer.disconnect()
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
    inert={!isVisible}
  >
    <div bind:this={innerElement} class={innerClass}>
      <div bind:this={bodyElement} class={bodyClass} style={bodyStyle}>
        {@render children?.()}
      </div>
      {#if hasFacetNav}
        <div bind:this={navElement} class={navClass}>
          <FormFacetNav {previousAction} {nextAction} />
        </div>
      {/if}
      {#if tailSpacer > 0}
        <div
          class="bits-main__section-tail-spacer"
          aria-hidden="true"
          style={tailSpacerStyle}
        ></div>
      {/if}
    </div>
  </section>
{:else}
  <section
    bind:this={facetElement}
    {...attrs}
    class={facetClass}
    hidden={!isVisible}
    aria-hidden={!isVisible}
  >
    <div bind:this={innerElement} class={innerClass}>
      <div bind:this={bodyElement} class={bodyClass} style={bodyStyle}>
        {@render children?.()}
      </div>
      {#if hasFacetNav}
        <div bind:this={navElement} class={navClass}>
          <FormFacetNav {previousAction} {nextAction} />
        </div>
      {/if}
      {#if tailSpacer > 0}
        <div
          class="bits-main__section-tail-spacer"
          aria-hidden="true"
          style={tailSpacerStyle}
        ></div>
      {/if}
    </div>
  </section>
{/if}
