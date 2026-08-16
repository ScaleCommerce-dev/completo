/**
 * The scroll-edge mask shared by the board and the list table.
 *
 * Both surfaces scroll horizontally and both used to end in a hard cut — the
 * board slicing a column mid-word, the list truncating an assignee's name, which
 * is worse because a truncated name reads as a truncated name rather than as
 * "there is more to the right". The mask fades only the edges that actually have
 * content past them, so a surface that fits shows nothing at all.
 *
 * A gradient used as a *mask* rather than as paint, which is why this is allowed
 * anywhere in the app while decorative gradients are confined to brand surfaces
 * (see CLAUDE.md).
 *
 * Both copies were identical to the byte, including the 4px dead zone and the
 * 28px fade width, and both are consumed by the same `--board-fade-*` custom
 * properties in `.board-scroll`. The numbers live here now, once.
 *
 * @param trigger Extra reactive sources that change the scroller's *content*
 *   width without resizing the scroller itself — adding a board column, or a
 *   field column from the settings dialog. A `ResizeObserver` on the element
 *   cannot see those, because the element's own box never changes.
 */
export function useScrollFade(trigger?: () => unknown) {
  const scroller = ref<HTMLElement>()
  const fadeStart = ref(0)
  const fadeEnd = ref(0)

  const fadeStyle = computed(() => ({
    '--board-fade-start': `${fadeStart.value}px`,
    '--board-fade-end': `${fadeEnd.value}px`
  }))

  function updateFade() {
    const el = scroller.value
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 4px of slack: sub-pixel scroll positions and zoom levels otherwise leave a
    // fade showing on a surface that is already hard against its edge.
    fadeStart.value = el.scrollLeft > 4 ? 28 : 0
    fadeEnd.value = el.scrollLeft < max - 4 ? 28 : 0
  }

  onMounted(() => {
    updateFade()
    const el = scroller.value
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateFade)
    ro.observe(el)
    onBeforeUnmount(() => ro.disconnect())
  })

  if (trigger) watch(trigger, () => nextTick(updateFade))

  return { scroller, fadeStyle, updateFade }
}
