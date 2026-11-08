// Shared presentation ordering; importing it must not load image database services.
export const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'undefined',
  'research',
] as const

export const adminIntentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'research',
] as const
