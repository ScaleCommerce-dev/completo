/** Lowercase letters and digits in hyphen-separated runs: `sprint-board`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A slug the URL resolvers can never confuse with an id.
 *
 * Projects, boards and lists are addressed "by slug or id" in one parameter, and a
 * UUID is a valid slug by the pattern alone. A member of project B could create
 * project A with `slug = B.id`, after which a by-id call for B (the CLI and MCP
 * address by id) could resolve to A instead. The resolvers now try the id first,
 * and a UUID-shaped slug is refused, so neither half depends on the other.
 */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !UUID_SHAPE.test(slug)
}
