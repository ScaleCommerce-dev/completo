/** Extract a human-readable message from an API error (ofetch/FetchError). */
export function getErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const err = e as Record<string, any>
    // ofetch wraps Nitro errors in err.data.message
    if (err.data?.message && typeof err.data.message === 'string') {
      return err.data.message
    }
    // Direct message
    if (err.message && typeof err.message === 'string') {
      return err.message
    }
  }
  return fallback
}
