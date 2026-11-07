<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { fly } from 'svelte/transition'
// TYPES
let {
  addressText,
  featureKey,
}: {
  addressText: string
  featureKey: string
} = $props()

const addressLineRightPadding = [24, 12, 0, 12, 24] as const

let measureElement = $state<HTMLSpanElement>()
let fontsReady = $state(false)

onMount(() => {
  let active = true
  void document.fonts.ready.then(() => {
    if (active) fontsReady = true
  })
  return () => {
    active = false
  }
})

/**
 * Measure with the same inherited font and size as the visible address labels.
 * @param text - Candidate line.
 * @returns Unrotated text width in pixels.
 */
function measureTextWidth(text: string): number {
  if (!measureElement) return 0
  measureElement.textContent = text
  return measureElement.getBoundingClientRect().width
}

/**
 * Wrap one address part without joining it to the next postal component.
 * @param text - Address part to wrap.
 * @param maxWidth - Available text width in pixels, excluding label padding.
 * @returns Complete lines in reading order.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/u)
  const lines: string[] = []
  let currentLine = words[0] ?? ''

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    const candidate = `${currentLine} ${word}`

    if (measureTextWidth(candidate) <= maxWidth) currentLine = candidate
    else {
      lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine) lines.push(currentLine)

  // Balance adjacent lines so a long name does not leave its final word stranded.
  for (let index = lines.length - 1; index > 0; index -= 1) {
    const previousWords = lines[index - 1].split(' ')
    while (previousWords.length > 1) {
      const nextLine = `${previousWords.at(-1)} ${lines[index]}`
      const previousLine = previousWords.slice(0, -1).join(' ')
      const currentDifference = Math.abs(
        measureTextWidth(lines[index - 1]) - measureTextWidth(lines[index]),
      )
      const nextDifference = Math.abs(
        measureTextWidth(previousLine) - measureTextWidth(nextLine),
      )
      if (measureTextWidth(nextLine) > maxWidth || nextDifference >= currentDifference)
        break
      previousWords.pop()
      lines[index - 1] = previousLine
      lines[index] = nextLine
    }
  }

  return lines
}

/**
 * Preserve postal separators before wrapping long place names.
 * @param text - Localised display address.
 * @param maxWidth - Maximum text width for each label.
 * @returns All address lines, without discarding overflow lines.
 */
function wrapText(text: string, maxWidth: number = 170): string[] {
  const address = text.replace(', Hong Kong', '').replace('Hong Kong, ', '')
  return address
    .split(/[,，\n]+/u)
    .map(part => part.trim())
    .filter(Boolean)
    .flatMap(part => wordWrap(part, maxWidth))
}

// Keep the address renderer responsible for line splitting and per-line positioning.
// Recompute after the real font loads; measuring a fallback font can overfill labels.
const lines = $derived.by(() => {
  void fontsReady
  return measureElement ? wrapText(addressText) : []
})
</script>

<span
  bind:this={measureElement}
  aria-hidden="true"
  class="pointer-events-none invisible fixed top-0 left-0 text-sm/6 whitespace-nowrap"
></span>

<div
  class="w-100:translate-x-5 pointer-events-none absolute top-1/2 right-2 flex translate-x-3 -translate-y-25.5 flex-col items-end gap-1 overflow-visible transition-all duration-300"
  style="width: max-content;"
>
  {#each lines as line, index}
    {#key `${featureKey}-${index}`}
      <span
        class={`bg-base-200 text-base-content pointer-events-none absolute inline-block origin-bottom-right rounded-full whitespace-nowrap ${
          line !== '' ? 'px-2 py-0.5 text-sm/6' : ''
        }`}
        style={`transform: translateX(-${addressLineRightPadding[index] ?? 0}px); rotate: -17deg; top: ${index * 34}px;`}
        in:fly={{ duration: 300, x: -100, delay: index * 200 }}
        out:fly={{ duration: 200, x: 100, delay: index * 200 }}
      >
        {line}
      </span>
    {/key}
  {/each}
</div>
