export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  const publicRoutes = ['/login', '/register', '/logout', '/auth/setup-account']

  if (!loggedIn.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }

  if (loggedIn.value && publicRoutes.includes(to.path) && to.path !== '/logout') {
    return navigateTo('/projects')
  }

  if (loggedIn.value && to.path.startsWith('/admin') && !user.value?.isAdmin) {
    return navigateTo('/projects')
  }
})
