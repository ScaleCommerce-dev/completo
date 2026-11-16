/**
 * The colour a new status or tag gets when none is picked, and what a stored
 * colour must look like. One spelling each: the default was written out ten
 * times across the app and the server, and the hex check eight.
 */
export const DEFAULT_COLOR = '#6366f1'

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}
