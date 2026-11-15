<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// DOMAIN
import {
  facilityColourGroups,
  facilityColourGroup,
} from '#lib/indoor/facilityColours.js'
import {
  facilitySymbols,
  facilitySymbol,
  facilityLegendRank,
} from '#lib/indoor/facilities.js'
// The design reference uses the same approved colours as the live map.
let selectedCategory = $state<string | null>(null)
// Do not offer filters until hydration has attached their event handlers.
let ready = $state(false)
onMount(() => {
  ready = true
})
const variants = [
  { key: 'phone', name: 'Helpline' },
  { key: 'vendingmachine', name: 'Ticket machine' },
  { key: 'checkin', name: 'Police sign-in box' },
]
// Review order follows the agreed sequence; map-only keys bookend this list.
const symbolOrder = [
  'information',
  'vendingmachine:Ticket machine',
  'restroom.unisex',
  'restroom.female',
  'restroom.male',
  'restroom.accessible',
  'shower',
  'mothersroom',
  'babychanging',
  'drinkingfountain',
  'phone',
  'childplayarea',
  'fieldofplay',
  'guestservices',
  'reception.desk',
  'publiclibrary',
  'swimmingpool',
  'atm',
  'bank',
  'vendingmachine',
  'foodservice',
  'mailbox',
  'payphone',
  'photobooth',
  'phone:Helpline',
  'wheelchairassist',
  'firstaid',
  'defibrillator',
  'checkin',
  'corridor',
  'escalator',
  'elevator',
  'rail.muni',
  'lobby',
  'movingwalkway',
  'platform',
  'ramp',
  'room',
  'seating',
  'stairs',
  'walkway',
  'taxi',
  'parking',
  'parking.ev',
  'parking.motorcycle',
  'phone.emergency',
  'security',
  'police',
  'checkin:Police sign-in box',
]
const symbols = [
  ...Object.keys(facilitySymbols).map(key => ({ key, ...facilitySymbol(key) })),
  ...variants.map(({ key, name }) => ({
    key: `${key}:${name}`,
    ...facilitySymbol(key, name),
  })),
].sort((a, b) => {
  const aRank = symbolOrder.indexOf(a.key)
  const bRank = symbolOrder.indexOf(b.key)
  return (
    (aRank < 0 ? symbolOrder.length : aRank) -
      (bRank < 0 ? symbolOrder.length : bRank) || a.label.localeCompare(b.label)
  )
})
// Keep review reference numbers stable when a category hides other symbols.
const visibleSymbols = $derived(
  symbols
    .map((symbol, index) => ({ ...symbol, reference: index + 2 }))
    .filter(
      symbol =>
        !selectedCategory || facilityColourGroup(symbol.key).label === selectedCategory,
    ),
)
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

{#snippet mapKey(symbol: (typeof mapExtras)[number], reference: number)}
  <li class="flex min-h-32 flex-col rounded-xl border border-[#d8dfdc] bg-white/70 p-4">
    <div class="flex items-center justify-between">
      <span class="text-xs text-[#60777d]">{String(reference).padStart(2, '0')}</span>
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
{/snippet}

<svelte:head
  ><title>Map symbols · Hype design</title>
  <meta name="robots" content="noindex"></svelte:head
>
<main class="h-dvh overflow-y-auto bg-[#f8f5ee] px-5 py-10 text-[#123f4b] sm:px-10">
  <div class="mx-auto max-w-7xl">
    <p class="text-xs font-semibold tracking-widest uppercase">Hype · Map design</p>
    <a href="/themes" class="mt-3 inline-block text-sm underline">← Theme studio</a>
    <h1 class="mt-3 text-3xl font-semibold">Map symbols</h1>
    <p class="mt-3 max-w-3xl text-sm">
      All {symbols.length + mapExtras.length} named options in the agreed review order;
      numbers are stable references. These are the same pictograms used on the maps.
    </p>

    <section
      class="mt-6 rounded-xl border border-[#d8dfdc] bg-white/70 p-4"
      aria-label="Service colours"
    >
      <h2 class="font-semibold">Service colours</h2>
      <p class="mt-2 text-sm">
        A consistent colour per service family, with dark ink on a pale background.
        Medical help stays green and SOS stays red. Icons and names remain the primary
        cues. These colours are used on the maps.
      </p>
      <ul class="mt-4 flex flex-wrap gap-3 text-xs">
        <li>
          <button
            type="button"
            disabled={!ready}
            class="cursor-pointer rounded-lg px-3 py-2 ring-current hover:ring-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            class:ring-2={selectedCategory === null}
            aria-pressed={selectedCategory === null}
            onclick={() => (selectedCategory = null)}
          >
            All categories
          </button>
        </li>
        {#each facilityColourGroups as group}
          <li>
            <button
              type="button"
              disabled={!ready}
              class="cursor-pointer rounded-lg px-3 py-2 text-left ring-current hover:ring-1 focus-visible:outline-2 focus-visible:outline-offset-2"
              class:ring-2={selectedCategory === group.label}
              style:color={group.color}
              style:background={group.background}
              aria-label={group.label}
              aria-pressed={selectedCategory === group.label}
              onclick={() =>
                (selectedCategory =
                  selectedCategory === group.label ? null : group.label)}
            >
              {group.label}
              · {group.color}
            </button>
          </li>
        {/each}
      </ul>
    </section>
    <ol
      class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      aria-label={selectedCategory
        ? `${selectedCategory} map symbols`
        : 'All map symbols'}
    >
      {#if !selectedCategory}
        {@render mapKey(mapExtras[0], 1)}
      {/if}
      {#each visibleSymbols as symbol (symbol.key)}
        <li
          class="flex min-h-32 flex-col rounded-xl border border-[#d8dfdc] bg-white/70 p-4"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-[#60777d]"
              >{String(symbol.reference).padStart(2, '0')}</span
            >
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
          <p class="mt-1 text-xs">{facilityColourGroup(symbol.key).label}</p>
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
      {#if !selectedCategory}
        {#each mapExtras.slice(1) as symbol, i}
          {@render mapKey(symbol, symbols.length + i + 2)}
        {/each}
      {/if}
    </ol>

    <p class="mt-6 text-sm">
      Source aliases share symbols: Bank → ATM; Platform → Platform; wheelchair toilet
      categories → Accessible toilet; Steps → Stairs. Unknown future categories retain a
      generic information fallback.
    </p>
  </div>
</main>
