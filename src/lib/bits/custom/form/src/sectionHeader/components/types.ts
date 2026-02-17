import type { ButtonProps } from '$lib/bits/core/button/button.types'
import type { SwitchProps } from '$lib/bits/custom/switch/switch.types'

export interface SectionHeaderFlag extends SwitchProps {
  isEditing?: boolean
  label?: string
  isNullable?: boolean
  key?: string
}

export interface SectionHeaderAction extends ButtonProps {
  key?: string
}

export interface SectionHeaderTrigger extends ButtonProps {
  key?: string
}
