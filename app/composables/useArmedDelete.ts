/**
 * The armed state behind a two-step inline delete.
 *
 * Five row lists hand-rolled this: `StatusManager`, `CommentList`,
 * `AttachmentList`, the tag list on `projects/[slug]/index`, and `ProfileTokens`
 * through `useApiTokens`. Four of them were the same eleven lines — one id, one
 * timer, clear-then-set on arm, clear-on-cancel — and the fifth was the same
 * eleven lines with the timer wired to the wrong end (see below).
 *
 * **The timer disarms; it never commits.** That is the whole contract, and it is
 * the reason this is a composable rather than five copies: `useApiTokens` had
 * `setTimeout(() => confirmDeleteToken(id), 5000)`, so arming a token's delete and
 * then doing nothing *revoked the token* five seconds later. A confirmation whose
 * timeout completes the action is not a confirmation, and it shipped in every
 * release. One implementation is what makes that impossible to write again.
 *
 * Nothing here clears on route change or on the owning list re-fetching, and it
 * does not need to: the armed id is compared against a row that is being
 * rendered, so a row that goes away takes its armed state with it.
 */
export function useArmedDelete(options: { timeoutMs?: number } = {}) {
  /**
   * 5 seconds, matching what all five sites chose independently. Long enough to
   * move the pointer from the trash icon to the tick, short enough that a row
   * left armed on screen does not stay armed while you read something else.
   */
  const timeoutMs = options.timeoutMs ?? 5000

  const armedId = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  function disarm() {
    if (timer) clearTimeout(timer)
    timer = null
    armedId.value = null
  }

  /** Arming a second row disarms the first — two armed rows would be two questions. */
  function arm(id: string) {
    if (timer) clearTimeout(timer)
    armedId.value = id
    timer = setTimeout(disarm, timeoutMs)
  }

  const isArmed = (id: string) => armedId.value === id

  onUnmounted(disarm)

  return { armedId, arm, disarm, isArmed }
}
