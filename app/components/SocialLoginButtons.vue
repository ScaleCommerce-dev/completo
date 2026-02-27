<script setup lang="ts">
const { data: providers } = await useFetch('/api/auth/providers')

const enabledProviders = computed(() => {
  if (!providers.value) return []
  const list: { key: string, label: string, href: string }[] = []
  if (providers.value.github) {
    list.push({ key: 'github', label: 'GitHub', href: '/auth/github' })
  }
  if (providers.value.google) {
    list.push({ key: 'google', label: 'Google', href: '/auth/google' })
  }
  if (providers.value.microsoft) {
    list.push({ key: 'microsoft', label: 'Microsoft', href: '/auth/microsoft' })
  }
  return list
})

const hasProviders = computed(() => enabledProviders.value.length > 0)
</script>

<template>
  <div v-if="hasProviders" class="flex flex-col gap-2.5">
    <a
      v-for="(provider, i) in enabledProviders"
      :key="provider.key"
      :href="provider.href"
      class="social-btn auth-field group relative flex items-center w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]"
      :class="`social-btn--${provider.key}`"
      :style="{ animationDelay: `${i * 0.05}s` }"
    >
      <!-- GitHub Logo -->
      <svg v-if="provider.key === 'github'" class="absolute left-4 w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>

      <!-- Google Logo (multicolor) -->
      <svg v-if="provider.key === 'google'" class="absolute left-4 w-[18px] h-[18px]" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>

      <!-- Microsoft Logo (four-color window) -->
      <svg v-if="provider.key === 'microsoft'" class="absolute left-4 w-[16px] h-[16px]" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>

      <span class="w-full text-center">Continue with {{ provider.label }}</span>
    </a>

    <!-- Divider -->
    <div class="auth-field flex items-center gap-3 my-1" :style="{ animationDelay: `${enabledProviders.length * 0.05}s` }">
      <div class="flex-1 h-px bg-zinc-200/60 dark:bg-gradient-to-r dark:from-transparent dark:via-zinc-600/40 dark:to-transparent" />
      <span class="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">or</span>
      <div class="flex-1 h-px bg-zinc-200/60 dark:bg-gradient-to-r dark:from-transparent dark:via-zinc-600/40 dark:to-transparent" />
    </div>
  </div>
</template>

<style scoped>
/* ─── Base ─── */
.social-btn {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ─── GitHub ─── */
.social-btn--github {
  background: #24292f;
  color: #fff;
  border: 1px solid #3d444d;
}
.social-btn--github:hover {
  background: #2f363d;
  border-color: #545d68;
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.2);
  transform: translateY(-1px);
}

/* ─── Google ─── */
.social-btn--google {
  background: #fff;
  color: #3c4043;
  border: 1px solid #dadce0;
}
.social-btn--google:hover {
  background: #f8f9fa;
  border-color: #c4c7cc;
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.08);
  transform: translateY(-1px);
}

/* ─── Microsoft ─── */
.social-btn--microsoft {
  background: #fafafa;
  color: #1a1a1a;
  border: 1px solid #d6d6d6;
}
.social-btn--microsoft:hover {
  background: #f0f0f0;
  border-color: #b8b8b8;
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.08);
  transform: translateY(-1px);
}

/* ─── Dark mode: unified glass style ─── */
/* All buttons share the same frosted-glass tint to match auth-glass aesthetic.
   Provider identity comes from the SVG icons, not button colors. */
:is(.dark) .social-btn--github,
:is(.dark) .social-btn--google,
:is(.dark) .social-btn--microsoft {
  background: oklch(0.18 0.015 270 / 0.7);
  color: oklch(0.92 0 0);
  border-color: oklch(0.32 0.025 270 / 0.35);
  backdrop-filter: blur(12px);
}
:is(.dark) .social-btn--github:hover,
:is(.dark) .social-btn--google:hover,
:is(.dark) .social-btn--microsoft:hover {
  background: oklch(0.22 0.025 270 / 0.8);
  border-color: oklch(0.42 0.04 270 / 0.5);
  box-shadow:
    0 6px 24px oklch(0.35 0.12 270 / 0.2),
    inset 0 1px 0 oklch(1 0 0 / 0.04);
  transform: translateY(-1px);
}
</style>
