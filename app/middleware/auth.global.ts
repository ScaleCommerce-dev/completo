import { PUBLIC_ROUTES, SIGNED_IN_REDIRECT_ROUTES } from '#shared/utils/auth-routes'

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value && !PUBLIC_ROUTES.includes(to.path)) {
    return navigateTo('/login')
  }

  if (loggedIn.value && SIGNED_IN_REDIRECT_ROUTES.includes(to.path)) {
    return navigateTo('/projects')
  }

  if (loggedIn.value && to.path.startsWith('/admin') && !user.value?.isAdmin) {
    return navigateTo('/projects')
  }
})
