// SVELTE
import { tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// TRANSLATION
import { normalizeContentLocale } from '#lib/content-locales/model.js'
import { translateContentField } from '#lib/api/translation.remote.js'
import { translationSource, type TranslationSourceMode } from './translationSource'
import {
  completeTranslationReview,
  type TranslationReviewSection,
} from './translationReview'
import type { AutomaticTranslation } from '#lib/i18n/automatic.js'

/** One editable localized value; fields with no source text are not translation targets. */
export interface MultilingualReviewCell {
  key: string
  field: string
  locale: string
  value: string
  automatic?: AutomaticTranslation
  set(text: string, automatic?: AutomaticTranslation, edited?: boolean): void
  proposed?(automatic: AutomaticTranslation): void
}
type Proposal = {
  value: string
  source: string
  sourceText: string
  automatic?: AutomaticTranslation
}

/** Shared save-review state for multilingual editors with their own existing field layout. */
export class MultilingualReview {
  open = $state(false)
  started = $state(false)
  busy = $state(false)
  completed = $state(0)
  total = $state(0)
  fallback = $state(false)
  error = $state('')
  proposals = $state<Record<string, Proposal>>({})
  private dismissed = new Set<string>()
  form: HTMLFormElement | null = null
  element: HTMLElement | undefined
  readonly section: TranslationReviewSection

  /** Bind review state to live draft cells and the existing editor's reveal action.
   * @param cells Current localized fields. @param enabled Whether these values may be edited.
   * @param reveal Expand locales and reveal the owning tab. @returns A review controller.
   */
  constructor(
    private cells: () => MultilingualReviewCell[],
    private enabled: () => boolean,
    private reveal?: () => void,
  ) {
    this.section = {
      generate: mode => this.generate(mode),
      missing: () => this.missing.length > 0,
      outstandingKeys: () => this.missing.map(cell => cell.key),
      missingKeys: () =>
        this.missing.filter(cell => !this.current(cell.key)).map(cell => cell.key),
      fingerprint: () =>
        JSON.stringify(this.cells().map(cell => [cell.key, cell.value])),
      close: () => {
        this.open = false
      },
      open: () => {
        this.open = true
        this.started = true
        this.restore()
        this.reveal?.()
      },
      acceptFilled: () => {
        for (const cell of this.missing) this.accept(cell.key)
      },
    }
  }
  /** Current empty fields whose language group has some source text. */
  get missing(): MultilingualReviewCell[] {
    if (!this.enabled()) return []
    const cells = this.cells()
    return cells.filter(
      cell =>
        !cell.value.trim() &&
        cells.some(source => source.field === cell.field && source.value.trim()),
    )
  }
  /** Determine whether a current proposal still matches its source and empty target.
   * @param key Localized field identity. @returns Whether acceptance remains valid.
   */
  current(key: string): boolean {
    const proposal = this.proposals[key]
    const target = this.cells().find(cell => cell.key === key)
    return (
      !!proposal?.value.trim() &&
      !!target &&
      !target.value.trim() &&
      this.cells().some(
        cell =>
          cell.field === target.field &&
          cell.locale === proposal.source &&
          cell.value === proposal.sourceText,
      )
    )
  }
  /** Restore only valid cached candidates, without changing entered values.
   * @returns Nothing.
   */
  private restore(): void {
    for (const cell of this.missing) {
      const automatic = cell.automatic
      if (!automatic || this.dismissed.has(cell.key) || this.proposals[cell.key])
        continue
      const source = this.cells().find(
        source =>
          source.field === cell.field &&
          normalizeContentLocale(source.locale) ===
            normalizeContentLocale(automatic.sourceLocale) &&
          source.value === automatic.sourceText,
      )
      if (source)
        this.proposals[cell.key] = {
          value: automatic.value,
          source: source.locale,
          sourceText: source.value,
          automatic,
        }
    }
  }
  /** Generate sequential suggestions with per-field source fallback and stale-result checks.
   * @param mode Requested source language preference. @returns Completion of generation.
   */
  async generate(mode: TranslationSourceMode): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.completed = 0
    this.fallback = false
    this.error = ''
    const targets = this.missing.filter(cell => !this.current(cell.key))
    this.total = targets.length
    try {
      for (const cell of targets) {
        const sources = this.cells().filter(
          source => source.field === cell.field && source.value.trim(),
        )
        const locale = translationSource(
          cell.locale,
          sources.map(source => source.locale),
          mode,
        )
        const source = sources.find(source => source.locale === locale)
        if (!source) continue
        this.fallback ||=
          mode === 'english' && !source.locale.toLowerCase().startsWith('en')
        const text = source.value
        const result = await translateContentField({
          source: source.locale,
          target: cell.locale,
          text,
        })
        this.completed += 1
        if (result.status !== 'translated') {
          this.error = result.message
          continue
        }
        const current = this.cells().find(target => target.key === cell.key)
        if (
          this.enabled() &&
          current &&
          !current.value.trim() &&
          this.cells().some(item => item.key === source.key && item.value === text)
        ) {
          this.proposals[cell.key] = {
            value: result.text,
            source: source.locale,
            sourceText: text,
            automatic: result.automatic,
          }
          if (result.automatic) current.proposed?.(result.automatic)
        }
      }
    } catch {
      this.error = m.address_translate_error()
    } finally {
      this.busy = false
    }
  }
  /** Accept a suggestion through the owning editor's normal draft updater.
   * @param key Field identity. @param edited Whether its text was manually changed. @returns Nothing.
   */
  accept(key: string, edited = false): void {
    if (!this.enabled() || !this.current(key)) return
    const proposal = this.proposals[key]
    this.cells()
      .find(cell => cell.key === key)
      ?.set(proposal.value, proposal.automatic, edited)
    delete this.proposals[key]
  }
  /** Reject a suggestion while retaining the underlying field.
   * @param key Field identity. @returns Nothing.
   */
  reject(key: string): void {
    this.dismissed.add(key)
    delete this.proposals[key]
  }
  /** Resolve this tab and resume the owning save only after draft updates flush.
   * @param accept Whether to accept current proposals. @returns Completion of the review step.
   */
  async finish(accept: boolean): Promise<void> {
    if (accept) for (const cell of this.missing) this.accept(cell.key)
    await tick()
    if (accept && this.missing.length) return
    this.open = false
    if (this.form) completeTranslationReview(this.form, this.section)
  }
}
