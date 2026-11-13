<script setup lang="ts">
/**
 * All Projects, in the workspace's interface: the standard card grid, or
 * The tracker's projects table. Two components rather than one page with both,
 * so each runs only its own fetches (`useWorkspaceSettings`).
 */
definePageMeta({ layout: 'default' })

const { isTracker } = useWorkspaceSettings()
</script>

<template>
  <TrackerProjectsPage v-if="isTracker" />
  <StandardProjectsPage v-else />
</template>
