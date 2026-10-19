<script lang="ts">
// SVELTEKIT
import { page } from '$app/state'
// TYPES
import type { AppHeadMetaProps } from '../../app.types'

let { title, siteName, siteDescription, socialImage }: AppHeadMetaProps = $props()

// Sharing crawlers need an absolute image URL in the server-rendered HTML.
const socialImageUrl = $derived(new URL(socialImage.image, page.url.origin).href)
</script>

<svelte:head>
  <meta property="og:site_name" content={siteName}>
  <meta property="og:type" content="website">
  <meta name="description" content={siteDescription}>
  <meta property="og:description" content={siteDescription}>
  <meta name="twitter:description" content={siteDescription}>
  <meta property="og:title" content={title}>
  <meta property="og:image" content={socialImageUrl}>
  <meta property="og:image:alt" content={`${siteName} logo`}>
  <meta property="og:image:width" content={socialImage.width}>
  <meta property="og:image:height" content={socialImage.height}>
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content={title}>
  <meta name="twitter:image" content={socialImageUrl}>
  <meta name="twitter:image:alt" content={`${siteName} logo`}>
</svelte:head>
