import { PUBLIC_ROUTES, SIGNED_IN_REDIRECT_ROUTES } from '#shared/utils/auth-routes'

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value && !PUBLIC_ROUTES.includes(to.path)) {
    // Every protected address survives the login round trip, so a shared link
    // opens where it points once you are signed in (handoff `05` › Routing).
    // `login.vue` accepts it only as a same-site path — `safeReturnPath`.
    return navigateTo(to.fullPath === '/'
      ? '/login'
      : { path: '/login', query: { redirect: to.fullPath } })
  }

  if (loggedIn.value && SIGNED_IN_REDIRECT_ROUTES.includes(to.path)) {
    return navigateTo('/projects')
  }

  if (loggedIn.value && to.path.startsWith('/admin') && !user.value?.isAdmin) {
    return navigateTo('/projects')
  }

  // Admins, and people an admin allowed. The flag is read fresh on every session
  // fetch (`server/plugins/session-capabilities.ts`); the API checks again anyway.
  if (loggedIn.value && (to.path === '/agents' || to.path.startsWith('/agents/')) && !user.value?.canManageAgents) {
    return navigateTo('/projects')
  }
})
