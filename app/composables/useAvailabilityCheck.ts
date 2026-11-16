export function useAvailabilityCheck(opts: {
  /** A getter when it depends on state, as a board's and a list's slug do. */
  endpoint: MaybeRefOrGetter<string>
  paramName: string
  validate: (value: string) => boolean
  excludeId?: Ref<string | undefined>
  /** Further query parameters, such as the project a view's slug is scoped to. */
  params?: () => Record<string, string>
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
        const params: Record<string, string> = { ...opts.params?.(), [opts.paramName]: value }
        const excludeId = opts.excludeId?.value
        if (excludeId) params.exclude = excludeId
        const res = await $fetch<{ available: boolean }>(toValue(opts.endpoint), {
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
