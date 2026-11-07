// I18N
import { formatDistanceToNow } from 'date-fns'
import { getFPI18n, getI18n, getLocaleKey, m } from '#lib/i18n.js'
import { displayedLocales } from '#lib/bits/custom/localeControls/localeControls.js'
import {
  restoreProfileLocales,
  type ProfileLocaleState,
} from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// API
import { getMetadata } from '#lib/api/image.remote.js'
// DOMAIN
import { calculateDistance } from '#lib/utils/geocoding.js'
import { featureCreationPreview } from '#lib/revisions/featureCreationPreview.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// TYPES
import type { Point } from 'geojson'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { TaskFieldItem } from '#lib/bits/patterns/tasks/task.types.js'

type TaskReviewDetailsModel = Readonly<{
  preview: ReturnType<typeof featureCreationPreview> | Task['feature'] | undefined
  localeState: ProfileLocaleState
  shownLocales: ReturnType<typeof displayedLocales>
  isNewFeature: boolean
  isReportedMissing: boolean
  isReviewed: boolean
  featureAddress: string
  effectiveLayerId: string | null
  featureFields: TaskFieldItem[]
  reportDate: string
  captureDate: string
  reportDistance: string
}>

/** Derives review fields and fetches optional report metadata without blocking the workspace.
 * @param getTask Fresh task or read-only queue preview.
 * @param getType Task type known before the editor payload arrives.
 * @param getLoading Whether the authoritative editor query is pending.
 * @param getLocaleState Controlled translation selection.
 * @returns Reactive field presentation; late metadata cannot overwrite a newer task.
 */
export function useTaskReviewDetails(
  getTask: () => Task | null,
  getType: () => string | undefined,
  getLoading: () => boolean,
  getLocaleState: () => ProfileLocaleState | undefined,
): TaskReviewDetailsModel {
  const task = $derived(getTask())
  const type = $derived(getType())
  const loading = $derived(getLoading())
  const controlledLocaleState = $derived(getLocaleState())
  const appCtx = getSurfaceCtx()

  /** Formats retained report dates without treating invalid dates as current.
   * @param value Stored date.
   * @returns Relative date or an empty-value marker.
   */
  function formatRelativeDate(value: string | null | undefined): string {
    if (!value) return '-'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'

    return formatDistanceToNow(date, { addSuffix: true })
  }

  let imageMetadata = $state<{
    latitude?: string | null
    longitude?: string | null
    capturedAt?: string | null
  } | null>(null)

  const preview = $derived(
    task?.creationProposal
      ? featureCreationPreview(task?.creationProposal.content)
      : task?.feature,
  )
  const localeState = $derived(
    controlledLocaleState ??
      restoreProfileLocales([canonicalContentTag(getLocaleKey())], preview?.i18n ?? {}),
  )
  const shownLocales = $derived(displayedLocales(localeState, localeState.expanded))
  const isNewFeature = $derived(type === 'newFeature')
  const isReportedMissing = $derived(type === 'reportedMissing')
  const isReviewed = $derived(Boolean(task?.isReviewed))
  // Review exposes submitted translations independently of generated-text preferences.
  const featureAddress = $derived(
    getI18n(
      preview ?? undefined,
      'displayAddress',
      appCtx.getUserPreferences(),
      '-',
      true,
    ),
  )
  const effectiveLayerId = $derived(
    task?.creationProposal?.scope.layerId ?? task?.feature?.layerId ?? null,
  )
  const featureCoordinates = $derived(
    ((
      (task?.creationProposal?.content.placement.geometry ?? task?.feature?.geometry) as
        | Point
        | undefined
    )?.coordinates as [number, number] | undefined) ?? null,
  )
  const featureFields = $derived.by<TaskFieldItem[]>(() => {
    if (task?.creationProposal)
      return Object.entries(task?.creationProposal.content.properties)
        .map(([id, property]) => {
          const selection = property.selection
          const definition = selection.definition
          const labels = {
            i18n: Object.fromEntries(
              Object.entries(definition.labels).map(([locale, text]) => [
                locale,
                { label: text.value },
              ]),
            ),
          }
          const translations = {
            i18n: Object.fromEntries(
              Object.entries(property.translations).map(([locale, text]) => [
                locale,
                { value: text.value },
              ]),
            ),
          }
          const options = {
            i18n: Object.fromEntries(
              Object.entries(definition.selectedOption?.translations ?? {}).map(
                ([locale, text]) => [locale, { value: text.value }],
              ),
            ),
          }
          return {
            label: getI18n(labels, 'label', appCtx.getUserPreferences(), id, true),
            value:
              getI18n(translations, 'value', appCtx.getUserPreferences(), '', true) ||
              getI18n(options, 'value', appCtx.getUserPreferences(), '', true) ||
              definition.selectedOption?.value ||
              selection.value ||
              selection.valueJson ||
              '',
          }
        })
        .filter(item => item.value.trim().length > 0)
    return (task?.feature?.properties ?? [])
      .filter(property => Boolean(property.property))
      .map(property => {
        const value = getFPI18n(property, appCtx.getUserPreferences()) ?? ''
        return {
          label:
            getI18n(property.property, 'label', appCtx.getUserPreferences()) ||
            property.propertyId,
          value,
        }
      })
      .filter(
        item =>
          item.value.trim().length > 0 &&
          item.value !== '-' &&
          item.value !== m.great_crazy_squid_promise(),
      )
  })
  const reportDate = $derived(formatRelativeDate(task?.createdAt))
  const captureDate = $derived(formatRelativeDate(imageMetadata?.capturedAt))
  const reportDistance = $derived.by(() => {
    if (!featureCoordinates || !imageMetadata?.latitude || !imageMetadata?.longitude) {
      return '-'
    }

    const latitude = Number.parseFloat(imageMetadata.latitude)
    const longitude = Number.parseFloat(imageMetadata.longitude)

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return '-'
    }

    // GeoJSON stores longitude first; the geodesic helper accepts latitude first and returns metres.
    const distance = calculateDistance(
      featureCoordinates[1],
      featureCoordinates[0],
      latitude,
      longitude,
    )

    return Number.isFinite(distance)
      ? `${distance.toFixed(0)} ${m.plane_zany_fish_value()}`
      : '-'
  })

  $effect(() => {
    const image = task?.images?.[0]?.image
    if (loading || !image?.publicId || !isReportedMissing) {
      imageMetadata = null
      return
    }

    let cancelled = false
    imageMetadata = null
    void getMetadata({
      publicId: image.publicId,
      env: image.env ?? undefined,
      profile: 'basic',
      imageRevisionId: image.imageRevisionId ?? undefined,
      featureId: task?.featureId ?? undefined,
      meta: {
        isAdminRequest: true,
      },
    })
      .then(response => {
        if (!cancelled) imageMetadata = response?.data ?? null
      })
      .catch(() => {
        if (!cancelled) imageMetadata = null
      })
    return () => {
      cancelled = true
    }
  })
  return {
    get preview() {
      return preview
    },
    get localeState() {
      return localeState
    },
    get shownLocales() {
      return shownLocales
    },
    get isNewFeature() {
      return isNewFeature
    },
    get isReportedMissing() {
      return isReportedMissing
    },
    get isReviewed() {
      return isReviewed
    },
    get featureAddress() {
      return featureAddress
    },
    get effectiveLayerId() {
      return effectiveLayerId
    },
    get featureFields() {
      return featureFields
    },
    get reportDate() {
      return reportDate
    },
    get captureDate() {
      return captureDate
    },
    get reportDistance() {
      return reportDistance
    },
  }
}
