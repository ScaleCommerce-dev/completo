export default defineEventHandler(() => {
  return {
    github: !!(process.env.NUXT_OAUTH_GITHUB_CLIENT_ID && process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET),
    google: !!(process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID && process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET),
    microsoft: !!(process.env.NUXT_OAUTH_MICROSOFT_CLIENT_ID && process.env.NUXT_OAUTH_MICROSOFT_CLIENT_SECRET)
  }
})
