<script setup lang="ts">
/** A saved calendar: the Calendar page with that calendar's name and filters. */
const route = useRoute()
</script>

<template>
  <CalendarPage :calendar-id="(route.params.id as string)" />
</template>
