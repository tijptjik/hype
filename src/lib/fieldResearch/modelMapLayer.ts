// MAP
import { MercatorCoordinate, type CustomLayerInterface } from 'maplibre-gl'
// 3D
import {
  AmbientLight,
  Box3,
  Camera,
  DirectionalLight,
  LoadingManager,
  Matrix4,
  Mesh,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// COORDINATES
import proj4 from 'proj4'

// EPSG:2326 with the EPSG:1825 HK1980-to-WGS84 transformation. proj4 uses position-vector rotation signs.
const grid = proj4(
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs',
  'WGS84',
)

export type SessionMapBuilding = {
  id: string
  title: string
  exteriorUrl: string | null
  coordinates: [number, number] | null
}

type LocatedBuilding = SessionMapBuilding & { coordinates: [number, number] }

/** Release GPU geometry and materials, including glTF ImageBitmaps outside Three's cache.
 * @param root Imported scene. @returns Nothing.
 */
function disposeModel(root: Object3D): void {
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    for (const material of [object.material].flat()) {
      for (const texture of Object.values(material)) {
        if (texture instanceof Texture) {
          texture.dispose()
          texture.image?.close?.()
        }
      }
      material.dispose()
    }
  })
}

/** Render the session's CSDI meshes together in the basemap's own WebGL context.
 * @param buildings Buildings with a geographic anchor.
 * @param onProgress Loaded and failed model counts for the current layer.
 * @param onSurveyedPosition Position the building label on its imported geometry.
 * @returns A disposable MapLibre custom layer.
 * @remarks CSDI glTF is Y-up, with HK1980 easting on X and negative northing on Z.
 */
export function sessionModelLayer(
  buildings: LocatedBuilding[],
  onProgress: (loaded: number, failed: number) => void,
  onSurveyedPosition: (id: string, coordinates: [number, number]) => void,
): CustomLayerInterface {
  const scene = new Scene()
  const camera = new Camera()
  const loader = new GLTFLoader(new LoadingManager())
  const origin = buildings[0].coordinates
  const [east, north] = grid.inverse(origin)
  const anchor = MercatorCoordinate.fromLngLat(origin)
  const metre = anchor.meterInMercatorCoordinateUnits()
  // Project both local grid axes to preserve grid north as well as the source scale.
  const eastEnd = MercatorCoordinate.fromLngLat(
    grid.forward<[number, number]>([east + 100, north]),
  )
  const northEnd = MercatorCoordinate.fromLngLat(
    grid.forward<[number, number]>([east, north + 100]),
  )
  const transform = new Matrix4()
    .makeBasis(
      new Vector3(eastEnd.x - anchor.x, eastEnd.y - anchor.y, 0).divideScalar(100),
      new Vector3(0, 0, metre),
      new Vector3(anchor.x - northEnd.x, anchor.y - northEnd.y, 0).divideScalar(100),
    )
    .setPosition(anchor.x, anchor.y, anchor.z)
  let renderer: WebGLRenderer
  let disposed = false
  let loaded = 0
  let failed = 0
  let reportFrame = false
  return {
    id: 'session-exterior-models',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl })
      renderer.autoClear = false
      const sun = new DirectionalLight(0xffffff, 2)
      sun.position.set(2, 4, 3)
      scene.add(new AmbientLight(0xffffff, 1.8), sun)
      for (const building of buildings) {
        if (!building.exteriorUrl) continue
        void loader
          .loadAsync(building.exteriorUrl)
          .then(({ scene: model }) => {
            if (disposed) return disposeModel(model)
            const bounds = new Box3().setFromObject(model)
            const center = bounds.getCenter(new Vector3())
            const [pointEast, pointNorth] = grid.inverse(building.coordinates)
            // Preserve surveyed slice offsets. Locally centred meshes use the Location point.
            if (
              Math.abs(center.x - pointEast) < 10000 &&
              Math.abs(center.z + pointNorth) < 10000
            ) {
              model.position.x -= east
              model.position.z += north
              onSurveyedPosition(
                building.id,
                grid.forward<[number, number]>([center.x, -center.z]),
              )
            } else {
              model.position.set(
                pointEast - east - center.x,
                -bounds.min.y,
                north - pointNorth - center.z,
              )
            }
            scene.add(model)
            loaded++
            reportFrame = true
            map.triggerRepaint()
          })
          .catch(() => {
            if (!disposed) onProgress(loaded, ++failed)
          })
      }
    },
    render(_gl, args) {
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix)
        .multiply(transform)
      renderer.resetState()
      renderer.render(scene, camera)
      if (reportFrame) {
        reportFrame = false
        onProgress(loaded, failed)
      }
    },
    onRemove() {
      disposed = true
      loader.manager.abort()
      disposeModel(scene)
      renderer.dispose()
    },
  }
}
