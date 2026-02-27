/**
 * Suppress noisy Vue Router warnings in production logs.
 * "No match found for location with path /_nuxt/" is harmless —
 * static assets are served by Nitro, not Vue Router.
 */
export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV === 'test') return

  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : ''
    if (msg.includes('No match found for location with path "/_nuxt/')) return
    originalWarn.apply(console, args)
  }
})
