<script lang="ts">
import type { AppHeadMetaProps } from '../../app.types'

let { title, siteName, siteDescription, socialImage }: AppHeadMetaProps = $props()
</script>

<svelte:head>
  <meta property="og:site_name" content={siteName}>
  <meta property="og:type" content="article">
  <meta name="description" content={siteDescription}>
  <meta property="og:description" content={siteDescription}>
  <meta name="twitter:description" content={siteDescription}>
  <meta property="og:title" content={title}>
  <meta property="og:image" content={socialImage.image}>
  <meta property="og:image:width" content={socialImage.width}>
  <meta property="og:image:height" content={socialImage.height}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={title}>
  <meta name="twitter:image" content={socialImage.image}>
</svelte:head>
