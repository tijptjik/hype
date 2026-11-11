<script lang="ts">
// SVELTEKIT
import { page } from '$app/state'
import { onNavigate } from '$app/navigation'
// CUSTOM
import RouteViewport from '#lib/bits/custom/transition/RouteViewport.svelte'
import LoadScreen from '#lib/bits/custom/loading/LoadScreen.svelte'
import { m } from '#lib/i18n.js'
// LAYOUT
import { AutoHide } from '../../autoHide'
import { Header, HeaderControlBar } from '../../header'
import { MinWidthGuard } from '../../minWidthGuard'
// TYPES
import type { HeaderProps } from '../../header'
import type { AdminShellProps } from '../app.types'

let {
  minWidth,
  title,
  description,
  widthLabel,
  icon = null,
  isReady,
  isContentReady = true,
  pending,
  isPrimaryPanelAutoHide = false,
  isAdminPanelOpen = false,
  onOpenVisual,
  onCloseVisual,
  headerProps,
  sidebar,
  settings,
  children,
}: AdminShellProps = $props()

let routeViewport = $state<ReturnType<typeof RouteViewport> | undefined>()
onNavigate(({ from, to }) => {
  if (from?.url.pathname !== to?.url.pathname) routeViewport?.prepareNavigation()
})

let mainElement = $state<HTMLElement | null>(null)
let contentStart = $state<number | undefined>(undefined)

// Follow sidebar resizing so desktop tabs share the main panel's content gutter.
$effect(() => {
  if (!mainElement) return
  const element = mainElement
  const observer = new ResizeObserver(() => {
    contentStart = element.getBoundingClientRect().left
  })
  observer.observe(element)
  return () => observer.disconnect()
})

const resolvedHeaderProps = $derived({
  ...headerProps,
  id: headerProps.id ?? undefined,
  controlBar: null,
  contentStart,
})

const footerConfig = $derived(headerProps.footer ?? null)
</script>

<MinWidthGuard {minWidth} {title} {description} {widthLabel} {icon}>
  {#if isReady}
    <div class="bits-theme relative flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          {...resolvedHeaderProps as HeaderProps}
          class={[headerProps.class, 'shrink-0 border-b border-border']
            .filter(Boolean)
            .join(' ')}
        />
        <div class="bits-admin-shell flex-1">
          <AutoHide
            enabled={isPrimaryPanelAutoHide}
            isOpen={isAdminPanelOpen}
            {onOpenVisual}
            {onCloseVisual}
          >
            {@render sidebar()}
          </AutoHide>

          <main bind:this={mainElement} class="bits-admin-shell__main">
            {#if isContentReady}
              <HeaderControlBar controlBar={headerProps.controlBar} />
              <RouteViewport bind:this={routeViewport} routeKey={page.url.pathname}>
                {@render children()}
              </RouteViewport>
            {:else if pending}
              {@render pending()}
            {:else}
              <div class="flex h-full items-center justify-center" role="status">
                <span class="loading loading-ring loading-lg" aria-hidden="true"></span>
                <span class="sr-only">{m.resource_loading()}</span>
              </div>
            {/if}

            {#if isContentReady && footerConfig?.component}
              {@const Footer = footerConfig.component}
              <Footer {...footerConfig.props ?? {}} />
            {/if}
          </main>
        </div>
      </div>
      {@render settings()}
    </div>
  {:else}
    <LoadScreen color="accent" hubCode={page.data.hub?.code} />
  {/if}
</MinWidthGuard>
