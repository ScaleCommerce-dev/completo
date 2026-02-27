<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950">
    <!-- Dot pattern -->
    <div class="absolute inset-0 auth-dots opacity-40 dark:opacity-15" />

    <!-- Primary gradient wash -->
    <div class="absolute inset-0 bg-gradient-to-br from-indigo-100/50 via-transparent to-violet-100/30 dark:from-indigo-950/25 dark:via-transparent dark:to-violet-950/20" />

    <!-- Warm top gradient wash -->
    <div class="absolute inset-0 bg-gradient-to-b from-amber-50/40 via-transparent to-transparent dark:from-amber-900/5 dark:via-transparent dark:to-transparent" />

    <!-- Centered glow orb -->
    <div class="auth-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px]" />

    <!-- Warm accent (top-right) -->
    <div class="absolute -top-32 -right-32 w-[450px] h-[450px] rounded-full bg-gradient-to-br from-amber-200/30 to-orange-200/15 dark:from-amber-700/8 dark:to-orange-700/4 blur-3xl" />

    <!-- Cool accent (bottom-left) -->
    <div class="absolute -bottom-32 -left-32 w-[350px] h-[350px] rounded-full bg-gradient-to-tr from-indigo-200/25 to-sky-200/15 dark:from-indigo-700/8 dark:to-sky-700/4 blur-3xl" />

    <!-- Noise texture overlay -->
    <div class="absolute inset-0 noise-overlay pointer-events-none" />

    <!-- Content -->
    <div class="auth-entrance relative z-10 w-full max-w-[380px]">
      <!-- Brand -->
      <div class="mb-6 px-7 flex items-center gap-4">
        <div class="relative flex-shrink-0">
          <!-- Glow halo -->
          <div class="absolute -inset-4 rounded-full bg-indigo-400/20 dark:bg-indigo-400/10 blur-2xl auth-icon-glow" />
          <!-- Icon -->
          <div class="relative w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/25 dark:shadow-indigo-500/10 ring-1 ring-white/20">
            <img src="/completo-icon.svg" alt="Completo" class="w-14 h-14 invert" />
          </div>
        </div>
        <div>
          <h1 class="sidebar-brand text-[28px] font-extrabold tracking-[-0.04em] leading-none text-zinc-900 dark:text-zinc-100">Completo</h1>
          <div class="mt-2 flex flex-col gap-px">
            <p class="font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-indigo-500/80 dark:text-indigo-400/70">All the toppings</p>
            <p class="font-mono text-[11.5px] font-medium uppercase tracking-[0.1em] text-zinc-500/80 dark:text-zinc-400/70">None of the mess</p>
          </div>
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>
