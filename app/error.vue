<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode: number
    message?: string
  }
}>()

const is404 = computed(() => props.error.statusCode === 404)

const title = computed(() => is404.value ? 'Card not found' : 'Something broke')
const subtitle = computed(() => is404.value
  ? 'This page fell off the board. It might have been moved, renamed, or never existed.'
  : (props.error.message || 'An unexpected error occurred. Please try again.'))

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <!-- inline opacity:0 prevents FOUC — content stays invisible until
       the stylesheet loads and the error-reveal animation overrides it -->
  <div
    class="error-page fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden bg-zinc-50 dark:bg-zinc-950"
    style="opacity: 0"
  >
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
    <div class="relative z-10 w-full max-w-[380px] flex flex-col items-center text-center">

      <!-- Fallen card illustration -->
      <div class="error-fallen-card mb-6">
        <div class="w-[180px] rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 shadow-xl shadow-zinc-900/[0.06] dark:shadow-black/30 p-3.5">
          <!-- Card header -->
          <div class="flex items-center justify-between mb-2.5">
            <span class="font-mono text-[10px] font-bold text-indigo-500/80 dark:text-indigo-400/70 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
              ERR-{{ error.statusCode }}
            </span>
            <span class="w-2 h-2 rounded-full bg-red-400/60" />
          </div>
          <!-- Shimmer lines -->
          <div class="flex flex-col gap-1.5 mb-2.5">
            <div class="h-2 w-full rounded bg-zinc-100 dark:bg-zinc-700/50" />
            <div class="h-2 w-3/4 rounded bg-zinc-100/80 dark:bg-zinc-700/35" />
            <div class="h-2 w-1/2 rounded bg-zinc-100/50 dark:bg-zinc-700/20" />
          </div>
          <!-- Card footer -->
          <div class="flex items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40">
            <div class="w-4 h-4 rounded-full bg-zinc-200/80 dark:bg-zinc-700" />
            <div class="h-1.5 w-10 rounded bg-zinc-200/60 dark:bg-zinc-700/40" />
          </div>
        </div>
      </div>

      <!-- Text + actions -->
      <h2 class="text-[20px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-[-0.02em] leading-tight mb-1.5">
        {{ title }}
      </h2>
      <p class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
        {{ subtitle }}
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/25 transition-all active:scale-[0.97]"
        @click="goHome"
      >
        <UIcon name="i-lucide-arrow-left" class="text-[14px]" />
        Back to home
      </button>
    </div>
  </div>
</template>

<style scoped>
/* CSS-only FOUC prevention: inline style="opacity:0" hides content immediately.
   This animation overrides the inline opacity once the stylesheet is parsed,
   so content can never appear unstyled. */
.error-page {
  animation: error-reveal 0.35s ease 0.05s forwards;
}
@keyframes error-reveal {
  to { opacity: 1; }
}
@keyframes card-fall {
  0% { opacity: 0; transform: translateY(-24px) rotate(0deg); }
  60% { opacity: 1; transform: translateY(3px) rotate(-4deg); }
  100% { opacity: 1; transform: translateY(0) rotate(-3deg); }
}
@keyframes card-float {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-5px) rotate(-2deg); }
}
.error-fallen-card {
  animation: card-fall 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
}
.error-fallen-card > div {
  animation: card-float 4s ease-in-out 1s infinite;
}
</style>
