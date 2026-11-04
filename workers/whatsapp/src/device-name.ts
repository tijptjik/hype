/** Normalize server-provided deployment stages before persisting account setup. */
export function deviceStage(stage: string): string {
  if (typeof stage !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/i.test(stage))
    throw new Error('Invalid deployment stage')
  const normalized = stage.toLowerCase()
  return normalized === 'prod' ? 'production' : normalized
}

/** The companion label is sent to WhatsApp during initial pairing only. */
export function linkedDeviceName(stage: string): string {
  const normalized = deviceStage(stage)
  return normalized === 'production' ? 'HYPE' : `HYPE ${normalized}`
}
