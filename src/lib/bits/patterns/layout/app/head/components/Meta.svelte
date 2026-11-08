<script lang="ts">
// SVELTEKIT
import { page } from '$app/state'
// TYPES
import type { AppHeadMetaProps } from '../../app.types'

let { title, siteName, siteDescription, socialImage }: AppHeadMetaProps = $props()

// Sharing crawlers need an absolute image URL in the server-rendered HTML.
const resource = $derived(page.data.shareResource)
const metaTitle = $derived(resource?.title ?? title)
const description = $derived(resource?.description || siteDescription)
const socialImageUrl = $derived(
  new URL(resource?.image ?? socialImage.image, page.url.origin).href,
)
const canonicalUrl = $derived(
  new URL(resource?.path ?? page.url.pathname, page.url.origin).href,
)
</script>

<svelte:head>
  {#if resource}
    <link rel="canonical" href={canonicalUrl}>
    <meta property="og:url" content={canonicalUrl}>
  {/if}
  <meta property="og:site_name" content={siteName}>
  <meta property="og:type" content="website">
  <meta name="description" content={description}>
  <meta property="og:description" content={description}>
  <meta name="twitter:description" content={description}>
  <meta property="og:title" content={metaTitle}>
  <meta property="og:image" content={socialImageUrl}>
  <meta property="og:image:alt" content={resource?.title ?? `${siteName} logo`}>
  {#if !resource}
    <meta property="og:image:width" content={socialImage.width}>
    <meta property="og:image:height" content={socialImage.height}>
  {/if}
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content={metaTitle}>
  <meta name="twitter:image" content={socialImageUrl}>
  <meta name="twitter:image:alt" content={resource?.title ?? `${siteName} logo`}>
</svelte:head>
