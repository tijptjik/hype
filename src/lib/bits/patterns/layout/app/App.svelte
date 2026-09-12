<script lang="ts">
import * as AppPrimitive from './components'
import * as Head from './head/components'
import type { AppProps } from './app.types'

let {
  localeKey,
  isReady,
  title,
  siteName,
  siteDescription,
  socialImage,
  pendingColor = 'accent',
  pendingSurface = 'transparent',
  children,
}: AppProps = $props()
</script>

<Head.Root {title} {siteName} {siteDescription} {socialImage} {localeKey} />

<AppPrimitive.RootShell {localeKey} {isReady} {pendingColor} {pendingSurface}>
  {@render children()}
</AppPrimitive.RootShell>
