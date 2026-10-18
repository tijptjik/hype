// I18N
import { getLocaleKey } from '#lib/i18n.js'
// ENUMS
import { supportedLocaleKeys, type NewFeatureMode } from '#lib/enums.js'
// TYPES
import type { DeepPartial, LocaleKey } from '#lib/types.js'
import type { NewFeatureTask } from '#lib/api/services/taskCreation.types.js'
import type { FeatureI18nFieldKeys } from '#lib/db/zod/schema/feature.js'

/** Surface-local creation payload and stage, independent of queries and panels. */
export class FeatureDraft {
  // New Feature -- The new feature to be created
  current: DeepPartial<NewFeatureTask> | null = $state(null)
  mode: NewFeatureMode | null = $state(null)

  /** Changes creation stage. @param mode Next stage, or null. @returns Nothing. */
  setMode = (mode: NewFeatureMode | null): void => {
    this.mode = mode
  }

  /** Clears creation stage. @returns Nothing. */
  resetMode = (): void => {
    this.mode = null
  }

  /** Replaces the draft and initializes missing locale fields. @param newFeature Draft payload. @returns Nothing. */
  set = (newFeature: DeepPartial<NewFeatureTask>): void => {
    // Initialize with proper locale structure for all required locales
    if (newFeature.feature && !newFeature.feature.i18n) {
      const feature = newFeature.feature
      const featureI18n: NonNullable<typeof feature.i18n> = {}
      feature.i18n = featureI18n
      supportedLocaleKeys.forEach(locale => {
        featureI18n[locale as LocaleKey] = {
          ...featureI18n[locale as LocaleKey],
          title: undefined,
          description: undefined,
          displayAddress: '',
          displayAddressGen: false,
        }
      })
    }
    this.current = newFeature
  }

  /** Merges task fields and feature fields. @param newFeature Partial draft changes. @returns Nothing. */
  update = (newFeature: DeepPartial<NewFeatureTask>): void => {
    this.current = {
      ...this.current,
      ...newFeature,
      feature: {
        ...this.current?.feature,
        ...newFeature.feature,
      },
    }
  }

  /** Updates one feature field. @param key Field name. @param value Field value. @returns Nothing. */
  updateField = (key: keyof NewFeatureTask['feature'], value: unknown): void => {
    this.current = {
      ...this.current,
      feature: { ...this.current?.feature, [key]: value },
    }
  }

  /** Updates a localized feature field. @param key Field name. @param value Field value. @param locale Target locale. @returns Nothing. */
  updateI18n = (
    key: FeatureI18nFieldKeys,
    value: unknown,
    locale = getLocaleKey(),
  ): void => {
    this.current = {
      ...this.current,
      feature: {
        ...this.current?.feature,
        i18n: {
          ...this.current?.feature?.i18n,
          [locale]: {
            ...this.current?.feature?.i18n?.[locale],
            [key]: value,
          },
        },
      },
    }
  }

  /** Discards the draft payload. @returns Nothing. @remarks Creation mode is reset separately by the flow owner. */
  reset = (): void => {
    this.current = null
  }
}
