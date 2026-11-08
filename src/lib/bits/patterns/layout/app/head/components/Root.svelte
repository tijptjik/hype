<script lang="ts">
import { page } from '$app/state'
import { resolveTitle } from '#lib/navigation/title.js'
import Fonts from './Fonts.svelte'
import Meta from './Meta.svelte'
import type { AppHeadRootProps } from '../../app.types'

let { title, siteName, siteDescription, socialImage, localeKey }: AppHeadRootProps =
  $props()
</script>

<svelte:head> <title>{page.data.shareResource ? resolveTitle(page.data.shareResource.title, page.data.titleEnvironmentLabel) : title}</title> </svelte:head>

<Meta {title} {siteName} {siteDescription} {socialImage} />
<Fonts {localeKey} />
