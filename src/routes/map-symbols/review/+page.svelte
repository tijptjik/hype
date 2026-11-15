<script lang="ts">
// DOMAIN
import {
  facilitySymbols,
  facilitySymbol,
  facilityLegendRank,
} from '#lib/indoor/facilities.js'
// Proposed colours are confined to this review page until approved.
let proposedColours = $state(false)
let selectedCategory = $state<string | null>(null)
const colourGroups = [
  {
    label: 'Movement & transport',
    color: '#0f766e',
    background: '#f0fdfa',
    keys: [
      'elevator',
      'escalator',
      'ramp',
      'stairs',
      'walkway',
      'corridor',
      'movingwalkway',
      'platform',
      'rail.muni',
      'taxi',
      'parking',
      'parking.ev',
      'parking.motorcycle',
    ],
  },
  {
    label: 'Information & communication',
    color: '#0369a1',
    background: '#f0f9ff',
    keys: [
      'information',
      'reception.desk',
      'guestservices',
      'phone',
      'payphone',
      'mailbox',
    ],
  },
  {
    label: 'Personal care & accessibility',
    color: '#7e22ce',
    background: '#faf5ff',
    keys: [
      'restroom.male',
      'restroom.female',
      'restroom.unisex',
      'restroom.accessible',
      'mothersroom',
      'babychanging',
      'wheelchairassist',
      'shower',
      'drinkingfountain',
    ],
  },
  {
    label: 'Shopping & transactions',
    color: '#92400e',
    background: '#fffbeb',
    keys: ['atm', 'bank', 'vendingmachine', 'foodservice', 'photobooth'],
  },
  {
    label: 'Leisure & recreation',
    color: '#3f6212',
    background: '#f7fee7',
    keys: ['childplayarea', 'fieldofplay', 'swimmingpool', 'publiclibrary'],
  },
  {
    label: 'Medical help',
    color: '#15803d',
    background: '#f0fdf4',
    keys: ['firstaid', 'defibrillator'],
  },
  {
    label: 'Emergency communication',
    color: '#b91c1c',
    background: '#fef2f2',
    keys: ['phone.emergency'],
  },
  {
    label: 'Police & security',
    color: '#1e3a8a',
    background: '#eff6ff',
    keys: ['police', 'security', 'checkin:Police sign-in box'],
  },
  {
    label: 'General spaces',
    color: '#475569',
    background: '#f1f5f9',
    keys: ['lobby', 'seating', 'room', 'checkin'],
  },
]
/** Resolve the proposed review-only group, including source-name variants.
 * @param key Review symbol identity. @returns Proposed colour group.
 */
function proposedGroup(key: string): (typeof colourGroups)[number] {
  return (
    colourGroups.find(group => group.keys.includes(key)) ??
    colourGroups.find(group => group.keys.includes(key.split(':')[0])) ??
    colourGroups[8]
  )
}
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
// Keep review reference numbers stable when a category hides other symbols.
const visibleSymbols = $derived(
  symbols
    .map((symbol, index) => ({ ...symbol, reference: index + 1 }))
    .filter(
      symbol =>
        !selectedCategory || proposedGroup(symbol.key).label === selectedCategory,
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
    <section
      class="mt-6 rounded-xl border border-[#d8dfdc] bg-white/70 p-4"
      aria-label="Colour proposal"
    >
      <h2 class="font-semibold">Proposed service colours</h2>
      <p class="mt-2 text-sm">
        A consistent colour per service family, with dark ink on a pale background.
        Medical help stays green and SOS stays red. Icons and names remain the primary
        cues. This preview does not change map colours.
      </p>
      <label class="mt-3 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" bind:checked={proposedColours}>
        Preview proposed colours
      </label>
      <ul class="mt-4 flex flex-wrap gap-3 text-xs">
        <li>
          <button
            type="button"
            class="cursor-pointer rounded-lg px-3 py-2 ring-current hover:ring-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            class:ring-2={selectedCategory === null}
            aria-pressed={selectedCategory === null}
            onclick={() => (selectedCategory = null)}
          >
            All categories
          </button>
        </li>
        {#each colourGroups as group}
          <li>
            <button
              type="button"
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
      {#each visibleSymbols as symbol (symbol.key)}
        {@const palette = proposedColours ? proposedGroup(symbol.key) : symbol}
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
                fill={palette.background}
              />
              <path
                d={symbol.path}
                fill="none"
                stroke={palette.color}
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
                  fill={palette.color}
                >
                  {symbol.text}
                </text>
              {/if}
            </svg>
          </div>
          <h2 class="mt-3 text-sm font-medium">{symbol.label}</h2>
          {#if proposedColours}
            <p class="mt-1 text-xs">{proposedGroup(symbol.key).label}</p>
          {/if}
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
      {#each selectedCategory ? [] : mapExtras as symbol, i}
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
