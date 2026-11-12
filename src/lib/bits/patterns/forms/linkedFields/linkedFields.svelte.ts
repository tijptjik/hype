// SVELTE
import { getContext, setContext } from 'svelte'

export type LinkedField =
  | 'names'
  | 'phoneNumber'
  | 'websites'
  | 'socials'
  | 'brands'
  | 'location'
export type LinkedFieldMode = 'community' | 'internal'
const key = Symbol('linked-fields')

/** Form-local presentation; assignments remain owned by the existing form save path. */
export class LinkedFields {
  expanded = $state(false)
  community = $state(true)
  internal = $state(true)

  constructor(
    readonly available: () => boolean,
    readonly canShare: () => boolean,
    readonly mode: (field: LinkedField) => LinkedFieldMode,
    readonly change: (field: LinkedField, mode: LinkedFieldMode) => void,
  ) {}

  /** Filter presentation without unmounting inputs or changing their values.
   * @param field Assignment being displayed. @returns Whether the field is visible.
   */
  visible(field: LinkedField): boolean {
    return !this.available() || !this.expanded || this[this.mode(field)]
  }
}

/** Provide one editor's controls to its field sections.
 * @param editor Form-owned state. @returns The same editor.
 */
export function provideLinkedFields(editor: LinkedFields): LinkedFields {
  return setContext(key, editor)
}

/** Read optional controls; standalone editors keep their existing behaviour.
 * @returns The enclosing editor, when provided.
 */
export function getLinkedFields(): LinkedFields | undefined {
  return getContext<LinkedFields | undefined>(key)
}
