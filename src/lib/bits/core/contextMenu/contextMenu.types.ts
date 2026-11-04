// SVELTE
import type { Snippet } from 'svelte'
// TYPES
import type { DropdownItem } from '../dropdown/dropdown.types.js'

export interface ContextMenuProps {
  children: Snippet
  items: DropdownItem[]
  class?: string
}
