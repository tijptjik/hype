// MODEL VIEWER
import type { ModelViewerElement } from '@google/model-viewer'
import { $correlatedObjects } from '@google/model-viewer/lib/features/scene-graph/three-dom-element.js'
import { $needsRender } from '@google/model-viewer/lib/model-viewer-base.js'

// TOC: Material bindings | GPU interpolation
type Layer = { government: number; revised: number; generated: number }
type Shader = {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader: string
}
type RenderMaterial = {
  map: unknown
  needsUpdate: boolean
  onBeforeCompile: (shader: Shader, renderer: unknown) => void
  customProgramCacheKey: () => string
}
type Blend = { set: (value: number) => void; dispose: () => void }

/** Bind the two registered UV sets to a single rendered scene.
 * @param viewer Loaded comparison GLB.
 * @param signal Component lifetime.
 * @returns A continuous 0–2 blend control and its cleanup.
 * @remarks The default glTF material retains government UVs. Both alternatives use TEXCOORD_1.
 */
export async function bindTextureBlend(
  viewer: ModelViewerElement,
  signal: AbortSignal,
): Promise<Blend> {
  const layers = (
    viewer.originalGltfJson as { extras?: { exteriorTextureLayers?: Layer[] } } | null
  )?.extras?.exteriorTextureLayers
  const materials = viewer.model?.materials
  if (!layers?.length || !materials) throw new Error('Missing exterior texture layers.')
  const indices = [
    ...new Set(layers.flatMap(l => [l.government, l.revised, l.generated])),
  ]
  if (!indices.every(i => Number.isInteger(i) && materials[i]))
    throw new Error('Invalid texture material.')
  await Promise.all(indices.map(i => materials[i].ensureLoaded()))
  signal.throwIfAborted()
  const underlying = (index: number) =>
    (materials[index] as unknown as { [$correlatedObjects]: Set<RenderMaterial> })[
      $correlatedObjects
    ]
  const amount = { value: 1 }
  const restore: Array<() => void> = []
  // Resolve every texture before mutating the live scene, including lazily loaded glTF variants.
  const bindings = layers.map(l => {
    const revised = underlying(l.revised).values().next().value?.map
    const generated = underlying(l.generated).values().next().value?.map
    const base = underlying(l.government)
    if (!revised || !generated || !base.size)
      throw new Error('Missing exterior texture.')
    return { base, revised, generated }
  })
  for (const { base, revised, generated } of bindings) {
    for (const material of base) {
      const compile = material.onBeforeCompile
      const cacheKey = material.customProgramCacheKey
      const key = cacheKey.call(material) + '/exterior-texture-blend-v1'
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer)
        shader.uniforms.exteriorMix = amount
        shader.uniforms.revisedMap = { value: revised }
        shader.uniforms.generatedMap = { value: generated }
        shader.vertexShader =
          `#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec2 exteriorUv;
` +
          shader.vertexShader.replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\nexteriorUv = uv1;',
          )
        shader.fragmentShader =
          `varying vec2 exteriorUv;
uniform float exteriorMix;
uniform sampler2D revisedMap;
uniform sampler2D generatedMap;
` +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
vec3 revisedColor = texture2D(revisedMap, exteriorUv).rgb * diffuse;
vec3 generatedColor = texture2D(generatedMap, exteriorUv).rgb * diffuse;
diffuseColor.rgb = mix(mix(diffuseColor.rgb, revisedColor, min(exteriorMix, 1.0)), generatedColor, max(exteriorMix - 1.0, 0.0));`,
          )
      }
      material.customProgramCacheKey = () => key
      material.needsUpdate = true
      restore.push(() => {
        material.onBeforeCompile = compile
        material.customProgramCacheKey = cacheKey
        material.needsUpdate = true
      })
    }
  }
  viewer[$needsRender]()
  return {
    set(value) {
      amount.value = Math.min(2, Math.max(0, value))
      viewer[$needsRender]()
    },
    dispose() {
      for (const reset of restore) reset()
      viewer[$needsRender]()
    },
  }
}
