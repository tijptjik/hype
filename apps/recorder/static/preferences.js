// Apply the saved palette before the app stylesheet or first frame can paint.
try {
  const saved = JSON.parse(localStorage.getItem('hype-recorder-preferences') || '{}')
  document.documentElement.dataset.theme =
    saved.theme === 'breadline-light' ? 'breadline-light' : 'hype-dark'
} catch {
  document.documentElement.dataset.theme = 'hype-dark'
}
// Only English is currently available; unsupported stored languages fall back to English.
document.documentElement.lang = 'en'
