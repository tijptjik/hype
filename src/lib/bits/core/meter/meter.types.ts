// BITS-UI
import type { Meter } from 'bits-ui'

export type SimpleMeterProps = Omit<Meter.RootProps, 'children'> & {
  class?: string
  indicatorClass?: string
  label?: string
  valueLabel?: string
}
