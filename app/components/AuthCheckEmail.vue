<script setup lang="ts">
/**
 * "Check your email": what an auth page turns into once it has sent a link, for
 * registration and for a password reset. The sentence differs (one link activates
 * an account, the other may not have been sent at all, so it must not say which),
 * so it is the slot; the card around it and the way back to sign-in are one.
 */
defineProps<{
  /** The way back, under the sentence: "Already verified?" + "Sign in". */
  prompt: string
  to: string
  label: string
}>()
</script>

<template>
  <div class="auth-glass">
    <div class="py-7 flex flex-col items-center gap-4 text-center">
      <div class="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
        <UIcon
          name="i-lucide-mail-check"
          class="text-success text-xl"
        />
      </div>
      <h2 class="auth-title">
        Check your email
      </h2>
      <p class="text-sm text-muted">
        <slot />
      </p>
      <div class="border-t border-muted pt-4 mt-2 w-full">
        <p class="text-sm text-center text-muted">
          {{ prompt }}
          <NuxtLink
            :to="to"
            class="text-primary font-semibold hover:underline"
          >{{ label }}</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
