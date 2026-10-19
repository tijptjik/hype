<script lang="ts">
let { isGuest = false }: { isGuest?: boolean } = $props()
</script>

{#if isGuest}
  <!-- Soft geometric arcs frame the guest avatar, with a quieter center for the actions. -->
  <div
    class="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-panel"
    style="background-image: radial-gradient(ellipse at 50% 32%, color-mix(in oklab, var(--theme-primary) 12%, transparent), transparent 72%);"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 432 288"
      preserveAspectRatio="xMidYMid slice"
      class="absolute inset-0 h-full w-full text-primary"
      style="mask-image: radial-gradient(ellipse at 50% 48%, rgb(0 0 0 / 20%) 12%, #000 85%);"
      fill="none"
      focusable="false"
    >
      <title>Geometric arc pattern</title>
      {#each Array.from({ length: 24 }, (_, index) => index) as tile}
        <g transform={`translate(${(tile % 6) * 72} ${Math.floor(tile / 6) * 72})`}>
          <g transform={`rotate(${((tile + Math.floor(tile / 6)) % 4) * 90} 36 36)`}>
            <path
              d="M0 0H72A72 72 0 0 1 0 72Z"
              fill="currentColor"
              fill-opacity={tile % 3 === 0 ? 0.07 : 0.025}
            />
            <path
              d="M0 72A72 72 0 0 0 72 0M0 48A48 48 0 0 0 48 0M0 24A24 24 0 0 0 24 0"
              stroke="currentColor"
              stroke-opacity="0.22"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          </g>
        </g>
      {/each}
    </svg>
  </div>
{:else}
  <!-- Theme-colored contour waves frame the profile without overpowering its content. -->
  <div
    class="pointer-events-none absolute inset-0 overflow-hidden bg-panel"
    aria-hidden="true"
  >
    <!-- A subtle geometric treatment keeps the profile readable across all themes. -->
    <svg
      viewBox="0 0 380 256"
      preserveAspectRatio="xMidYMid slice"
      class="h-full w-full text-primary opacity-10 dark:opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      focusable="false"
    >
      <title>Geometric contour waves</title>
      {#each Array.from({ length: 18 }, (_, index) => index) as line (line)}
        <path
          d="M-80 20C0-70 65-65 125 5S245 80 310 5S410-65 460 5"
          transform={`translate(0 ${line * 16 - 52})`}
        />
      {/each}
    </svg>
  </div>
{/if}
