/**
 * A request that waits for typing to pause, and whose answer lands only if no
 * newer request was made meanwhile.
 *
 * Search-as-you-type was written five times, and two of the copies applied every
 * response as it arrived. Responses land out of order (a two-letter query is cheap
 * and a longer one is not), so a slow "ab" could overwrite the results for "abc"
 * after the user had finished typing. `cancel` drops a pending request and any
 * answer still in flight, for a query that no longer needs one.
 */
export function useDebouncedRequest(delayMs = 200) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = undefined
    latest++
  }

  function run<T>(request: () => Promise<T>, handlers: {
    then: (value: T) => void
    catch?: (error: unknown) => void
    finally?: () => void
  }) {
    cancel()
    const seq = latest
    timer = setTimeout(async () => {
      timer = undefined
      try {
        const value = await request()
        if (seq === latest) handlers.then(value)
      } catch (e) {
        if (seq === latest) handlers.catch?.(e)
      } finally {
        if (seq === latest) handlers.finally?.()
      }
    }, delayMs)
  }

  onScopeDispose(cancel)

  return { run, cancel }
}
