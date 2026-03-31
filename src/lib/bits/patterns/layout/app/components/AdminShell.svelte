<script lang="ts">
// CUSTOM
import { LoadScreen } from '$lib/bits/custom'
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
    <div class="bits-theme bits-admin-shell">
      <AutoHide
        enabled={isPrimaryPanelAutoHide}
        isOpen={isAdminPanelOpen}
        {onOpenVisual}
        {onCloseVisual}
      >
        {@render sidebar()}
      </AutoHide>

      <main class="bits-admin-shell__main">
        <Header {...(resolvedHeaderProps as HeaderProps)} />
        {@render children()}

        {#if footerConfig?.component}
          {@const Footer = footerConfig.component}
          <Footer {...(footerConfig.props ?? {})} />
        {/if}
      </main>

      {@render settings()}
    </div>
  {:else}
    <LoadScreen color="accent" />
  {/if}
</MinWidthGuard>
