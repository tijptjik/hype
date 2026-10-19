// PRESENTATION
import {
  breadlineBrand,
  breadlineMarkerState,
  type BreadlineMarkerState,
} from '#lib/features/breadlinePresentation.js'
import { countryFlagCodes } from '#lib/features/countryFlags.js'
import {
  presentationProperty,
  type PresentationFeature,
} from '#lib/features/presentationProperties.js'
import type { MarkerStyleCode } from '#lib/features/markerStyle.js'

export type CustomMarkerInput = {
  feature: PresentationFeature
  imageSrc: string | null
  state?: BreadlineMarkerState
}
export type CustomMarkerModel = {
  kind: 'pin' | 'flag' | 'breadline'
  imageSrc?: string | null
  flags?: string[]
  badge?: string
  brandColor?: string
  label: string
  state?: BreadlineMarkerState
}
/** Code-owned providers consume data, never scripts/HTML stored in the database. */
export type CustomMarkerProvider = (input: CustomMarkerInput) => CustomMarkerModel
export const CUSTOM_MARKER_PROVIDERS: Readonly<
  Partial<Record<MarkerStyleCode, CustomMarkerProvider>>
> = {
  pin: () => ({ kind: 'pin', label: 'Location' }),
  flag: ({ feature, imageSrc }) => ({
    kind: 'flag',
    imageSrc,
    flags: countryFlagCodes(presentationProperty(feature, 'country')),
    label: presentationProperty(feature, 'country') || 'Country unavailable',
  }),
  breadline: ({ feature, state }) => {
    const brand = breadlineBrand(feature)
    const availability = breadlineMarkerState(feature, state)
    return {
      kind: 'breadline',
      badge: brand.badge,
      brandColor: brand.color,
      state: availability,
      label: `${brand.name}; ${availability.dropoff ? 'drop-off' : availability.yield + ' yield'}; ${availability.source}${availability.claimed ? '; claimed' : ''}`,
    }
  },
}

/**
 * Resolves a registered custom renderer without coupling it to MapLibre.
 * @param code Persisted marker style.
 * @param input Feature properties and date-scoped state.
 * @returns Presentation model or null for the existing photo/dot renderers.
 */
export function customMarkerModel(
  code: MarkerStyleCode,
  input: CustomMarkerInput,
): CustomMarkerModel | null {
  return CUSTOM_MARKER_PROVIDERS[code]?.(input) ?? null
}

/**
 * Produces an invalidation signature including every visible data dependency.
 * @param model Resolved data-driven marker model.
 * @returns Stable signature for the existing marker reconciliation loop.
 */
export function customMarkerSignature(model: CustomMarkerModel): string {
  return `custom:${JSON.stringify(model)}`
}

/**
 * Builds a circular flag/brand marker or plain pin using native DOM elements.
 * @param model Validated provider output.
 * @returns Marker element; selection/positioning remain owned by the caller.
 * @remarks Feature photos are never requested by the Breadline provider.
 */
export function createCustomMarkerElement(model: CustomMarkerModel): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'marker-container marker-container--feature marker-fade-in'
  root.dataset.markerSignature = customMarkerSignature(model)
  root.dataset.markerKind = model.kind
  root.title = model.label
  root.setAttribute('aria-label', model.label)
  const frame = document.createElement('div')
  frame.className =
    'marker-inner relative grid place-items-center overflow-hidden rounded-full shadow-md'
  Object.assign(frame.style, {
    width: '64px',
    height: '64px',
    background: '#738078',
    border: '2px solid white',
  })
  root.append(frame)
  if (model.kind === 'pin') {
    Object.assign(frame.style, {
      width: '32px',
      height: '40px',
      borderRadius: '50% 50% 50% 0',
      transform: 'rotate(-45deg)',
      background: '#334155',
    })
    const dot = document.createElement('span')
    Object.assign(dot.style, {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: 'white',
    })
    frame.append(dot)
    return root
  }
  if (model.kind === 'flag') {
    const flags = model.flags ?? []
    flags.forEach((code, index) => {
      const flag = document.createElement('img')
      flag.src = `/flags/${code}.svg`
      flag.alt = ''
      flag.draggable = false
      Object.assign(flag.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
      })
      if (flags.length > 1) {
        const points = ['50% 50%']
        for (let step = 0; step <= 24; step++) {
          const angle =
            ((((index + step / 24) / flags.length) * 360 - 90) * Math.PI) / 180
          points.push(`${50 + 80 * Math.cos(angle)}% ${50 + 80 * Math.sin(angle)}%`)
        }
        flag.style.clipPath = `polygon(${points.join(',')})`
      }
      frame.append(flag)
    })
  } else {
    const state = model.state!
    frame.dataset.yield = state.yield
    frame.dataset.claimed = String(state.claimed)
    frame.dataset.source = state.source
    const colors = {
      high: '#2e8968',
      medium: '#d49a26',
      low: '#c76641',
      none: '#6b7280',
      unknown: '#94a3a0',
    }
    frame.style.background = colors[state.yield]
    frame.style.borderColor = state.source === 'reported' ? colors[state.yield] : '#fff'
    if (state.claimed) frame.style.outline = '3px dashed #173e35'
    if (state.dropoff) frame.style.borderRadius = '14px'
  }
  const center = document.createElement('div')
  Object.assign(center.style, {
    position: 'relative',
    width: '48px',
    height: '48px',
    borderRadius: model.state?.dropoff ? '8px' : '50%',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    background: model.brandColor ?? '#f7f5ed',
    color: model.brandColor ? '#fff' : '#334155',
    font: '700 18px system-ui',
    border: '2px solid #fff',
  })
  if (model.kind === 'flag' && model.imageSrc) {
    const image = document.createElement('img')
    image.src = model.imageSrc
    image.alt = ''
    image.draggable = false
    image.decoding = 'async'
    Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'cover' })
    image.addEventListener(
      'error',
      () => {
        image.remove()
        center.textContent = '•'
      },
      { once: true },
    )
    center.append(image)
  } else center.textContent = model.state?.dropoff ? '↓' : (model.badge ?? '•')
  frame.append(center)
  return root
}
