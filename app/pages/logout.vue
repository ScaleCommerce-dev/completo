<script setup lang="ts">
import { safeReturnPath } from '#shared/utils/return-path'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const { clear } = useUserSession()

onMounted(async () => {
  await $fetch('/auth/logout', { method: 'POST' }).catch(() => {})
  await clear()
  // "Not you?" on the consent page signs out to sign in as someone else, and the
  // MCP client is still waiting on that page: pass it on rather than drop it.
  const target = safeReturnPath(route.query.redirect, '')
  await navigateTo(target ? { path: '/login', query: { redirect: target } } : '/login')
})
</script>

<template>
  <div />
</template>
