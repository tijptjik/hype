/** Camera-only pose shared by independent gallery models; pan is relative to each fitted frame. */
export type GalleryCameraPose = {
  bearing: number
  tilt: number
  zoom: number
  panX: number
  panY: number
}

/** Session-scoped camera bus. It never shares model data, floor selection or route state. */
export class GalleryCamera {
  pose = $state.raw<GalleryCameraPose | null>(null)
  source = $state<object | null>(null)

  /** Publish a user gesture for the other gallery cards.
   * @param source Owning scene token. @param pose Normalized camera pose. @returns Nothing.
   */
  update(source: object, pose: GalleryCameraPose): void {
    this.source = source
    this.pose = pose
  }
}
