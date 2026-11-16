<script setup lang="ts">
/**
 * The line under an auth card that points to its neighbour: "Don't have an
 * account? Register", "Link expired? Request a new one". It was written out on
 * all five auth pages, identical but for the words and the target.
 */
defineProps<{
  prompt: string
  to: string
  label: string
}>()
</script>

<template>
  <div class="pb-6 pt-1">
    <div class="border-t border-muted pt-4">
      <p class="text-sm text-center text-muted">
        {{ prompt }}
        <NuxtLink
          :to="to"
          class="text-primary font-semibold hover:underline"
        >{{ label }}</NuxtLink>
      </p>
    </div>
  </div>
</template>
