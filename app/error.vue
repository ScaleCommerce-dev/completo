<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode: number
    message?: string
  }
}>()

const is404 = computed(() => props.error.statusCode === 404)

const route = useRoute()

/**
 * Name the thing that wasn't found.
 *
 * Every 404 in the app used to say "Card not found" — including `/does-not-exist`,
 * a mistyped project slug, and a board or list that had been deleted. Three of the
 * four `showError` call sites aren't cards at all, and a wrong noun sends people
 * looking for the wrong problem: "card not found" on a project URL reads as a data
 * bug rather than a bad link.
 *
 * The route is the only thing that knows, so it decides. `/projects/{slug}` with no
 * further segment is the project itself.
 */
const MISSING = [
  [/^\/projects\/[^/]+\/cards\//, 'Card', 'This card has been deleted, or the ticket ID is wrong.'],
  [/^\/projects\/[^/]+\/boards\//, 'Board', 'This board has been deleted or renamed.'],
  [/^\/projects\/[^/]+\/lists\//, 'List', 'This list has been deleted or renamed.'],
  [/^\/projects\/[^/]+$/, 'Project', 'This project has been deleted, or you are not a member of it.']
] as const

const missing = computed(() => MISSING.find(([pattern]) => pattern.test(route.path)))

const title = computed(() => {
  if (!is404.value) return 'Something broke'
  return `${missing.value?.[1] ?? 'Page'} not found`
})

const subtitle = computed(() => {
  if (!is404.value) return props.error.message || 'An unexpected error occurred. Please try again.'
  return missing.value?.[2] ?? 'This URL is not a page, a project, or a card. It may have been moved, renamed, or never existed.'
})

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <!-- inline opacity:0 prevents FOUC — content stays invisible until
       the stylesheet loads and the error-reveal animation overrides it -->
  <div
    class="error-page fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden bg-canvas"
    style="opacity: 0"
  >
    <!-- The connect2scale canvas, nothing painted over it. The colour
         washes, glow and noise were Completo's own brand moment and mirrored
         the old sign-in page; under the company styleguide the brand gradient
         lives on the access pages' image area, and a dead end gets the plain
         content surface every other page has. -->
    <!-- Content -->
    <div class="relative z-10 w-full max-w-[380px] flex flex-col items-center text-center">
      <!-- Fallen card illustration -->
      <div class="error-fallen-card mb-6">
        <div class="w-[180px] rounded-xl bg-default border border-default shadow-raise p-3.5">
          <!-- Card header -->
          <div class="flex items-center justify-between mb-2.5">
            <span class="font-mono text-2xs font-bold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-md">
              ERR-{{ error.statusCode }}
            </span>
            <span class="w-2 h-2 rounded-full bg-error/60" />
          </div>
          <!-- Shimmer lines -->
          <div class="flex flex-col gap-1.5 mb-2.5">
            <div class="h-2 w-full rounded-md bg-elevated" />
            <div class="h-2 w-3/4 rounded-md bg-elevated" />
            <div class="h-2 w-1/2 rounded-md bg-elevated" />
          </div>
          <!-- Card footer -->
          <div class="flex items-center gap-1.5 pt-2 border-t border-muted">
            <div class="w-4 h-4 rounded-full bg-accented" />
            <div class="h-1.5 w-10 rounded-md bg-accented/60" />
          </div>
        </div>
      </div>

      <!-- Text + actions -->
      <h2 class="text-2xl font-display font-bold text-highlighted tracking-display mb-1.5">
        {{ title }}
      </h2>
      <p class="text-sm text-muted leading-relaxed mb-8">
        {{ subtitle }}
      </p>
      <UButton
        label="Back to home"
        icon="i-lucide-arrow-left"
        size="lg"
        @click="goHome"
      />
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
