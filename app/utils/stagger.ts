/**
 * Cap an entrance-stagger delay.
 *
 * `.rise-in` is `animation … both` starting at `opacity: 0`, so an item's delay
 * is time it spends *invisible*, not time it spends arriving. An uncapped
 * `index * step` therefore turns a long list into a slow reveal: notifications
 * ran `group * 60 + row * 40` over an endpoint with no limit, so row 300 waited
 * more than twelve seconds, and anyone scrolling straight down met a blank page.
 * The same shape is latent wherever a list can grow — projects, board columns.
 *
 * The cap keeps the effect where it actually reads, in the first handful of
 * items, and lets the rest arrive together. 180ms and a 36ms step are the
 * connect2scale values (handoff `06-motion.md` › Sammlung betreten), so the
 * stagger reaches five items before the rest land together.
 *
 * `STAGGER_STEP` is the one rhythm; callers multiply their index by it.
 */
export const STAGGER_STEP = 36

export function staggerDelay(ms: number, cap = 180): string {
  return `${Math.min(Math.max(ms, 0), cap)}ms`
}
