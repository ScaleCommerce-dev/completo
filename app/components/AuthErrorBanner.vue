<script setup lang="ts">
/**
 * Inline feedback on the auth pages.
 *
 * The same markup existed as ten hand-rolled copies across the app — and
 * `login.vue` re-inlined this very banner three more times while importing this
 * component on the line below. Now a thin wrapper over UAlert, so the tone comes
 * from the theme and the default slot can carry an action (login's expired-token
 * banner offers "Resend verification email" inside it).
 *
 * `auth-field` keeps it in the staggered entrance sequence with the form fields.
 */
withDefaults(defineProps<{
  message?: string | null
  tone?: 'error' | 'success' | 'info'
  icon?: string
}>(), {
  tone: 'error'
})

const DEFAULT_ICONS = {
  error: 'i-lucide-alert-circle',
  success: 'i-lucide-circle-check',
  info: 'i-lucide-info'
}
</script>

<template>
  <UAlert
    v-if="message || $slots.default"
    class="auth-field"
    :color="tone"
    variant="subtle"
    :icon="icon || DEFAULT_ICONS[tone]"
    :description="message || undefined"
  >
    <template
      v-if="$slots.default"
      #description
    >
      <slot />
    </template>
  </UAlert>
</template>
