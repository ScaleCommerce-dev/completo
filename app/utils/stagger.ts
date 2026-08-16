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
 * items, and lets the rest arrive together. 300ms is one `rise-in` duration, so
 * the last staggered item lands as the capped ones begin: the sequence still
 * looks deliberate rather than truncated.
 *
 * Callers keep their own rhythm — a column stagger is not a row stagger — and
 * pass the result straight to `animation-delay`.
 */
export function staggerDelay(ms: number, cap = 300): string {
  return `${Math.min(Math.max(ms, 0), cap)}ms`
}
