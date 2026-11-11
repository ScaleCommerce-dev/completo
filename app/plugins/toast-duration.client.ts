/**
 * How long a toast stays, by the guideline's rule rather than one fixed time
 * (handoff `05-interaktion.md` › Rückmeldungen):
 *
 *   short confirmation               at least 5s
 *   multi-line or over 90 characters at least 10s
 *   longer texts                     2.5s + 300ms per word
 *   errors, anything needing action  stay until closed
 *
 * Eighty-odd call sites add toasts through Nuxt UI's `useToast()`, which keeps
 * them in `useState('toasts')`. Setting the duration here, as each toast
 * arrives, gives every one of them the rule without touching any of them — and
 * a call site that states its own `duration` keeps it. Hover, focus and a
 * hidden window already pause the timer (Reka's toast provider).
 */
import { toastDuration, type ToastLike } from '~/utils/toast-duration'

export default defineNuxtPlugin(() => {
  const toasts = useState<ToastLike[]>('toasts', () => [])
  const seen = new Set<ToastLike['id']>()

  watch(toasts, (list) => {
    for (const toast of list) {
      if (seen.has(toast.id)) continue
      seen.add(toast.id)
      if (toast.duration === undefined) toast.duration = toastDuration(toast)
      // A toast that stays until closed has no countdown to show.
      if (toast.duration === Number.POSITIVE_INFINITY && toast.progress === undefined) toast.progress = false
    }
  }, { deep: true, immediate: true })
})
