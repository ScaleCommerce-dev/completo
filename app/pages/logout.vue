<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { clear } = useUserSession()

onMounted(async () => {
  await $fetch('/auth/logout', { method: 'POST' }).catch(() => {})
  await clear()
  await navigateTo('/login')
})
</script>

<template>
  <div />
</template>
