<script lang="ts">
// CUSTOM
import LoadScreen from '#lib/bits/custom/loading/LoadScreen.svelte'
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
  isPrimaryPanelAutoHide = false,
  isAdminPanelOpen = false,
  onOpenVisual,
  onCloseVisual,
  headerProps,
  sidebar,
  settings,
  children,
}: AdminShellProps = $props()

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
            <HeaderControlBar controlBar={headerProps.controlBar} />
            {@render children()}

            {#if footerConfig?.component}
              {@const Footer = footerConfig.component}
              <Footer {...footerConfig.props ?? {}} />
            {/if}
          </main>
        </div>
      </div>
      {@render settings()}
    </div>
  {:else}
    <LoadScreen color="accent" />
  {/if}
</MinWidthGuard>
