<script lang="ts">
// CUSTOM
import { LoadScreen } from '#lib/bits/custom/index.js'
// LAYOUT
import { AutoHide } from '../../autoHide'
import { Header } from '../../header'
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

const resolvedHeaderProps = $derived({
  ...headerProps,
  id: headerProps.id ?? undefined,
})

const footerConfig = $derived(headerProps.footer ?? null)
</script>

<MinWidthGuard {minWidth} {title} {description} {widthLabel} {icon}>
  {#if isReady}
    <div class="bits-theme flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
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

        <main class="bits-admin-shell__main">
          {@render children()}

          {#if footerConfig?.component}
            {@const Footer = footerConfig.component}
            <Footer {...footerConfig.props ?? {}} />
          {/if}
        </main>

        {@render settings()}
      </div>
    </div>
  {:else}
    <LoadScreen color="accent" />
  {/if}
</MinWidthGuard>
