/**
 * Tags fill one line, and `+N` counts what didn't fit.
 *
 * It used to be `slice(0, 2)` and `length - 2` on the board card, which is wrong
 * in both directions on the same board: three tags named "v1", "is" and "of"
 * showed "+1" with two thirds of the line empty, while two long ones overflowed
 * it.
 *
 * **The clipping is CSS and needs no measuring.** The caller's row wraps and is
 * one pill tall (`max-h-4` — `text-2xs` at `leading-none` plus `py-[3px]` is
 * exactly 16px), so a tag that doesn't fit moves to a second line that isn't
 * rendered. Nothing is ever half-shown, and nothing is removed from the DOM,
 * which is what keeps the count honest: it is just how many pills wrapped.
 *
 * All this does is *read* that. Pills are found by `[data-tag]` and compared on
 * `offsetTop`; anything below the first line is hidden.
 *
 * Extracted from KanbanCard when the card panel's properties row needed the same
 * behaviour. The panel's row is pinned chrome that the body scrolls under, so a
 * card with a dozen tags on a narrow window used to push the title and every
 * property up as the header grew to three or four lines. Both surfaces now
 * describe tags identically, which is the same argument as priority's edge bar.
 */
export function useTagOverflow(opts: {
  /** The wrapping, clipped row. Read on each measure, so it may mount late. */
  row: () => HTMLElement | null | undefined
  /** What re-triggers a measure — the tag list itself. */
  tags: () => unknown
  /**
   * False where the row isn't clipped and every tag is shown in full, such as the
   * card page's rail. Measuring an unclipped row would count the tags on lines two
   * and three as hidden and print a `+N` beside tags that are plainly visible.
   */
  enabled?: () => boolean
}) {
  const hiddenCount = ref(0)
  /**
   * Where a caller that positions its badge should put it. Only the board card
   * needs this — its row is full-width, so a count in flow would wrap onto the
   * clipped line and disappear exactly when it was needed. A caller whose count
   * can sit outside the clipped group ignores it.
   */
  const badgeLeft = ref(0)

  function measure() {
    if (opts.enabled?.() === false) {
      hiddenCount.value = 0
      return
    }
    const root = opts.row()
    const pills = root ? [...root.querySelectorAll<HTMLElement>('[data-tag]')] : []
    const firstLine = pills[0]?.offsetTop
    if (firstLine === undefined) {
      hiddenCount.value = 0
      return
    }
    const shown = pills.filter(p => p.offsetTop === firstLine)
    hiddenCount.value = pills.length - shown.length
    // Against the last pill rather than the far edge of the row — it counts
    // *those* tags, and a card whose tags end halfway across left it stranded on
    // the other side of an inch of nothing.
    const last = shown[shown.length - 1]
    badgeLeft.value = last ? last.offsetLeft + last.offsetWidth : 0
  }

  /**
   * `requestAnimationFrame`, not `nextTick`. `nextTick` resolves on a microtask
   * and the second pass measured a row that still had no room reserved for the
   * badge — so the count came back identical, the loop read that as "settled",
   * and every overflowing card was short by exactly one. A frame callback runs
   * after the patch has been applied and styled, which is the state we need.
   *
   * Reserving that room can push one more tag over, hence the repeat. It always
   * settles, and quickly: reserving space can only ever *raise* the count, never
   * lower it, so the sequence is monotonic and bounded by the number of tags. Two
   * passes is the normal case, hence the cap of three.
   */
  function remeasure(passes = 3) {
    requestAnimationFrame(() => {
      const before = hiddenCount.value
      measure()
      if (passes > 1 && hiddenCount.value !== before) remeasure(passes - 1)
    })
  }

  let resizeFrame: number | null = null
  function onResize() {
    if (resizeFrame !== null) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      remeasure()
    })
  }

  onMounted(() => {
    remeasure()
    // Metrics change when Plus Jakarta Sans replaces the fallback, and a name
    // that fitted in one may not fit in the other.
    document.fonts?.ready.then(() => remeasure())
    // A window resize is the one width change neither the tags nor the mount can
    // report. Deliberately `window` and not a `ResizeObserver` on the row: the
    // card panel's row is shrink-to-fit, so reserving space for the badge changes
    // the row's own width, and an observer watching for that would be watching
    // for its own effect.
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
  })

  watch(opts.tags, () => remeasure(), { deep: true })

  return { hiddenCount, badgeLeft, remeasure }
}
