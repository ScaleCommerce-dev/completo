/**
 * Loads the workspace settings before the first signed-in page renders, so
 * every page can choose its interface synchronously (`useWorkspaceSettings`).
 * Runs after `auth.global.ts` (global middleware run in file name order), so a
 * signed-out visitor never asks for them.
 *
 * `/issues` belongs to the tracker interface only; with the standard one it has
 * no place in the navigation, so a stale link lands on the projects instead.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) return

  const { load, isTracker, settings } = useWorkspaceSettings()
  await load()

  // Only a known standard workspace sends `/issues` away: a failed load is not
  // a reason to bounce someone off a tracker page.
  if (settings.value && !isTracker.value && (to.path === '/issues' || to.path.startsWith('/issues/'))) {
    return navigateTo('/projects')
  }
})
