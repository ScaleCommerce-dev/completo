<script setup lang="ts">
/**
 * "Managed by" as a byline: 12px, a dimmed label, the manager's name muted beside
 * a 16px avatar. An agent with no manager says so in the warning colour, because
 * it is waiting on an admin to transfer it and cannot be woken until then.
 */
defineProps<{
  manager: { id: string, name: string, avatarUrl: string | null } | null | undefined
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1 text-xs min-w-0">
    <span class="text-dimmed shrink-0">Managed by</span>
    <template v-if="manager">
      <UiAvatar
        :src="manager.avatarUrl"
        :alt="manager.name"
        size="3xs"
        class="shrink-0"
      />
      <span class="font-medium text-muted truncate">{{ manager.name }}</span>
    </template>
    <span
      v-else
      class="font-medium text-warning"
    >nobody</span>
  </span>
</template>
