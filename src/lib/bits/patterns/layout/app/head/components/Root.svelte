<script lang="ts">
import Fonts from './Fonts.svelte'
import Meta from './Meta.svelte'
import type { AppHeadRootProps } from '../../app.types'

let {
  title,
  siteName,
  siteDescription,
  socialImage,
  localeKey,
  windowWidth = $bindable(0),
}: AppHeadRootProps = $props()
</script>

<svelte:window bind:innerWidth={windowWidth} />

<svelte:head> <title>{title}</title> </svelte:head>

<Meta {title} {siteName} {siteDescription} {socialImage} />
<Fonts {localeKey} />
