// SVELTE
import { getContext, setContext, type ComponentProps } from 'svelte'
// TYPES
import type Maplet from '#lib/bits/patterns/maps/Maplet.svelte'

type MapProps = ComponentProps<typeof Maplet>
const ADMIN_MAP = Symbol('admin-map')

/** Layout-owned renderer handoff; routes own only an outlet and its current props. */
export class AdminMap {
  props = $state.raw<MapProps | null>(null)
  target = $state.raw<HTMLElement | null>(null)
  container: HTMLElement | null = null
  parking: HTMLElement | null = null

  /** Drop retained map data when the signed-in account changes. @returns Nothing. */
  clear(): void {
    if (this.target) this.release(this.target)
    this.props = null
  }

  /** Attach the shared renderer to a route's map outlet.
   * @param target Route-owned outlet. @param props Current map inputs.
   * @returns Nothing.
   */
  attach(target: HTMLElement, props: MapProps): void {
    this.target = target
    this.props = props
    if (this.container && this.container.parentElement !== target)
      target.append(this.container)
  }

  /** Release route callbacks and park the canvas before the outlet is removed.
   * @param target Departing outlet; stale cleanup cannot detach a newer owner.
   * @returns Nothing.
   */
  release(target: HTMLElement): void {
    if (this.target !== target) return
    this.target = null
    if (this.container && this.parking) this.parking.append(this.container)
    if (!this.props) return
    // Retain camera inputs, but never keep snippets or event handlers from a dead page.
    this.props = {
      coordinates: this.props.coordinates,
      initialCenter: this.props.initialCenter,
      initialZoom: this.props.initialZoom,
      mapStyleCode: this.props.mapStyleCode,
      addressMeta: null,
      draggable: false,
      showMarker: this.props.showMarker,
    }
  }
}

/** Provide one map owner for this admin layout. @returns The new owner. */
export function setAdminMap(): AdminMap {
  return setContext(ADMIN_MAP, new AdminMap())
}

/** Resolve the optional layout owner. @returns Owner, or undefined in isolated forms. */
export function getAdminMap(): AdminMap | undefined {
  return getContext<AdminMap | undefined>(ADMIN_MAP)
}
