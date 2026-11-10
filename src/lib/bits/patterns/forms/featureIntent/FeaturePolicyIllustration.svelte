<script lang="ts">
let { scene }: { scene: string } = $props()
</script>

<!-- Fine outlines, offset planes and restrained tint follow the settings illustration family. -->
<svg
  viewBox="0 0 112 68"
  fill="none"
  aria-hidden="true"
  class="text-primary h-16 w-full"
>
  <ellipse cx="56" cy="58" rx="38" ry="5" fill="currentColor" opacity="0.06" />
  <g
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#if scene === 'object'}
      <path
        d="M31 26L56 14L81 26V50L56 62L31 50Z"
        fill="currentColor"
        fill-opacity="0.05"
      />
      <path d="M31 26L56 38L81 26M56 38V62M43 20L68 32V42" />
      <path d="M38 44L47 48M38 49L43 51" opacity="0.45" />
    {:else if scene === 'place'}
      <path
        d="M25 29L49 19L76 30V54L51 63L25 52Z"
        fill="currentColor"
        fill-opacity="0.05"
      />
      <path
        d="M25 29L51 40L76 30M51 40V63M34 38V46M42 42V50M60 44V52M68 40V48"
        opacity="0.55"
      />
      <path
        d="M91 15C91 25 79 35 79 35S67 25 67 15A12 12 0 1 1 91 15Z"
        fill="var(--color-panel, white)"
      />
      <circle cx="79" cy="15" r="4" />
    {:else if scene === 'area'}
      <path d="M17 39L50 20L95 38L63 58Z" fill="currentColor" fill-opacity="0.04" />
      <path d="M17 39V45L63 64L95 44V38M63 58V64" opacity="0.4" />
      <path
        d="M29 38L50 27L82 39L62 51Z"
        fill="currentColor"
        fill-opacity="0.12"
        stroke-dasharray="3 3"
      />
      <path
        d="M45 31V17M40 24L45 15L50 24ZM66 38V25M61 31L66 22L71 31Z"
        fill="var(--color-panel, white)"
      />
    {:else if scene === 'route'}
      <path
        d="M16 27L40 18L69 27L96 18V51L70 61L40 52L16 61Z"
        fill="currentColor"
        fill-opacity="0.04"
      />
      <path d="M40 18V52M69 27L70 61" opacity="0.35" />
      <path d="M29 46C32 28 49 48 54 35S73 42 83 29" stroke-width="2.5" />
      <circle cx="29" cy="46" r="4" fill="var(--color-panel, white)" />
      <circle cx="83" cy="29" r="4" fill="currentColor" />
    {:else if scene === 'locatedAt' || scene === 'represents'}
      <path
        d="M24 51V24L50 13L77 24V51L50 61Z"
        fill="currentColor"
        fill-opacity="0.05"
      />
      <path d="M24 24L50 35L77 24M50 35V61M32 22L58 33M41 18L67 29" opacity="0.45" />
      <path d="M32 36V43M40 39V46M60 40V47M68 36V43" opacity="0.55" />
      {#if scene === 'locatedAt'}
        <path d="M68 44L81 38L94 44V57L81 63L68 57Z" fill="var(--color-panel, white)" />
        <path d="M68 44L81 50L94 44M81 50V63" />
        <circle cx="81" cy="31" r="3" fill="currentColor" />
        <path d="M81 34V38" stroke-dasharray="2 3" />
      {:else}
        <path d="M79 11H96V31H79L73 21Z" fill="var(--color-panel, white)" />
        <path d="M82 17H91M82 23H88M73 21L62 26" />
        <circle cx="76" cy="21" r="1" />
      {/if}
    {:else if scene === 'search' || scene === 'pin'}
      <path
        d="M17 24L40 16L68 25L94 16V51L69 60L40 51L17 59Z"
        fill="currentColor"
        fill-opacity="0.04"
      />
      <path d="M40 16V51M68 25L69 60M20 43L39 34L69 44L91 35" opacity="0.35" />
      {#if scene === 'search'}
        <rect
          x="25"
          y="9"
          width="57"
          height="34"
          rx="5"
          fill="var(--color-panel, white)"
        />
        <circle cx="38" cy="22" r="5" />
        <path d="M42 26L46 30M53 19H73M53 26H66M32 36H72" />
      {:else}
        <path
          d="M69 22C69 33 56 44 56 44S43 33 43 22A13 13 0 1 1 69 22Z"
          fill="var(--color-panel, white)"
        />
        <circle cx="56" cy="22" r="5" />
        <ellipse cx="56" cy="48" rx="9" ry="3" opacity="0.4" />
      {/if}
    {:else if scene === 'prompt'}
      <rect
        x="25"
        y="14"
        width="64"
        height="41"
        rx="5"
        fill="currentColor"
        fill-opacity="0.05"
      />
      <rect
        x="20"
        y="9"
        width="64"
        height="41"
        rx="5"
        fill="var(--color-panel, white)"
      />
      <path d="M29 19H57M29 25H46" opacity="0.5" />
      <rect
        x="29"
        y="33"
        width="21"
        height="10"
        rx="3"
        fill="currentColor"
        fill-opacity="0.1"
      />
      <path d="M36 38H43M39.5 34.5V41.5M59 38H74" />
    {:else}
      <path
        d="M20 39L36 32L54 39L71 32L90 39V53L71 60L54 53L36 60L20 53Z"
        fill="currentColor"
        fill-opacity="0.04"
      />
      <circle cx="35" cy="23" r="9" fill="var(--color-panel, white)" />
      <path d="M31 23L34 26L39 20M51 23H87M79 15L87 23L79 31" />
      <path d="M36 44V54M54 44V48M71 44V54" opacity="0.35" />
    {/if}
  </g>
</svg>
