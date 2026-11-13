/**
 * Workspace-wide settings every signed-in user reads (`GET /api/settings`) and
 * admins change (`/api/admin/settings`). Stored in `global_settings` under the
 * keys in `server/utils/settings.ts`.
 */

/**
 * Which interface the workspace uses. `standard` is Completo's own; `tracker`
 * swaps in issue lists, the full issue page and project overviews of an issue
 * tracker. The data underneath is the same, so switching back and forth loses
 * nothing.
 */
export const INTERFACE_MODES = ['standard', 'tracker'] as const
export type InterfaceMode = typeof INTERFACE_MODES[number]
export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'standard'

/**
 * The description every new issue starts with, in the web app and through
 * MCP's `create_card` when no description is given. Empty means none, which is
 * how a workspace starts.
 */
export const DEFAULT_ISSUE_TEMPLATE = ''

/** Longest issue template accepted, in characters. */
export const ISSUE_TEMPLATE_MAX_LENGTH = 20000
