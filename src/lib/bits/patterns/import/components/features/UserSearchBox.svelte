<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ImportSearchBox from '../ImportSearchBox.svelte'
// TYPES
import type { UserValidationResult } from '$lib/client/services/import/types'
import type { ImportSearchBoxItem } from '../importSearch.types'

type Props = {
  id: string
  value?: string
  results?: UserValidationResult[]
  label?: string
  ariaLabel: string
  placeholder: string
  size?: 'sm' | 'md'
  dropdown?: 'inline' | 'floating'
  searchFor?: string
  onInput?: (value: string, event: Event) => void | Promise<void>
  onSelect: (user: UserValidationResult, event: MouseEvent) => void
  onInputKeydown?: (event: KeyboardEvent) => void
  onResultKeydown?: (
    event: KeyboardEvent,
    user: UserValidationResult,
    index: number,
  ) => void
}

let {
  id,
  value = '',
  results = [],
  label,
  ariaLabel,
  placeholder,
  size = 'md',
  dropdown = 'inline',
  searchFor,
  onInput,
  onSelect,
  onInputKeydown,
  onResultKeydown,
}: Props = $props()

const searchResults = $derived(
  results.map((user, index): ImportSearchBoxItem<UserValidationResult> => {
    const title = user.name || m.feature_import__user_unknown()
    return {
      id: `${user.id ?? user.userId ?? user.value}-${index}`,
      title,
      subtitle: user.email,
      image: user.image,
      fallback: title.charAt(0).toUpperCase() || '?',
      value: user,
    }
  }),
)

function handleSelect(item: ImportSearchBoxItem, event: MouseEvent): void {
  onSelect(item.value as UserValidationResult, event)
}

function handleResultKeydown(
  event: KeyboardEvent,
  item: ImportSearchBoxItem,
  index: number,
): void {
  onResultKeydown?.(event, item.value as UserValidationResult, index)
}
</script>

<ImportSearchBox
  {id}
  {value}
  results={searchResults}
  {label}
  {ariaLabel}
  {placeholder}
  {size}
  {dropdown}
  {searchFor}
  {onInput}
  onSelect={handleSelect}
  {onInputKeydown}
  onResultKeydown={handleResultKeydown}
/>
