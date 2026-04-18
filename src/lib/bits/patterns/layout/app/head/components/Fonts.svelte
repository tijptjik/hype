<script lang="ts">
import type { AppHeadFontsProps } from '../../app.types'

let { localeKey }: AppHeadFontsProps = $props()
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link
    href="https://fonts.googleapis.com/css2?family=Geologica:wght,CRSV@100..900,0&family=IBM+Plex+Mono:wght@400;700&family=Merriweather:ital,opsz,wght@0,18..144,300..900;1,18..144,300..900&family=Tilt+Neon&display=swap"
    rel="stylesheet"
  >
  {#if localeKey === 'zhHant'}
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@100..900&display=swap"
      rel="stylesheet"
    >
  {:else if localeKey === 'zhHans'}
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap"
      rel="stylesheet"
    >
  {/if}
</svelte:head>
