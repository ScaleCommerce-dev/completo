export function useAvailabilityCheck(opts: {
  endpoint: string
  paramName: string
  validate: (value: string) => boolean
  excludeId?: Ref<string | undefined>
}) {
  const available = ref<boolean | null>(null)
  const checking = ref(false)

  let timeout: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  function check(value: string) {
    available.value = null
    if (timeout) clearTimeout(timeout)
    if (abortController) abortController.abort()
    if (!value || !opts.validate(value)) {
      checking.value = false
      return
    }
    checking.value = true
    timeout = setTimeout(async () => {
      abortController = new AbortController()
      try {
        const params: Record<string, string> = { [opts.paramName]: value }
        const excludeId = opts.excludeId?.value
        if (excludeId) params.exclude = excludeId
        const res = await $fetch<{ available: boolean }>(opts.endpoint, {
          params,
          signal: abortController.signal
        })
        available.value = res.available
      } catch {
        available.value = null
      } finally {
        checking.value = false
      }
    }, 300)
  }

  function reset() {
    available.value = null
    checking.value = false
  }

  function cleanup() {
    if (timeout) clearTimeout(timeout)
    if (abortController) abortController.abort()
  }

  return { available, checking, check, reset, cleanup }
}
