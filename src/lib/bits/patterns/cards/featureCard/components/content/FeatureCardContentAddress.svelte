<script lang="ts">
// SVELTE
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

function measureTextWidth(text: string): number {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return 0

  context.font = '0.875rem/1.25rem sans-serif'
  return context.measureText(text).width
}

function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(' ')
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

  return lines
}

function wrapText(text: string, maxWidth: number = 170): string[] {
  const address = text.replace(', Hong Kong', '').replace('Hong Kong, ', '')
  const lastCommaIndex = address.lastIndexOf(',')

  if (lastCommaIndex > -1) {
    const parts = [
      address.slice(0, lastCommaIndex),
      address.slice(lastCommaIndex + 1).trim(),
    ]
    if (parts.every((part, index) => measureTextWidth(part) <= maxWidth - index * 40)) {
      return parts
    }
  }

  const firstCommaIndex = address.indexOf(',')

  if (firstCommaIndex > -1 && firstCommaIndex !== lastCommaIndex) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1).trim(),
    ]
    if (parts.every(part => measureTextWidth(part) <= maxWidth)) {
      return parts
    }
  }

  if (
    firstCommaIndex > -1 &&
    lastCommaIndex > -1 &&
    firstCommaIndex !== lastCommaIndex
  ) {
    const parts = [
      address.slice(0, firstCommaIndex),
      address.slice(firstCommaIndex + 1, lastCommaIndex).trim(),
      address.slice(lastCommaIndex + 1).trim(),
    ]
    if (parts.every(part => measureTextWidth(part) <= maxWidth)) return parts
  }

  return wordWrap(address, maxWidth)
}

const addressLines = $derived(wrapText(addressText))

// Keep the address renderer responsible for line splitting and line count padding.
const lines = $derived(
  Array(4)
    .fill('')
    .map((_, index) => addressLines[index] || ''),
)
</script>

<div
  class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-25.5 translate-x-3 flex-col items-end gap-1 overflow-visible transition-all duration-300 w-100:translate-x-5"
  style="width: max-content;"
>
  {#each lines as line, index}
    {#key `${featureKey}-${index}`}
      <span
        class={`pointer-events-none absolute inline-block origin-bottom-right whitespace-nowrap rounded-full bg-[#1D232A] ${
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
