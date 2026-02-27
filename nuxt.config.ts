// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-auth-utils'
  ],

  ssr: true,

  // Inline critical CSS for the error page to prevent FOUC.
  // Nuxt wraps error.vue in its own container with default grid/bg-white styles;
  // this overrides that wrapper before external stylesheets load.
  app: {
    head: {
      style: [{
        innerHTML: '#__nuxt>[statuscode]{all:unset;display:block;position:relative;min-height:100vh;min-height:100dvh;overflow:hidden;background:#fafafa;font-family:\'Plus Jakarta Sans\',system-ui,-apple-system,sans-serif}@media(prefers-color-scheme:dark){#__nuxt>[statuscode]{background:#09090b;color:#fafafa}}'
      }]
    }
  },

  routeRules: {
    '/': { redirect: '/projects' },
    '/login': { ssr: false },
    '/register': { ssr: false },
    '/logout': { ssr: false },
    '/auth/setup-account': { ssr: false },
    '/auth/forgot-password': { ssr: false },
    '/auth/reset-password': { ssr: false },
    '/projects/**': { ssr: false },
    '/my-tasks': { ssr: false },
    '/notifications': { ssr: false },
    '/profile': { ssr: false },
    '/admin/**': { ssr: false }
  },

  devServer: {
    host: '0.0.0.0'
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    session: {
      cookie: {
        secure: false,
        domain: ''
      }
    } as any,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || '',
    debugAiLog: process.env.DEBUG_AI_LOG === 'true',
    aiProvider: process.env.AI_PROVIDER || '',
    aiModel: process.env.AI_MODEL || '',
    aiBaseUrl: process.env.AI_BASE_URL || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || '',
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterModel: process.env.OPENROUTER_MODEL || '',
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || ''
  },

  icon: {
    clientBundle: {
      scan: true
    },
    collections: ['lucide']
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
