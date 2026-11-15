<script lang="ts">
// DOMAIN
import {
  facilitySymbols,
  facilitySymbol,
  facilityLegendRank,
} from '#lib/indoor/facilities.js'
const variants = [
  { key: 'phone', name: 'Helpline' },
  { key: 'vendingmachine', name: 'Ticket machine' },
  { key: 'checkin', name: 'Police sign-in box' },
]
const symbols = [
  ...Object.keys(facilitySymbols).map(key => ({ key, ...facilitySymbol(key) })),
  ...variants.map(({ key, name }) => ({
    key: `${key}:${name}`,
    ...facilitySymbol(key, name),
  })),
].sort((a, b) => a.label.localeCompare(b.label))
const mapExtras = [
  {
    label: 'Level change',
    path: 'M8 21V3m-5 5 5-5 5 5M17 3v18m-5-5 5 5 5-5',
    fill: '',
  },
  { label: 'Paid area', path: 'M3 3h18v18H3z', fill: '#c6d8db' },
  { label: 'Unpaid area', path: 'M3 3h18v18H3z', fill: '#e5dbc4' },
]
</script>

<svelte:head
  ><title>Map symbol review · Hype</title>
  <meta name="robots" content="noindex"></svelte:head
>
<main class="h-dvh overflow-y-auto bg-[#f8f5ee] px-5 py-10 text-[#123f4b] sm:px-10">
  <div class="mx-auto max-w-7xl">
    <p class="text-xs font-semibold tracking-widest uppercase">Hype · Map design</p>
    <h1 class="mt-3 text-3xl font-semibold">Map symbol review</h1>
    <p class="mt-3 max-w-3xl text-sm">
      All {symbols.length + mapExtras.length} named options together. Alphabetical for
      review; numbers are references, not proposed ranks. These are the same pictograms
      used on the maps.
    </p>
    <a
      class="mt-3 inline-block text-sm underline"
      href="/premises/quarry-bay-mtr/places/4be8db61-a107-42e7-b3a6-1823a0b55b68"
      >Review Quarry Bay’s “Stairs” entry, currently classified as Room →</a
    >
    <ol
      class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      aria-label="All map symbols"
    >
      {#each symbols as symbol, i (symbol.key)}
        <li
          class="flex min-h-32 flex-col rounded-xl border border-[#d8dfdc] bg-white/70 p-4"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-[#60777d]">{String(i + 1).padStart(2, '0')}</span>
            <svg width="44" height="44" viewBox="-4 -4 32 32" aria-hidden="true">
              <rect
                x="-4"
                y="-4"
                width="32"
                height="32"
                rx="8"
                fill={symbol.background}
              />
              <path
                d={symbol.path}
                fill="none"
                stroke={symbol.color}
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              {#if symbol.text}
                <text
                  x="12"
                  y="20"
                  text-anchor="middle"
                  font-size="10"
                  font-weight="800"
                  fill={symbol.color}
                >
                  {symbol.text}
                </text>
              {/if}
            </svg>
          </div>
          <h2 class="mt-3 text-sm font-medium">{symbol.label}</h2>
          <p class="mt-1 text-xs text-[#60777d]">
            {['elevator', 'escalator', 'ramp', 'stairs'].includes(symbol.key)
              ? 'Connection'
              : facilityLegendRank(symbol.key.split(':')[0]) ===
                  facilityLegendRank('unknown')
                ? 'Awaiting ranking'
                : 'Ranked in legend'}
          </p>
        </li>
      {/each}
      {#each mapExtras as symbol, i}
        <li
          class="flex min-h-32 flex-col rounded-xl border border-[#d8dfdc] bg-white/70 p-4"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-[#60777d]">{symbols.length + i + 1}</span>
            <svg width="44" height="44" viewBox="-4 -4 32 32" aria-hidden="true">
              <path
                d={symbol.path}
                fill={symbol.fill || 'none'}
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <h2 class="mt-3 text-sm font-medium">{symbol.label}</h2>
          <p class="mt-1 text-xs text-[#60777d]">Map key</p>
        </li>
      {/each}
    </ol>
    <p class="mt-6 text-sm">
      Source aliases share symbols: Bank → ATM; Platform → Platform; wheelchair toilet
      categories → Accessible toilet; Steps → Stairs. Unknown future categories retain a
      generic information fallback.
    </p>
  </div>
</main>
