/**
 * How long a toast stays (handoff `05-interaktion.md` › Rückmeldungen). Pure,
 * so the rule is tested without Nuxt; `plugins/toast-duration.client.ts`
 * applies it to every toast as it arrives.
 */
export interface ToastLike {
  id: string | number
  title?: unknown
  description?: unknown
  color?: string
  duration?: number
  progress?: boolean
  actions?: unknown[]
}

export function toastDuration(toast: ToastLike): number {
  if (toast.color === 'error' || toast.actions?.length) return Number.POSITIVE_INFINITY

  const text = [toast.title, toast.description].filter(v => typeof v === 'string').join(' ')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const long = text.length > 90 || /\n/.test(text)

  return Math.max(long ? 10_000 : 5_000, 2_500 + 300 * words)
}
