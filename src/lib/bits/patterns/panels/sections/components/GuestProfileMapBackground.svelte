<script lang="ts">
// SVELTE
import { onMount } from 'svelte'

const PULSE_COUNT = 24
const PULSE_LENGTH = 13
const PULSE_SPEED = 48
const PULSE_DECELERATION = 92
const PULSE_ACCELERATION = 50
const STOP_SECTION_LENGTH = 72
const STOP_CHANCE = 0.03
const STOP_DURATION = 2000
const TRACE_STEP = 3
const EDGE_INSET = 18
const MAX_TRACE_STEPS = 640

let mapElement: HTMLDivElement
let cityImage: HTMLImageElement
let pulseCanvas: HTMLCanvasElement
let isVisible = $state(false)

/** Returns whether a source pixel belongs to the map's luminous pink road network. */
function isRoadPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)

  if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) return false

  const offset = (pixelY * width + pixelX) * 4
  const red = pixels[offset]
  const green = pixels[offset + 1]
  const blue = pixels[offset + 2]

  return red > 84 && red - blue > 24 && red > green * 1.6
}

/** Scores the density of road pixels around a possible next point. */
function getRoadScore(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let score = 0

  for (let offsetY = -4; offsetY <= 4; offsetY += 2) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 2) {
      if (offsetX * offsetX + offsetY * offsetY > 16) continue
      if (isRoadPixel(pixels, width, height, x + offsetX, y + offsetY)) score += 1
    }
  }

  return score
}

/** Returns whether a point is close enough to count as an edge of the source map. */
function isMapEdge(x: number, y: number, width: number, height: number): boolean {
  return (
    x <= EDGE_INSET ||
    x >= width - EDGE_INSET ||
    y <= EDGE_INSET ||
    y >= height - EDGE_INSET
  )
}

/** Finds a bright road pixel where the road network enters from the source-map edge. */
function findRoadStart(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number] | null {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const edge = Math.floor(Math.random() * 4)
    const distanceAlongWidth = EDGE_INSET + Math.random() * (width - EDGE_INSET * 2)
    const distanceAlongHeight = EDGE_INSET + Math.random() * (height - EDGE_INSET * 2)
    let x = EDGE_INSET
    let y = EDGE_INSET

    if (edge === 0) x = distanceAlongWidth
    else if (edge === 1) {
      x = width - EDGE_INSET
      y = distanceAlongHeight
    } else if (edge === 2) {
      x = distanceAlongWidth
      y = height - EDGE_INSET
    } else y = distanceAlongHeight

    if (getRoadScore(pixels, width, height, x, y) >= 7) return [x, y]
  }

  return null
}

/** Chooses the direction with the most continuous road pixels from a starting point. */
function findRoadHeading(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let heading = Math.random() * Math.PI * 2
  let bestScore = -1

  for (let index = 0; index < 24; index += 1) {
    const candidate = (index / 24) * Math.PI * 2
    let score = 0

    for (let distance = 6; distance <= 30; distance += 4) {
      score += getRoadScore(
        pixels,
        width,
        height,
        x + Math.cos(candidate) * distance,
        y + Math.sin(candidate) * distance,
      )
    }

    if (score > bestScore) {
      bestScore = score
      heading = candidate
    }
  }

  return heading
}

/** Traces a road by scoring the next pixel neighbourhood while preferring gentle turns. */
function traceRoad(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: [number, number],
): Array<[number, number]> {
  const points: Array<[number, number]> = [start]
  const turns = [-0.72, -0.42, -0.18, 0, 0.18, 0.42, 0.72]
  let [x, y] = start
  let heading = findRoadHeading(pixels, width, height, x, y)

  for (let step = 0; step < MAX_TRACE_STEPS; step += 1) {
    let bestHeading = heading
    let bestScore = -Infinity

    for (const turn of turns) {
      const candidateHeading = heading + turn
      const nextX = x + Math.cos(candidateHeading) * TRACE_STEP
      const nextY = y + Math.sin(candidateHeading) * TRACE_STEP
      const nearbyRoadScore = getRoadScore(pixels, width, height, nextX, nextY)
      const aheadRoadScore = getRoadScore(
        pixels,
        width,
        height,
        nextX + Math.cos(candidateHeading) * 8,
        nextY + Math.sin(candidateHeading) * 8,
      )
      const score = nearbyRoadScore * 3 + aheadRoadScore - Math.abs(turn) * 2

      if (score > bestScore) {
        bestScore = score
        bestHeading = candidateHeading
      }
    }

    if (bestScore < 8) break

    heading = bestHeading
    x += Math.cos(heading) * TRACE_STEP
    y += Math.sin(heading) * TRACE_STEP
    points.push([x, y])
  }

  return points.length > 40 ? points : []
}

/** Generates a random edge-to-edge pulse path constrained to detected map-road pixels. */
function createRoadPath(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Array<[number, number]> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const start = findRoadStart(pixels, width, height)
    if (!start) break

    const path = traceRoad(pixels, width, height, start)

    if (path.length > 0) {
      const [endX, endY] = path[path.length - 1]
      if (isMapEdge(endX, endY, width, height)) return path
    }
  }

  return []
}

/** Returns the total length of a pixel-space polyline. */
function getPathLength(path: Array<[number, number]>): number {
  let length = 0

  for (let index = 1; index < path.length; index += 1) {
    length += Math.hypot(
      path[index][0] - path[index - 1][0],
      path[index][1] - path[index - 1][1],
    )
  }

  return length
}

/** Finds a point at a specific distance along a pixel-space polyline. */
function getPointAtDistance(
  path: Array<[number, number]>,
  distance: number,
): [number, number] {
  let traversed = 0

  for (let index = 1; index < path.length; index += 1) {
    const [previousX, previousY] = path[index - 1]
    const [nextX, nextY] = path[index]
    const segmentLength = Math.hypot(nextX - previousX, nextY - previousY)

    if (traversed + segmentLength >= distance) {
      const progress = (distance - traversed) / segmentLength
      return [
        previousX + (nextX - previousX) * progress,
        previousY + (nextY - previousY) * progress,
      ]
    }

    traversed += segmentLength
  }

  return path[path.length - 1]
}

/** Draws one light segment exactly along the sampled road path. */
function drawPulse(
  context: CanvasRenderingContext2D,
  path: Array<[number, number]>,
  headDistance: number,
): void {
  if (path.length === 0) return

  const pathLength = getPathLength(path)
  const tailDistance = Math.max(0, headDistance - PULSE_LENGTH)
  const endDistance = Math.min(pathLength, headDistance)

  if (endDistance <= 0) return

  const drawSegment = (lineWidth: number, strokeStyle: string, blur: number): void => {
    const [startX, startY] = getPointAtDistance(path, tailDistance)
    context.beginPath()
    context.moveTo(startX, startY)

    for (
      let distance = tailDistance + TRACE_STEP;
      distance < endDistance;
      distance += TRACE_STEP
    ) {
      const [x, y] = getPointAtDistance(path, distance)
      context.lineTo(x, y)
    }

    const [endX, endY] = getPointAtDistance(path, endDistance)
    context.lineTo(endX, endY)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = lineWidth
    context.strokeStyle = strokeStyle
    context.shadowBlur = blur
    context.shadowColor = '#ff4f93'
    context.stroke()
  }

  context.save()
  drawSegment(14, 'rgb(255 62 140 / 36%)', 10)
  drawSegment(3, '#fff0f6', 5)
  context.restore()
}

onMount(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const observer = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry.isIntersecting && entry.intersectionRatio > 0.05
      if (isVisible) startAnimation()
    },
    { threshold: [0, 0.05] },
  )
  let pixels: Uint8ClampedArray | null = null
  let mapWidth = 0
  let mapHeight = 0
  let context: CanvasRenderingContext2D | null = null
  const pulses = Array.from({ length: PULSE_COUNT }, () => ({
    path: [] as Array<[number, number]>,
    distance: 0,
    speed: PULSE_SPEED,
    mode: 0,
    holdUntil: 0,
    nextStopAt: STOP_SECTION_LENGTH,
  }))
  let hasInitializedPulses = false
  let animationFrame: number | undefined
  let previousTimestamp = 0

  // Use the image itself as the road graph, avoiding paths that only approximate its streets.
  function prepareRoadPixels(): void {
    if (!cityImage.naturalWidth || !cityImage.naturalHeight) return

    const sourceCanvas = document.createElement('canvas')
    mapWidth = cityImage.naturalWidth
    mapHeight = cityImage.naturalHeight
    sourceCanvas.width = mapWidth
    sourceCanvas.height = mapHeight
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    context = pulseCanvas.getContext('2d')

    if (!sourceContext || !context) return

    sourceContext.drawImage(cityImage, 0, 0)
    pixels = sourceContext.getImageData(0, 0, mapWidth, mapHeight).data
    pulseCanvas.width = mapWidth
    pulseCanvas.height = mapHeight
    startAnimation()
  }

  function stopAnimation(): void {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    previousTimestamp = 0
    context?.clearRect(0, 0, mapWidth, mapHeight)
  }

  function animate(timestamp: number): void {
    if (!isVisible || reducedMotion.matches || !pixels || !context) {
      stopAnimation()
      return
    }

    context.clearRect(0, 0, mapWidth, mapHeight)
    const elapsedSeconds = previousTimestamp
      ? Math.min(0.1, (timestamp - previousTimestamp) / 1000)
      : 0
    previousTimestamp = timestamp

    if (!hasInitializedPulses) {
      for (const [index, pulse] of pulses.entries()) {
        pulse.path = createRoadPath(pixels, mapWidth, mapHeight)
        pulse.distance = (getPathLength(pulse.path) * index) / PULSE_COUNT
        pulse.speed = PULSE_SPEED
        pulse.mode = 0
        pulse.holdUntil = 0
        pulse.nextStopAt = pulse.distance + STOP_SECTION_LENGTH
      }
      hasInitializedPulses = true
    }

    for (const pulse of pulses) {
      if (pulse.distance >= getPathLength(pulse.path)) {
        pulse.path = createRoadPath(pixels, mapWidth, mapHeight)
        pulse.distance = 0
        pulse.speed = PULSE_SPEED
        pulse.mode = 0
        pulse.holdUntil = 0
        pulse.nextStopAt = STOP_SECTION_LENGTH
      }

      if (pulse.mode === 0) {
        pulse.distance += pulse.speed * elapsedSeconds

        if (pulse.distance >= pulse.nextStopAt) {
          if (Math.random() < STOP_CHANCE) pulse.mode = 1
          else pulse.nextStopAt += STOP_SECTION_LENGTH
        }
      } else if (pulse.mode === 1) {
        pulse.speed = Math.max(0, pulse.speed - PULSE_DECELERATION * elapsedSeconds)
        pulse.distance += pulse.speed * elapsedSeconds

        if (pulse.speed === 0) {
          pulse.mode = 2
          pulse.holdUntil = timestamp + STOP_DURATION
        }
      } else if (pulse.mode === 2) {
        if (timestamp >= pulse.holdUntil) pulse.mode = 3
      } else {
        pulse.speed = Math.min(
          PULSE_SPEED,
          pulse.speed + PULSE_ACCELERATION * elapsedSeconds,
        )
        pulse.distance += pulse.speed * elapsedSeconds

        if (pulse.speed === PULSE_SPEED) {
          pulse.mode = 0
          pulse.nextStopAt = pulse.distance + STOP_SECTION_LENGTH
        }
      }

      drawPulse(context, pulse.path, pulse.distance)
    }

    animationFrame = requestAnimationFrame(animate)
  }

  function startAnimation(): void {
    if (animationFrame || !isVisible || reducedMotion.matches || !pixels || !context)
      return
    animationFrame = requestAnimationFrame(animate)
  }

  function handleMotionChange(): void {
    if (reducedMotion.matches) stopAnimation()
    else startAnimation()
  }

  observer.observe(mapElement)
  reducedMotion.addEventListener('change', handleMotionChange)

  if (cityImage.complete) prepareRoadPixels()
  else cityImage.addEventListener('load', prepareRoadPixels, { once: true })

  return () => {
    observer.disconnect()
    reducedMotion.removeEventListener('change', handleMotionChange)
    cityImage.removeEventListener('load', prepareRoadPixels)
    stopAnimation()
  }
})
</script>

<div
  bind:this={mapElement}
  class="guest-map pointer-events-none absolute inset-0 z-0 overflow-hidden"
  aria-hidden="true"
>
  <img
    bind:this={cityImage}
    class="guest-map__city"
    src="/guest-profile-map-flyover.png"
    alt=""
    draggable="false"
  >
  <canvas bind:this={pulseCanvas} class="guest-map__pulse-canvas"></canvas>
  <div class="guest-map__shade"></div>
</div>

<style>
.guest-map {
  background: #0b0610;
}

.guest-map__city,
.guest-map__pulse-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 178%;
  height: 178%;
  max-width: none;
  object-fit: cover;
  transform: translate3d(-50%, -50%, 0) scale(1.24);
}

.guest-map__city {
  z-index: 0;
}

.guest-map__pulse-canvas {
  z-index: 1;
}

.guest-map__shade {
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    radial-gradient(circle at 50% 47%, transparent 18%, rgb(10 3 10 / 20%) 100%),
    linear-gradient(
      to bottom,
      rgb(0 0 0 / 34%),
      transparent 30%,
      transparent 65%,
      rgb(0 0 0 / 58%)
    );
}

@media (prefers-reduced-motion: reduce) {
  .guest-map__pulse-canvas {
    display: none;
  }
}
</style>
