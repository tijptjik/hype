<script lang="ts">
import * as AppPrimitive from './components'
import * as Head from './head/components'
import type { AppProps } from './app.types'

let {
  queryClient,
  localeKey,
  title,
  siteName,
  siteDescription,
  socialImage,
  windowWidth = $bindable(0),
  pendingColor = 'primary',
  pendingSurface = 'base',
  children,
}: AppProps = $props()
</script>

<Head.Root
  bind:windowWidth
  {title}
  {siteName}
  {siteDescription}
  {socialImage}
  {localeKey}
/>

<AppPrimitive.AppShell {queryClient} {localeKey} {pendingColor} {pendingSurface}>
  {@render children()}
</AppPrimitive.AppShell>
