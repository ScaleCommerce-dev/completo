// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/ui',
    'nuxt-auth-utils'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

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

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    session: {
      // password is provided via NUXT_SESSION_PASSWORD env var
      password: process.env.NUXT_SESSION_PASSWORD || '',
      cookie: {
        // h3 defaults this to true; it used to be forced to false here, so every HTTPS
        // install shipped its session cookie without the Secure flag and would hand it to
        // any plain-HTTP request that reached the same host.
        //
        // This is a build-time default, but runtimeConfig is env-overridable, so an install
        // genuinely served over plain HTTP (a LAN-only deployment) sets
        // NUXT_SESSION_COOKIE_SECURE=false rather than rebuilding. It needs to be a
        // deliberate choice: with Secure on and the site on http://, the browser silently
        // discards the cookie and login appears to succeed and then do nothing.
        // `http://localhost` is exempt — browsers treat it as a secure context — so local
        // development over HTTP is unaffected.
        secure: true,
        domain: ''
      }
    },
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
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || '',
    aiMaxTokens: Number(process.env.AI_MAX_TOKENS) || 0,
    public: {
      appVersion: process.env.npm_package_version || ''
    }
  },

  routeRules: {
    '/': { redirect: '/projects' }
  },

  devServer: {
    host: '0.0.0.0'
  },

  compatibilityDate: '2025-01-15',

  vite: {
    server: {
      // The dev server sits behind zdev's router, which forwards the original
      // Host — so Vite's host check sees `completo.0ploy.dev` rather than the
      // container. Left to its default the check passed, and then one morning it
      // did not: every request came back "Blocked request. This host is not
      // allowed" until the dev server was restarted. What put it in that state is
      // still unknown — a full `pnpm test` and `pnpm lint` both failed to
      // reproduce it — so this states the answer rather than relying on the
      // default arriving at it.
      //
      // Dev only. `nuxt build` runs Vite in build mode, where `server` is inert,
      // and the runtime image copies `.output` without Vite or this file:
      // verified by building with this set and grepping the output for it.
      allowedHosts: ['.0ploy.dev']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    clientBundle: {
      // The default glob is templates only (`**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml}`), so
      // icon names declared in a plain .ts module are never seen and render as blanks —
      // silently, since a missing icon is not an error. `shared/utils/list-fields.ts`
      // carries one per list column and `app/utils/constants.ts` carries the priority
      // icons, hence the extra entries. Keep the default glob intact.
      scan: {
        globInclude: [
          '**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml}',
          'shared/utils/*.ts',
          'app/utils/*.ts'
        ]
      }
    },
    collections: ['lucide']
  }
})
