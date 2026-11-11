import { PUBLIC_ROUTES, SIGNED_IN_REDIRECT_ROUTES } from '#shared/utils/auth-routes'

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value && !PUBLIC_ROUTES.includes(to.path)) {
    // The OAuth consent page is reached from outside with the whole request in
    // its query, so it is the one address that has to survive the login round
    // trip. Everything else lands on /projects after sign-in, as before.
    return navigateTo(to.path === '/oauth/authorize'
      ? { path: '/login', query: { redirect: to.fullPath } }
      : '/login')
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
