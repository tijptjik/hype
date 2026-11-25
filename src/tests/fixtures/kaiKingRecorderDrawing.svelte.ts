// SVELTE
import { mount } from 'svelte'
// RECORDER
import IndoorDrawing from '../../../apps/recorder/src/lib/IndoorDrawing.svelte'
// TYPES
import type { InteriorPin, RecorderMap } from '../../../src/lib/fieldResearch/recorder'

/** Mount the Recorder drawing and expose the pin returned by its normal selection callback.
 * @param map Published map for this session. @param buildingId Assigned building.
 * @returns Nothing. The host retains the most recent selection for the browser assertion.
 */
export function openDrawing(map: RecorderMap, buildingId: string): void {
  let pin = $state<InteriorPin | null>(null)
  const host = document.createElement('div')
  host.id = 'kai-drawing'
  host.style.cssText =
    'position:fixed;inset:0;background:white;z-index:99999;padding:20px'
  document.body.append(host)
  mount(IndoorDrawing, {
    target: host,
    props: {
      map,
      get pin() {
        return pin
      },
      units: [],
      locationId: buildingId,
      buildingId,
      onpick: (next, id) => {
        pin = next
        host.dataset.placement = JSON.stringify({ pin: next, locationId: id })
      },
    },
  })
}
